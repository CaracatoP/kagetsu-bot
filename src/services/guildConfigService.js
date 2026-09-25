const logger = require("../../packages/shared/logger");
function createGuildConfigService(pool, store, { ttl = 60000 } = {}) {
  const cache = new Map(),
    pending = new Map(),
    listeners = new Set();
  let connection,
    stopped = false,
    reconnect;
  function invalidate(id) {
    cache.delete(id);
    for (const fn of listeners) fn(id);
  }
  async function get(id) {
    const hit = cache.get(id);
    if (hit && hit.expires > Date.now()) return hit.config;
    if (pending.has(id)) return pending.get(id);
    const task = store
      .getConfig(id)
      .then((row) => {
        cache.set(id, { config: row.config, expires: Date.now() + ttl });
        return row.config;
      })
      .finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  }
  async function start() {
    if (stopped) return;
    try {
      connection = await pool.connect();
      connection.on("notification", (event) => {
        if (event.channel === "kagetsu_config") invalidate(event.payload);
      });
      connection.once("error", (err) => {
        logger.warn({ err }, "Config listener disconnected");
        connection?.release(true);
        connection = null;
        if (!stopped) reconnect = setTimeout(() => void start(), 5000);
      });
      await connection.query("LISTEN kagetsu_config");
    } catch (err) {
      logger.warn({ err }, "Config listener");
      if (!stopped) reconnect = setTimeout(() => void start(), 5000);
    }
  }
  async function stop() {
    stopped = true;
    clearTimeout(reconnect);
    if (connection) {
      await connection.query("UNLISTEN kagetsu_config").catch(() => {});
      connection.release();
      connection = null;
    }
  }
  return {
    get,
    peek: (id) => cache.get(id)?.config,
    invalidate,
    start,
    stop,
    onInvalidate: (fn) => listeners.add(fn),
  };
}
module.exports = { createGuildConfigService };
