const { Pool } = require("pg");
const fs = require("node:fs/promises");
const path = require("node:path");
const logger = require("../shared/logger");
function createDatabase(
  connectionString = process.env.DATABASE_URL,
  options = {},
) {
  const ssl = process.env.DATABASE_SSL || "auto";
  const pool = new Pool({
    connectionString,
    ssl:
      ssl === "true" ||
      (ssl === "auto" && connectionString?.includes("railway"))
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
          }
        : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
    ...options,
  });
  pool.on("error", (err) => logger.error({ err }, "PostgreSQL pool"));
  return pool;
}
async function transaction(pool, work) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await work(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
async function initDatabase(pool) {
  await transaction(pool, async (connection) => {
    await connection.query("SELECT pg_advisory_xact_lock(719426003)");
    await connection.query(`CREATE TABLE IF NOT EXISTS user_levels (
      guild_id TEXT NOT NULL,user_id TEXT NOT NULL,xp BIGINT NOT NULL DEFAULT 0,level INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id))`);
    await connection.query(
      `ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS last_chat_at TIMESTAMPTZ,ADD COLUMN IF NOT EXISTS last_voice_at TIMESTAMPTZ`,
    );
    await connection.query(
      "CREATE INDEX IF NOT EXISTS user_levels_guild_xp_idx ON user_levels(guild_id,xp DESC)",
    );
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const files = (await fs.readdir(path.join(__dirname, "migrations")))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const name of files) {
      if (
        (
          await connection.query(
            "SELECT 1 FROM schema_migrations WHERE name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      await connection.query(
        await fs.readFile(path.join(__dirname, "migrations", name), "utf8"),
      );
      await connection.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      logger.info({ migration: name }, "Migration aplicada");
    }
  });
}
module.exports = { createDatabase, transaction, initDatabase };
