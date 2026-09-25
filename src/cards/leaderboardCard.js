const { base, text, avatar, roundRect, colors, decorate } = require("./shared");
async function createLeaderboardCard({
  guild,
  users,
  theme = {},
  type = "xp",
}) {
  const { canvas, ctx } = base(
    170 + users.length * 85,
    type === "season" ? "SEASON / TOP 10" : "RANKING / TOP 10",
    theme,
  );
  await decorate(ctx, theme);
  text(ctx, guild.name, 60, 132, 980, 22, colors.purple, true);
  const members = await Promise.all(
    users.map((entry) => guild.members.fetch(entry.user_id).catch(() => null)),
  );
  for (let i = 0; i < users.length; i++) {
    const entry = users[i],
      member = members[i],
      y = 151 + i * 85;
    roundRect(ctx, 49, y, 1002, 72, 12, i === 0 ? "#292344" : "#191d30");
    text(
      ctx,
      `#${entry.position || i + 1}`,
      66,
      y + 45,
      85,
      25,
      colors.purple,
      true,
    );
    await avatar(ctx, member?.user || {}, 164, y + 12, 48);
    text(
      ctx,
      member?.displayName || member?.user?.username || "Usuário desconhecido",
      238,
      y + 31,
      480,
      22,
      colors.text,
      true,
    );
    text(ctx, `Nível ${entry.level}`, 238, y + 57, 480, 17, colors.muted);
    text(
      ctx,
      `${BigInt(entry.xp).toLocaleString("pt-BR")} XP`,
      746,
      y + 44,
      280,
      20,
      colors.blue,
    );
  }
  return canvas.toBuffer("image/png");
}
module.exports = { createLeaderboardCard };
