const { AttachmentBuilder } = require("discord.js");
const { createProfileCard } = require("../cards/profileCard");
const { cardData } = require("./cardData");
async function execute(context) {
  const data = await cardData(context),
    { member, config } = data;
  const roles = config.profile.roleIds
    .map((id) => member?.roles.cache.get(id)?.name)
    .filter(Boolean);
  const label = config.profile.labels.find((item) =>
    member?.roles.cache.has(item.roleId),
  );
  if (label) roles.unshift(label.name);
  data.selectedRoles = roles.join(" · ");
  data.joinedAt = member?.joinedTimestamp;
  const badges = config.profile.badges
    .filter((b) => !b.roleId || member?.roles.cache.has(b.roleId))
    .map((b) => `${b.emoji || ""} ${b.name}`.trim());
  if (context.guild.ownerId === context.user.id) badges.unshift("Owner");
  if (member?.premiumSince) badges.push("Booster");
  if (data.position === "1") badges.push("Top 1");
  const earned = (
    await context.services.pool.query(
      `SELECT r.data->>'name' AS name FROM member_achievements a JOIN guild_resources r ON r.guild_id=a.guild_id AND r.id=a.resource_id WHERE a.guild_id=$1 AND a.user_id=$2 ORDER BY a.earned_at DESC LIMIT 10`,
      [context.guild.id, context.user.id],
    )
  ).rows;
  data.badges = [...badges, ...earned.map((a) => a.name)].join(" · ");
  return {
    files: [
      new AttachmentBuilder(await createProfileCard(data), {
        name: "kagetsu-perfil.png",
      }),
    ],
  };
}
module.exports = { execute };
