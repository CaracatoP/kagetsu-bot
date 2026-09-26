const { AsyncLocalStorage } = require("node:async_hooks");
const context = new AsyncLocalStorage();
function endpoint(path = "") {
  return path
    .split("?")[0]
    .replace(/\/webhooks\/[^/]+\/[^/]+/g, "/webhooks/:id/:token")
    .replace(/\d{16,22}/g, ":id");
}
function observeDiscord(rest, logger) {
  rest.on("rateLimited", (data) =>
    logger.warn(
      {
        ...context.getStore(),
        operation: data.method,
        endpoint: endpoint(data.route),
        retryAfter: Math.ceil(data.timeToReset / 1000),
        cache: "sdk_queue",
        event: "discord_rate_wait",
        global: data.global,
      },
      "Discord REST aguardando limite",
    ),
  );
  rest.on("response", (request, response) => {
    if (response.status === 429)
      logger.warn(
        {
          ...context.getStore(),
          operation: request.method,
          endpoint: endpoint(request.route),
          status: 429,
          retryAfter:
            Number(
              response.headers.get("retry-after") ||
                response.headers.get("x-ratelimit-reset-after"),
            ) || null,
          cache: "sdk",
          event: "discord_429",
        },
        "Discord REST 429",
      );
  });
}
function retrySeconds(error) {
  if (error.status !== 429 && error.name !== "RateLimitError") return 0;
  return Math.max(
    1,
    Math.ceil(
      Number(error.retry_after || error.rawError?.retry_after) ||
        Number(error.retryAfter || error.timeToReset) / 1000 ||
        30,
    ),
  );
}
async function durableLock(pool, key, fn) {
  const db = await pool.connect();
  let locked = false;
  try {
    await db.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [key]);
    locked = true;
    // Autocommit checkpoints survive subsequent Discord failures; session lock serializes publishers.
    return await fn(db);
  } finally {
    let broken;
    try {
      if (locked)
        await db.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
          key,
        ]);
    } catch (error) {
      broken = error;
    }
    db.release(broken);
  }
}
module.exports = { context, observeDiscord, retrySeconds, durableLock };
