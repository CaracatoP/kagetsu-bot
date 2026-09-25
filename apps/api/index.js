require("dotenv").config({ quiet: true });

const pino = require("pino");

const {
  createDatabase,
  initDatabase,
} = require("../../packages/database");

const { createApp } = require("./app");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

async function main() {
  logger.info(
    {
      event: "api_starting",
      nodeEnv: process.env.NODE_ENV || "development",
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDiscordToken: Boolean(process.env.DISCORD_TOKEN),
      hasDiscordClientId: Boolean(process.env.DISCORD_CLIENT_ID),
      hasDiscordClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET),
      hasSessionSecret: Boolean(process.env.SESSION_SECRET),
      hasWebUrl: Boolean(process.env.WEB_URL),
      hasRailwayPort: Boolean(process.env.PORT),
    },
    "Iniciando Kagetsu API.",
  );

  const pool = createDatabase();

  logger.info(
    { event: "database_initializing" },
    "Inicializando banco de dados.",
  );

  await initDatabase(pool);

  logger.info(
    { event: "database_ready" },
    "Banco de dados inicializado.",
  );

  const app = createApp({ pool, logger });

  // Railway fornece PORT automaticamente.
  // 3001 serve apenas como fallback local.
  const port = Number(process.env.PORT || 3001);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT inválida: ${process.env.PORT}`);
  }

  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(
      {
        event: "api_started",
        host: "0.0.0.0",
        port,
      },
      "Kagetsu API iniciada.",
    );
  });

  server.on("error", (error) => {
    logger.error(
      {
        event: "api_server_error",
        errorName: error?.name,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorStack: error?.stack,
      },
      "Erro no servidor HTTP da API.",
    );
  });

  const cleanup = setInterval(() => {
    app.locals.auth.cleanup().catch((error) => {
      logger.warn(
        {
          event: "session_cleanup_failed",
          errorMessage: error?.message,
        },
        "Falha na limpeza de sessões.",
      );
    });
  }, 3600000);

  cleanup.unref();

  async function shutdown(signal) {
    logger.info(
      {
        event: "api_shutdown",
        signal,
      },
      "Encerrando Kagetsu API.",
    );

    clearInterval(cleanup);

    server.close(async () => {
      try {
        await pool.end();
        process.exit(0);
      } catch (error) {
        logger.error(
          {
            event: "database_shutdown_failed",
            errorMessage: error?.message,
            errorStack: error?.stack,
          },
          "Erro ao encerrar PostgreSQL.",
        );

        process.exit(1);
      }
    });

    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error) => {
    // console.error proposital para o Railway mostrar a exceção completa.
    console.error("==========================================");
    console.error("❌ KAGETSU API FALHOU DURANTE O STARTUP");
    console.error("Nome:", error?.name);
    console.error("Mensagem:", error?.message);
    console.error("Código:", error?.code);
    console.error("Stack:", error?.stack);
    console.error("Cause:", error?.cause);
    console.error("==========================================");

    logger.error(
      {
        event: "api_start_failed",
        errorName: error?.name,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorStack: error?.stack,
      },
      "API não iniciou.",
    );

    process.exit(1);
  });
}

module.exports = { main };