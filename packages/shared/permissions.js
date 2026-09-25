const { PermissionFlagsBits: P } = require("discord.js");
const dangerousPermissions = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageChannels,
  P.ManageWebhooks,
  P.BanMembers,
  P.KickMembers,
  P.ModerateMembers,
  P.ManageMessages,
  P.MentionEveryone,
  P.ManageThreads,
  P.ManageEvents,
];
const dangerousMask = dangerousPermissions.reduce((a, b) => a | b, 0n);
module.exports = { dangerousPermissions, dangerousMask };
