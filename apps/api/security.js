const crypto = require("node:crypto");
const { ApiError } = require("./errors");
function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function constantEqual(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function createSecurity(secret) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("SESSION_SECRET deve conter pelo menos 32 caracteres.");
  const key = crypto.createHash("sha256").update(secret).digest();
  return {
    hash: digest,
    random: () => crypto.randomBytes(32).toString("base64url"),
    csrf: (sessionId) =>
      crypto
        .createHmac("sha256", key)
        .update(`csrf:${sessionId}`)
        .digest("base64url"),
    encrypt: (data) => {
      const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const content = Buffer.concat([
        cipher.update(JSON.stringify(data), "utf8"),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), content]
        .map((v) => v.toString("base64url"))
        .join(".");
    },
    decrypt: (value) => {
      const [iv, tag, content] = value
        .split(".")
        .map((v) => Buffer.from(v, "base64url"));
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([decipher.update(content), decipher.final()]).toString(
          "utf8",
        ),
      );
    },
  };
}
function csrfGuard({ security, origin }) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (
      req.get("origin") !== origin ||
      !req.auth ||
      !constantEqual(req.get("x-csrf-token"), security.csrf(req.auth.sessionId))
    )
      return next(
        new ApiError(
          403,
          "CSRF_INVALID",
          "A sessão expirou ou a origem da requisição é inválida.",
        ),
      );
    next();
  };
}
module.exports = { createSecurity, digest, constantEqual, csrfGuard };
