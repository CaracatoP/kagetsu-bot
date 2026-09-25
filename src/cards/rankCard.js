const {
  base,
  text,
  avatar,
  progress,
  colors,
  factionLabel,
  decorate,
} = require("./shared");
const { translate: t } = require("../../packages/shared/i18n");
async function createRankCard({
  user,
  xp,
  level,
  faction,
  rank,
  position,
  theme = {},
  curve,
  locale = "pt-BR",
}) {
  const { canvas, ctx } = base(440, "PROGRESS / RANK", theme);
  await decorate(ctx, theme);
  await avatar(ctx, user, 66, 135, 168);
  text(ctx, `#${position ?? "—"}`, 65, 359, 190, 34, colors.blue, true);
  text(ctx, t(locale, "position"), 65, 387, 195, 13, colors.muted);
  text(
    ctx,
    user.globalName || user.username,
    280,
    156,
    730,
    38,
    colors.text,
    true,
  );
  text(
    ctx,
    t(locale, "progression").toUpperCase(),
    282,
    203,
    240,
    13,
    colors.muted,
  );
  text(
    ctx,
    factionLabel(faction),
    282,
    234,
    280,
    24,
    theme.primary || colors.purple,
    true,
  );
  text(ctx, "RANK", 610, 203, 400, 13, colors.muted);
  text(ctx, rank || "Sem rank", 610, 234, 405, 24, colors.text, true);
  text(
    ctx,
    `${t(locale, "level")} ${level.toLocaleString(locale)}`,
    282,
    287,
    730,
    29,
    colors.text,
    true,
  );
  progress(ctx, xp, level, 282, 334, 730, curve, theme);
  text(ctx, "A próxima fase começa com você.", 282, 395, 730, 14, colors.muted);
  return canvas.toBuffer("image/png");
}
module.exports = { createRankCard };
