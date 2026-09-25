const {
  base,
  text,
  avatar,
  progress,
  colors,
  factionLabel,
  roundRect,
  decorate,
} = require("./shared");
const { translate: t } = require("../../packages/shared/i18n");
async function createProfileCard({
  user,
  xp,
  level,
  faction,
  rank,
  position,
  badges,
  selectedRoles,
  joinedAt,
  theme = {},
  curve,
  locale = "pt-BR",
}) {
  const { canvas, ctx } = base(620, t(locale, "profile"), theme);
  await decorate(ctx, theme);
  await avatar(ctx, user, 66, 130, 132);
  text(
    ctx,
    user.globalName || user.username,
    235,
    165,
    785,
    37,
    colors.text,
    true,
  );
  text(
    ctx,
    `${factionLabel(faction)}  /  ${rank || "Sem rank"}`,
    235,
    207,
    785,
    24,
    colors.purple,
  );
  text(
    ctx,
    `Posição global no servidor #${position ?? "—"}`,
    235,
    246,
    785,
    20,
    colors.muted,
  );
  const fields = [
    ["NÍVEL", level.toLocaleString("pt-BR")],
    ["XP TOTAL", BigInt(xp).toLocaleString("pt-BR")],
    [t(locale, "badges"), badges || t(locale, "none")],
    [t(locale, "roles"), selectedRoles || t(locale, "none")],
  ];
  fields.forEach(([label, value], index) => {
    const x = 60 + (index % 2) * 500,
      y = 291 + Math.floor(index / 2) * 95;
    roundRect(ctx, x, y, 480, 79, 12, "#191d30");
    text(ctx, label, x + 20, y + 26, 440, 12, colors.muted);
    text(
      ctx,
      value,
      x + 20,
      y + 59,
      440,
      24,
      index < 2 ? colors.blue : colors.text,
      true,
    );
  });
  progress(ctx, xp, level, 64, 525, 972, curve, theme);
  text(
    ctx,
    joinedAt
      ? `${t(locale, "joined")} ${new Date(joinedAt).toLocaleDateString(locale)}`
      : theme.name || "KAGETSU",
    64,
    582,
    960,
    12,
    colors.muted,
  );
  return canvas.toBuffer("image/png");
}
module.exports = { createProfileCard };
