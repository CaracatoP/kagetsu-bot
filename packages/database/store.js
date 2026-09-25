const { randomUUID } = require("node:crypto");
const { transaction } = require("./index");
const { defaultConfig } = require("../shared/defaults");
function conflict() {
  return Object.assign(
    new Error("Configuração alterada por outra pessoa. Atualize a página."),
    { status: 409 },
  );
}
function missing() {
  return Object.assign(new Error("Recurso não encontrado neste servidor."), {
    status: 404,
  });
}
function createStore(pool) {
  async function ensureGuild(id, name = "") {
    await pool.query(
      `INSERT INTO guilds(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET
      name=CASE WHEN EXCLUDED.name='' THEN guilds.name ELSE EXCLUDED.name END`,
      [id, name],
    );
    await pool.query(
      "INSERT INTO guild_settings(guild_id,config) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, JSON.stringify(defaultConfig())],
    );
  }
  async function getConfig(id) {
    let { rows } = await pool.query(
      "SELECT config,version FROM guild_settings WHERE guild_id=$1",
      [id],
    );
    if (!rows[0]) {
      await ensureGuild(id);
      ({ rows } = await pool.query(
        "SELECT config,version FROM guild_settings WHERE guild_id=$1",
        [id],
      ));
    }
    return rows[0];
  }
  async function writeAudit(db, gid, uid, action, target, oldValue, newValue) {
    await db.query(
      `INSERT INTO audit_logs(guild_id,user_id,action,target,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        gid,
        uid,
        action,
        String(target ?? ""),
        oldValue === undefined ? null : JSON.stringify(oldValue),
        newValue === undefined ? null : JSON.stringify(newValue),
      ],
    );
  }
  async function saveConfig(gid, config, uid, version) {
    await ensureGuild(gid);
    return transaction(pool, async (db) => {
      const {
        rows: [old],
      } = await db.query(
        "SELECT config,version FROM guild_settings WHERE guild_id=$1 FOR UPDATE",
        [gid],
      );
      if (version !== undefined && old.version !== version) throw conflict();
      const {
        rows: [saved],
      } = await db.query(
        "UPDATE guild_settings SET config=$2,version=version+1,updated_at=NOW() WHERE guild_id=$1 RETURNING config,version",
        [gid, JSON.stringify(config)],
      );
      // XP is immutable during curve changes; stored levels are recalculated atomically.
      if (
        JSON.stringify(old.config.levels.curve) !==
        JSON.stringify(config.levels.curve)
      ) {
        await db.query(
          "UPDATE user_levels SET level=kagetsu_level(xp,$2::jsonb) WHERE guild_id=$1",
          [gid, JSON.stringify(config.levels.curve)],
        );
      }
      await writeAudit(db, gid, uid, "config.update", gid, old.config, config);
      await db.query("SELECT pg_notify('kagetsu_config',$1)", [gid]);
      return saved;
    });
  }
  async function listResources(gid, kind) {
    return (
      await pool.query(
        "SELECT * FROM guild_resources WHERE guild_id=$1 AND ($2::text IS NULL OR kind=$2) ORDER BY created_at DESC",
        [gid, kind || null],
      )
    ).rows;
  }
  async function getResource(gid, id, kind) {
    return (
      (
        await pool.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 AND ($3::text IS NULL OR kind=$3)",
          [gid, id, kind || null],
        )
      ).rows[0] || null
    );
  }
  async function saveResource(gid, kind, data, uid, id, version) {
    return transaction(pool, async (db) => {
      let old;
      if (id) {
        old = (
          await db.query(
            "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 AND kind=$3 FOR UPDATE",
            [gid, id, kind],
          )
        ).rows[0];
        if (!old) throw missing();
        if (version !== undefined && old.version !== version) throw conflict();
      }
      const resourceId = id || randomUUID();
      const query = old
        ? "UPDATE guild_resources SET data=$3,version=version+1,updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING *"
        : "INSERT INTO guild_resources(guild_id,id,data,kind) VALUES($1,$2,$3,$4) RETURNING *";
      const params = [gid, resourceId, JSON.stringify(data)];
      if (!old) params.push(kind);
      const {
        rows: [row],
      } = await db.query(query, params);
      await writeAudit(
        db,
        gid,
        uid,
        `${kind}.${old ? "update" : "create"}`,
        resourceId,
        old?.data,
        data,
      );
      await db.query("SELECT pg_notify('kagetsu_config',$1)", [gid]);
      return row;
    });
  }
  async function deleteResource(gid, id, uid) {
    return transaction(pool, async (db) => {
      const old = (
        await db.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 FOR UPDATE",
          [gid, id],
        )
      ).rows[0];
      if (!old) throw missing();
      if (old.message_id || old.status === "published")
        throw Object.assign(
          new Error("Despublique a mensagem antes de excluir."),
          { status: 409 },
        );
      // Preserve history/resources referenced by seasons, achievements, tickets.
      if (
        ["season", "achievement", "mission", "ticket_panel"].includes(old.kind)
      ) {
        await db.query(
          "UPDATE guild_resources SET status='closed',updated_at=NOW() WHERE guild_id=$1 AND id=$2",
          [gid, id],
        );
      } else {
        await db.query(
          "DELETE FROM guild_resources WHERE guild_id=$1 AND id=$2",
          [gid, id],
        );
      }
      await writeAudit(db, gid, uid, `${old.kind}.delete`, id, old.data, null);
      await db.query("SELECT pg_notify('kagetsu_config',$1)", [gid]);
      return old;
    });
  }
  async function enqueue(gid, uid, action, payload) {
    return (
      await pool.query(
        "INSERT INTO bot_jobs(id,guild_id,actor_id,action,payload) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), gid, uid, action, JSON.stringify(payload)],
      )
    ).rows[0];
  }
  return {
    ensureGuild,
    getConfig,
    saveConfig,
    listResources,
    getResource,
    saveResource,
    deleteResource,
    enqueue,
    audit: (...args) => writeAudit(pool, ...args),
  };
}
module.exports = { createStore };
