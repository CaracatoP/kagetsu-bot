const { createHash } = require("node:crypto");
const { commandEnabled } = require("../../packages/shared/modules");
const { durableLock } = require("../platform/discordReliability");
function definitions(config) {
  const xp = require("../commands").slashCommands;
  const platform = require("../platform").slashCommands;
  const moderation = new Set(
    require("../platform/moderation").slashCommands.map((c) => c.name),
  );
  return [...xp, ...platform]
    .filter(
      (c) =>
        commandEnabled(config, c.name) &&
        (!moderation.has(c.name) || config.modules.moderation === true),
    )
    .map((c) => {
      const copy = { ...c };
      delete copy.contexts;
      delete copy.integration_types;
      delete copy.dm_permission;
      return copy;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
async function syncCommands(ctx, guild) {
  return durableLock(ctx.pool, `commands:${guild.id}`, async (db) => {
    const { config } = await ctx.store.getConfig(guild.id);
    const commands = definitions(config);
    const hash = createHash("sha256")
      .update(JSON.stringify(commands))
      .digest("hex");
    const previous = (
      await db.query(
        "SELECT command_hash FROM guild_command_sync WHERE guild_id=$1",
        [guild.id],
      )
    ).rows[0];
    if (previous?.command_hash === hash)
      return { unchanged: true, count: commands.length };
    await guild.commands.set(commands);
    await db.query(
      "INSERT INTO guild_command_sync(guild_id,command_hash,command_count) VALUES($1,$2,$3) ON CONFLICT(guild_id) DO UPDATE SET command_hash=$2,command_count=$3,synced_at=NOW()",
      [guild.id, hash, commands.length],
    );
    return { count: commands.length, hash };
  });
}
module.exports = { definitions, syncCommands };
