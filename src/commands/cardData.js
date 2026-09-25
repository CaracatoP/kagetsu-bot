const { rewardsFor } = require("../../packages/shared/progressions");
async function cardData({ guild, user, services }) {
  const [member, data, config] = await Promise.all([
    guild.members.fetch(user.id).catch(() => null),
    services.xp.getCardData(guild.id, user.id),
    services.configs.get(guild.id),
  ]);
  const info = rewardsFor(member, config, data.level, data.xp);
  return {
    ...data,
    user,
    member,
    faction: info.active.map((p) => p.name).join(" / "),
    rank: info.rank?.name,
    theme: config.appearance,
    curve: config.levels.curve,
    locale: config.general.locale,
    config,
  };
}
module.exports = { cardData };
