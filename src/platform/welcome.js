const { AttachmentBuilder } = require("discord.js");
const { embed, mentionless } = require("./common");
const {
  renderTemplate,
  welcomeData,
} = require("../../packages/shared/welcome");
const { base, text, avatar, decorate } = require("../cards/shared");
async function welcomePayload(member, config, leaving = false) {
  const settings = config.welcome,
    design = (leaving ? settings.leaveDesign : settings.design) || {},
    data = welcomeData(member);
  const format = leaving ? settings.leaveType || "text" : settings.type;
  const content = renderTemplate(
    leaving ? settings.leaveMessage : settings.message,
    data,
  );
  const payload = {};
  if (format === "text" || format === "mixed") payload.content = content;
  if (format === "embed" || format === "mixed")
    payload.embeds = [
      embed({
        ...design,
        title: renderTemplate(design.title || member.guild.name, data),
        description: renderTemplate(design.description || content, data),
        footer: renderTemplate(design.footer, data),
      }),
    ];
  if (format === "card") {
    const theme = {
      ...config.appearance,
      backgroundUrl: design.backgroundUrl || config.appearance.backgroundUrl,
    };
    const { canvas, ctx } = base(
      350,
      leaving ? "ATÉ A PRÓXIMA" : "BOAS-VINDAS",
      theme,
    );
    await decorate(ctx, theme);
    ctx.fillStyle = `rgba(0,0,0,${design.overlay ?? 0.25})`;
    ctx.fillRect(24, 105, 1052, 220);
    if (design.showAvatar !== false)
      await avatar(ctx, member.user, 65, 133, 130);
    if (design.showName !== false)
      text(ctx, data.displayName, 235, 181, 780, 32, design.color || "#f4f2ff");
    text(
      ctx,
      renderTemplate(design.description || content, {
        ...data,
        user: data.displayName,
      }),
      235,
      234,
      780,
      20,
    );
    payload.files = [
      new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: leaving ? "leave.png" : "welcome.png",
      }),
    ];
  }
  return mentionless(payload);
}
module.exports = { welcomePayload };
