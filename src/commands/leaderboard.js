const { AttachmentBuilder } = require("discord.js");
const { createLeaderboardCard } = require("../cards/leaderboardCard");
const { translate: t } = require("../../packages/shared/i18n");
async function execute({ guild, services, type = "xp" }) {
  const config = await services.configs.get(guild.id);
  const users = await services.xp.getLeaderboard(guild.id, type);
  if (!users.length)
    return { content: t(config.general.locale, "emptyLeaderboard") };
  return {
    files: [
      new AttachmentBuilder(
        await createLeaderboardCard({
          guild,
          users,
          theme: config.appearance,
          type,
        }),
        { name: "kagetsu-leaderboard.png" },
      ),
    ],
  };
}
module.exports = { execute };
