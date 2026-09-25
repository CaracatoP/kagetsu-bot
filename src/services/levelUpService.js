const { escapeMarkdown } = require("discord.js");
const logger = require("../../packages/shared/logger");
function createLevelUpService(configs) {
  return async function announce({
    member,
    change,
    rankResult,
    fallbackChannel,
  }) {
    if (change.level <= change.oldLevel) return;
    const config = await configs.get(member.guild.id),
      en = config.general.locale === "en-US";
    const content =
      `🌙 <@${member.id}> ${en ? "reached level" : "alcançou o nível"} **${change.level}**!` +
      (rankResult?.ok &&
      rankResult.changed &&
      rankResult.level === change.level &&
      rankResult.rankName
        ? `\n✨ ${en ? "New rank" : "Novo rank"}: **${escapeMarkdown(rankResult.rankName)}**`
        : "");
    const channels = [];
    if (config.levels.levelUpChannelId)
      channels.push(
        await member.guild.channels
          .fetch(config.levels.levelUpChannelId)
          .catch(() => null),
      );
    channels.push(fallbackChannel, member.guild.systemChannel);
    const seen = new Set();
    for (const channel of channels) {
      if (
        !channel ||
        channel.guild?.id !== member.guild.id ||
        seen.has(channel.id) ||
        !channel.isSendable?.()
      )
        continue;
      seen.add(channel.id);
      try {
        await channel.send({
          content,
          allowedMentions: {
            users: [member.id],
            roles: [],
            repliedUser: false,
          },
        });
        return;
      } catch (err) {
        logger.warn(
          { err, guildId: member.guild.id },
          "Canal de level-up indisponível",
        );
      }
    }
  };
}
module.exports = { createLevelUpService };
