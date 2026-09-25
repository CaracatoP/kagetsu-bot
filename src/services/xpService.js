const { transaction } = require("../database/db");
const { calculateLevel, MAX_XP } = require("./levelMath");
const { createStore } = require("../../packages/database/store");
function createXpService(pool, configs) {
  const store = createStore(pool);
  const configFor = async (id) =>
    configs ? configs.get(id) : (await store.getConfig(id)).config;
  async function getUserData(guildId, userId) {
    const config = await configFor(guildId);
    const { rows } = await pool.query(
      "SELECT xp FROM user_levels WHERE guild_id=$1 AND user_id=$2",
      [guildId, userId],
    );
    const xp = BigInt(rows[0]?.xp || 0);
    return { xp, level: calculateLevel(xp, config.levels.curve) };
  }
  async function getCardData(guildId, userId) {
    const config = await configFor(guildId);
    const { rows } = await pool.query(
      `SELECT COALESCE((SELECT xp FROM user_levels WHERE guild_id=$1 AND user_id=$2),0) AS xp,
      (SELECT COUNT(*)+1 FROM user_levels WHERE guild_id=$1 AND xp>COALESCE((SELECT xp FROM user_levels WHERE guild_id=$1 AND user_id=$2),0)) AS position`,
      [guildId, userId],
    );
    const xp = BigInt(rows[0].xp);
    return {
      xp,
      level: calculateLevel(xp, config.levels.curve),
      position: rows[0].position,
    };
  }
  async function activeSeason(gid, db = pool) {
    return (
      await db.query(
        `SELECT * FROM guild_resources WHERE guild_id=$1 AND kind='season' AND status='published'
      AND (COALESCE(published_data,data)->>'startsAt')::timestamptz<=NOW() AND (COALESCE(published_data,data)->>'endsAt')::timestamptz>NOW() ORDER BY created_at LIMIT 1`,
        [gid],
      )
    ).rows[0];
  }
  async function getLeaderboard(gid, type = "xp") {
    const config = await configFor(gid);
    let rows;
    if (type === "season") {
      if (!config.modules.seasons) return [];
      const season = await activeSeason(gid);
      if (!season) return [];
      rows = (
        await pool.query(
          `SELECT user_id,xp,RANK() OVER(ORDER BY xp DESC) AS position FROM member_season_xp WHERE guild_id=$1 AND season_id=$2 ORDER BY xp DESC,user_id LIMIT 10`,
          [gid, season.id],
        )
      ).rows;
    } else
      rows = (
        await pool.query(
          `SELECT user_id,xp,RANK() OVER(ORDER BY xp DESC) AS position FROM user_levels WHERE guild_id=$1 ORDER BY xp DESC,user_id LIMIT 10`,
          [gid],
        )
      ).rows;
    return rows.map((row) => ({
      ...row,
      xp: BigInt(row.xp),
      level: calculateLevel(row.xp, config.levels.curve),
    }));
  }
  async function change({
    guildId,
    userId,
    operation = "add",
    amount,
    source,
    cooldownMs = 0,
    eligible,
    db: provided,
  }) {
    amount = BigInt(amount);
    if (
      !["add", "remove", "set"].includes(operation) ||
      amount < 0n ||
      amount > MAX_XP
    )
      throw new Error("Alteração de XP inválida.");
    if (source && !["chat", "voice", "mission"].includes(source))
      throw new Error("Origem de XP inválida.");
    await configFor(guildId);
    const work = async (db) => {
      const config = (
        await db.query(
          "SELECT config FROM guild_settings WHERE guild_id=$1 FOR SHARE",
          [guildId],
        )
      ).rows[0].config;
      if (
        source &&
        (!config.modules.levels ||
          (source === "chat" && !config.levels.chat.enabled) ||
          (source === "voice" && !config.levels.voice.enabled))
      )
        return null;
      await db.query(
        "INSERT INTO user_levels(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [guildId, userId],
      );
      const {
        rows: [row],
      } = await db.query(
        "SELECT xp,last_chat_at,last_voice_at FROM user_levels WHERE guild_id=$1 AND user_id=$2 FOR UPDATE",
        [guildId, userId],
      );
      if (source === "chat" || source === "voice") {
        const {
          rows: [clock],
        } = await db.query("SELECT clock_timestamp() AS now");
        const previous =
          row[source === "chat" ? "last_chat_at" : "last_voice_at"];
        if (previous && clock.now.getTime() - previous.getTime() < cooldownMs)
          return null;
      }
      if (eligible && !eligible()) return null;
      const oldXp = BigInt(row.xp);
      let xp =
        operation === "set"
          ? amount
          : operation === "add"
            ? oldXp + amount
            : oldXp - amount;
      if (xp < 0n) xp = 0n;
      if (xp > MAX_XP)
        throw new Error("O total excederia o limite de XP do PostgreSQL.");
      const level = calculateLevel(xp, config.levels.curve);
      await db.query(
        `UPDATE user_levels SET xp=$3,level=$4,updated_at=NOW(),
        last_chat_at=CASE WHEN $5='chat' THEN clock_timestamp() ELSE last_chat_at END,
        last_voice_at=CASE WHEN $5='voice' THEN clock_timestamp() ELSE last_voice_at END WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId, xp.toString(), level, source || null],
      );
      if (config.modules.seasons && source && xp > oldXp) {
        const season = await activeSeason(guildId, db);
        if (season)
          await db.query(
            `INSERT INTO member_season_xp(guild_id,season_id,user_id,xp,lifetime_xp) VALUES($1,$2,$3,$4,$4)
          ON CONFLICT(guild_id,season_id,user_id) DO UPDATE SET xp=LEAST(9223372036854775807::numeric,member_season_xp.xp::numeric+$4::numeric),
          lifetime_xp=LEAST(9223372036854775807::numeric,member_season_xp.lifetime_xp::numeric+$4::numeric)`,
            [guildId, season.id, userId, (xp - oldXp).toString()],
          );
      }
      return {
        oldXp,
        xp,
        oldLevel: calculateLevel(oldXp, config.levels.curve),
        level,
      };
    };
    return provided ? work(provided) : transaction(pool, work);
  }
  async function prestige(gid, uid) {
    return transaction(pool, async (db) => {
      const config = (
        await db.query(
          "SELECT config FROM guild_settings WHERE guild_id=$1 FOR SHARE",
          [gid],
        )
      ).rows[0]?.config;
      if (!config?.modules.prestige || !config.modules.seasons)
        throw new Error("Prestígio sazonal desativado.");
      const season = await activeSeason(gid, db);
      if (!season) throw new Error("Não há temporada ativa.");
      const row = (
        await db.query(
          "SELECT * FROM member_season_xp WHERE guild_id=$1 AND season_id=$2 AND user_id=$3 FOR UPDATE",
          [gid, season.id, uid],
        )
      ).rows[0];
      if (
        !row ||
        calculateLevel(row.xp, config.levels.curve) < config.prestige.maxLevel
      )
        throw new Error("Nível sazonal insuficiente.");
      return (
        await db.query(
          "UPDATE member_season_xp SET xp=0,prestige=prestige+1 WHERE guild_id=$1 AND season_id=$2 AND user_id=$3 RETURNING prestige",
          [gid, season.id, uid],
        )
      ).rows[0];
    });
  }
  return {
    getUserData,
    getCardData,
    getLeaderboard,
    change,
    activeSeason,
    prestige,
  };
}
module.exports = { createXpService };
