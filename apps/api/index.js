require("dotenv").config({ quiet: true });
const pino = require("pino");
const { createDatabase, initDatabase } = require("../../packages/database");
const { createApp } = require("./app");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
async function main() {
  const pool = createDatabase();
  await initDatabase(pool);
  const app = createApp({ pool, logger });
  const port = Number(process.env.API_PORT || process.env.PORT || 3001);
  const server = app.listen(port, () =>
    logger.info({ port }, "Kagetsu API iniciada."),
  );
  const cleanup = setInterval(
    () =>
      app.locals.auth
        .cleanup()
        .catch(() =>
          logger.warn(
            { event: "session_cleanup_failed" },
            "Falha na limpeza de sessões.",
          ),
        ),
    3600000,
  );
  cleanup.unref();
  async function shutdown() {
    clearInterval(cleanup);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
if (require.main === module)
  main().catch((error) => {
    logger.error(
      { event: "api_start_failed", message: error.message },
      "API não iniciou.",
    );
    process.exitCode = 1;
  });
module.exports = { main };
