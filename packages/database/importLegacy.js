const { randomUUID } = require("node:crypto");
const logger = require("../shared/logger");
async function importLegacyGuild(guild, store, pool) {
  const state = (
    await pool.query("SELECT legacy_imported FROM guilds WHERE id=$1", [
      guild.id,
    ])
  ).rows[0];
  if (state?.legacy_imported) return false;
  const old = require("./legacyConfig");
  const bases = [old.SLAYER_ROLE, old.DEMON_ROLE].filter(Boolean);
  // Discord snowflakes are globally unique. Never apply legacy config to a different guild.
  if (!bases.length || !bases.every((id) => guild.roles.cache.has(id)))
    return false;
  const { config, version } = await store.getConfig(guild.id);
  if (version > 1 || config.progressions.length) return false;
  const names = Object.keys(old.RANKS);
  config.progressions = names.map((key, index) => ({
    id: randomUUID(),
    name: key[0].toUpperCase() + key.slice(1),
    emoji: "",
    baseRoleId: bases[index],
    exclusiveGroup: "legacy-progression",
    mode: "highest",
    ranks: old.RANKS[key]
      .filter((rank) => rank.roleId)
      .map((rank) => ({
        ...rank,
        id: randomUUID(),
        xp: "0",
        requiredRoleId: "",
      })),
  }));
  config.levels.requireProgression = true;
  config.levels.chat = {
    enabled: true,
    min: old.XP.min,
    max: old.XP.max,
    cooldownSeconds: old.XP.cooldownMs / 1000,
  };
  config.levels.voice = { ...old.VOICE_XP };
  config.levels.levelUpChannelId = old.LEVEL_UP_CHANNEL_ID;
  config.profile.roleIds = old.SPECIAL_ROLE_IDS;
  config.profile.labels = [
    ["PvP & PvE", old.GAME_STYLE_ROLES.both],
    ["PvP", old.GAME_STYLE_ROLES.pvp],
    ["PvE", old.GAME_STYLE_ROLES.pve],
  ]
    .filter(([, id]) => id)
    .map(([name, roleId]) => ({ name, roleId }));
  await store.saveConfig(guild.id, config, "migration", version);
  await pool.query("UPDATE guilds SET legacy_imported=true WHERE id=$1", [
    guild.id,
  ]);
  logger.info(
    { guildId: guild.id },
    "Configuração anterior importada para o servidor",
  );
  return true;
}
module.exports = { importLegacyGuild };
