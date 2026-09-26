const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { ensureFonts } = require("./fonts");
ensureFonts();
const { totalXpForLevel } = require("../services/levelMath");
const colors = {
  text: "#f4f2ff",
  muted: "#a6abc8",
  purple: "#b49aff",
  blue: "#83beff",
};
const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
function truncate(ctx, value, width) {
  const text = String(value ?? "").replace(/[\r\n\t]/g, " ");
  if (ctx.measureText(text).width <= width) return text;
  const parts = [...segmenter.segment(text)].map((part) => part.segment);
  while (parts.length && ctx.measureText(parts.join("") + "…").width > width)
    parts.pop();
  return ctx.measureText("…").width <= width ? parts.join("") + "…" : "";
}
function text(
  ctx,
  value,
  x,
  y,
  width,
  size = 22,
  color = colors.text,
  bold = false,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px "Kagetsu Sans", "Kagetsu Emoji", sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(truncate(ctx, value, width), x, y);
}
function roundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function crescent(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = colors.purple;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.arc(r * 0.45, -r * 0.15, r * 0.88, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
}
function base(height, label, theme = {}) {
  const canvas = createCanvas(1100, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = theme.background || "#070910";
  ctx.fillRect(0, 0, 1100, height);
  const glow = ctx.createRadialGradient(970, 20, 0, 970, 20, 600);
  glow.addColorStop(0, "#28234e");
  glow.addColorStop(1, "#070910");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1100, height);
  roundRect(ctx, 24, 24, 1052, height - 48, 24, "#101321");
  ctx.strokeStyle = "#343354";
  ctx.lineWidth = 1;
  ctx.stroke();
  crescent(ctx, 65, 63, 17);
  text(ctx, theme.name || "K A G E T S U", 98, 69, 500, 22, colors.text, true);
  text(ctx, label, 700, 69, 330, 15, colors.muted);
  ctx.fillStyle = "#292e47";
  ctx.fillRect(54, 94, 992, 1);
  return { canvas, ctx };
}
async function avatar(ctx, user, x, y, size) {
  let image;
  try {
    const url = user.displayAvatarURL({ extension: "png", size: 256 });
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Avatar indisponível");
    image = await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    /* Avatar opcional: o card sempre continua disponível. */
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#353052";
  ctx.fillRect(x, y, size, size);
  if (image) ctx.drawImage(image, x, y, size, size);
  else {
    text(
      ctx,
      "K",
      x + size * 0.3,
      y + size * 0.7,
      size * 0.6,
      size * 0.58,
      colors.purple,
      true,
    );
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = colors.purple;
  ctx.lineWidth = 2;
  ctx.stroke();
}
function progress(ctx, xp, level, x, y, width, curve, theme = {}) {
  xp = BigInt(xp);
  const current = xp - totalXpForLevel(level, curve);
  const needed =
    totalXpForLevel(level + 1, curve) - totalXpForLevel(level, curve);
  const capped = curve?.type === "custom" && level >= curve.thresholds.length;
  const ratio = capped
    ? 1
    : Math.max(0, Math.min(1, Number(current) / Number(needed)));
  text(
    ctx,
    `${current.toLocaleString("pt-BR")} / ${needed.toLocaleString("pt-BR")} XP`,
    x,
    y,
    width - 115,
    20,
    colors.muted,
  );
  text(
    ctx,
    `${(ratio * 100).toFixed(1)}%`,
    x + width - 100,
    y,
    100,
    20,
    colors.blue,
    true,
  );
  roundRect(ctx, x, y + 18, width, 14, 7, "#252940");
  if (ratio > 0) {
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, theme.primary || "#9a74f5");
    gradient.addColorStop(1, theme.secondary || "#7bb8fa");
    roundRect(
      ctx,
      x,
      y + 18,
      Math.max(1, width * ratio),
      14,
      theme.barStyle === "square" ? 0 : Math.min(7, (width * ratio) / 2),
      gradient,
    );
    if (theme.barStyle === "segments") {
      ctx.fillStyle = "#101321";
      for (let i = 1; i < 20; i++)
        ctx.fillRect(x + (width * i) / 20, y + 18, 3, 14);
    }
  }
}
async function decorate(ctx, theme = {}) {
  const { isSafeImageUrl } = require("../../packages/shared/validation");
  for (const kind of ["backgroundUrl", "logoUrl"]) {
    const url = theme[kind];
    if (!url || !isSafeImageUrl(url)) continue;
    try {
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      });
      if (
        !response.ok ||
        !/^image\/(png|jpeg|webp)/.test(
          response.headers.get("content-type") || "",
        )
      )
        continue;
      const reader = response.body.getReader(),
        parts = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Imagem grande");
        }
        parts.push(chunk.value);
      }
      const image = await loadImage(Buffer.concat(parts));
      if (image.width > 4096 || image.height > 4096) continue;
      ctx.save();
      if (kind === "backgroundUrl") {
        ctx.globalAlpha = 0.15;
        ctx.drawImage(image, 25, 96, 1050, ctx.canvas.height - 122);
      } else {
        ctx.fillStyle = "#101321";
        ctx.fillRect(43, 40, 43, 43);
        ctx.drawImage(image, 44, 42, 40, 40);
      }
      ctx.restore();
    } catch {
      /* Branding unavailable: retain Kagetsu fallback. */
    }
  }
}
function factionLabel(progression) {
  return progression || "Sem progressão";
}
module.exports = {
  colors,
  truncate,
  text,
  roundRect,
  base,
  avatar,
  progress,
  factionLabel,
  decorate,
};
