require("dotenv").config({ quiet: true });
const { createDatabase, initDatabase } = require("../packages/database");
async function main() {
  const pool = createDatabase();
  try {
    const exists = (
      await pool.query("SELECT to_regclass('user_levels') AS table_name")
    ).rows[0].table_name;
    const before = exists
      ? (
          await pool.query(
            "SELECT COUNT(*)::text AS count,COALESCE(SUM(xp),0)::text AS xp FROM user_levels",
          )
        ).rows[0]
      : null;
    await initDatabase(pool);
    const after = (
      await pool.query(
        "SELECT COUNT(*)::text AS count,COALESCE(SUM(xp),0)::text AS xp FROM user_levels",
      )
    ).rows[0];
    if (before && (before.count !== after.count || before.xp !== after.xp))
      throw new Error(
        "Os dados de XP mudaram durante a migration; verifique se outro bot está ativo.",
      );
    console.log(
      "Migrations concluídas. Contagem de membros e soma do XP preservadas.",
    );
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
