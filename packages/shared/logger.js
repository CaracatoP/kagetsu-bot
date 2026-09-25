const pino = require("pino");
module.exports = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "token",
      "secret",
      "password",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "DATABASE_URL",
      "DISCORD_TOKEN",
      "access_token",
      "refresh_token",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: (error) => ({
      type: error?.name,
      code: error?.code,
      message: String(error?.message || "Erro interno").replace(
        /(postgres(?:ql)?:\/\/)[^\s]+/gi,
        "$1[REDACTED]",
      ),
    }),
  },
});
