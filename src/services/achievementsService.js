const { DateTime } = require("luxon");
const { transaction } = require("../database/db");
const { createResourceCache } = require("../platform/common");
function attachAchievements({
  pool,
  configs,
  store,
  metrics,
  xp,
  ranks,
  client,
}) {
  const cache = createResourceCache(store);
  configs.onInvalidate((id) => cache.invalidate(id));
  metrics.onFlush(async (gid, uid) => {
    const config = await configs.get(gid);
    if (!config.modules.achievements && !config.modules.missions) return;
    const data = await xp.getUserData(gid, uid);
    const stats = (
      await pool.query(
        "SELECT COALESCE(SUM(messages),0) AS messages,FLOOR(COALESCE(SUM(voice_seconds),0)/60)::bigint AS minutes FROM analytics_daily WHERE guild_id=$1 AND user_id=$2",
        [gid, uid],
      )
    ).rows[0];
    if (config.modules.achievements)
      for (const r of await cache.list(gid, "achievement")) {
        if (r.status !== "published") continue;
        const d = r.published_data || r.data;
        const count =
          d.condition === "level"
            ? data.level
            : d.condition === "messages"
              ? stats.messages
              : stats.minutes;
        if (BigInt(count) >= BigInt(d.value))
          await pool.query(
            "INSERT INTO member_achievements(guild_id,resource_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [gid, r.id, uid],
          );
      }
    if (config.modules.missions && config.modules.levels)
      for (const r of await cache.list(gid, "mission")) {
        if (r.status !== "published") continue;
        const d = r.published_data || r.data;
        const date = DateTime.now().setZone(config.general.timezone),
          since = (
            d.period === "weekly" ? date.startOf("week") : date
          ).toISODate();
        const current = (
          await pool.query(
            "SELECT COALESCE(SUM(messages),0) AS messages,FLOOR(COALESCE(SUM(voice_seconds),0)/60)::bigint AS minutes FROM analytics_daily WHERE guild_id=$1 AND user_id=$2 AND day >= $3",
            [gid, uid, since],
          )
        ).rows[0];
        if (
          BigInt(
            d.condition === "messages" ? current.messages : current.minutes,
          ) < BigInt(d.value)
        )
          continue;
        const changed = await transaction(pool, async (db) => {
          const claim = await db.query(
            "INSERT INTO mission_claims(guild_id,resource_id,user_id,period,xp) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING xp",
            [gid, r.id, uid, since, d.rewardXp],
          );
          if (!claim.rowCount) return null;
          return xp.change({
            guildId: gid,
            userId: uid,
            amount: d.rewardXp,
            source: "mission",
            db,
          });
        });
        if (changed) {
          const member = await client.guilds.cache
            .get(gid)
            ?.members.fetch(uid)
            .catch(() => null);
          if (member) await ranks.sync(member);
          metrics.record(gid, uid, { xp: changed.xp - changed.oldXp });
        }
      }
  });
}
module.exports = { attachAchievements };
