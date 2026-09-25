const { DateTime } = require("luxon");
const logger = require("../../packages/shared/logger");
function createMetricsService(pool, configs) {
  const buffer = new Map(),
    listeners = new Set();
  let timer,
    busy = false;
  function record(gid, uid, values) {
    const timezone = configs.peek(gid)?.general.timezone || "UTC",
      day = DateTime.now().setZone(timezone).toISODate();
    const key = `${gid}:${uid}:${day}`,
      row = buffer.get(key) || {
        gid,
        uid,
        day,
        messages: 0n,
        voiceSeconds: 0n,
        xp: 0n,
        joins: 0n,
        leaves: 0n,
      };
    for (const name of ["messages", "voiceSeconds", "xp", "joins", "leaves"])
      row[name] += BigInt(values[name] || 0);
    buffer.set(key, row);
  }
  async function flush() {
    if (busy) return;
    busy = true;
    try {
      const entries = [...buffer.entries()];
      for (const [key, row] of entries) {
        buffer.delete(key);
        try {
          await pool.query(
            `INSERT INTO analytics_daily(guild_id,user_id,day,messages,voice_seconds,xp,joins,leaves) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(guild_id,user_id,day) DO UPDATE SET messages=analytics_daily.messages+$4,voice_seconds=analytics_daily.voice_seconds+$5,
        xp=LEAST(9223372036854775807::numeric,analytics_daily.xp::numeric+$6::numeric),joins=analytics_daily.joins+$7,leaves=analytics_daily.leaves+$8`,
            [
              row.gid,
              row.uid,
              row.day,
              ...["messages", "voiceSeconds", "xp", "joins", "leaves"].map(
                (k) => row[k].toString(),
              ),
            ],
          );
          for (const listener of listeners) await listener(row.gid, row.uid);
        } catch (err) {
          logger.warn({ err }, "Analytics flush");
        }
      }
    } finally {
      busy = false;
    }
  }
  return {
    record,
    flush,
    onFlush: (fn) => listeners.add(fn),
    start() {
      timer = setInterval(() => void flush(), 60000);
      timer.unref();
    },
    async stop() {
      clearInterval(timer);
      while (busy) await new Promise((r) => setTimeout(r, 50));
      await flush();
    },
  };
}
module.exports = { createMetricsService };
