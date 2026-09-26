const PLACEHOLDERS = [
  "user",
  "username",
  "displayName",
  "server",
  "memberCount",
  "userId",
];
function renderTemplate(value, data) {
  return String(value || "").replace(
    /\{(user|username|displayName|server|memberCount|userId)\}/g,
    (_, key) => String(data[key] ?? ""),
  );
}
function welcomeData(member) {
  return {
    user: `<@${member.id}>`,
    username: member.user.username,
    displayName:
      member.displayName || member.user.globalName || member.user.username,
    userId: member.id,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}
module.exports = { PLACEHOLDERS, renderTemplate, welcomeData };
