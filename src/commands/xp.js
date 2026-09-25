const { PermissionFlagsBits } = require("discord.js");
function canManage(member) {
  return (
    !!member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
    !!member?.permissions.has(PermissionFlagsBits.Administrator)
  );
}
function validate(operation, amount) {
  const value = String(amount ?? "");
  if (
    !["add", "remove", "set"].includes(operation) ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    (operation !== "set" && BigInt(value) === 0n)
  ) {
    return "Use xp add|remove|set @usuario quantidade. A quantidade deve ser um inteiro entre 1 e 9007199254740991 (set aceita 0).";
  }
  return null;
}
async function execute({
  guild,
  actor,
  user,
  operation,
  amount,
  services,
  channel,
}) {
  if (!canManage(actor))
    return {
      content: "❌ Você precisa de Gerenciar Servidor ou Administrador.",
    };
  const error = validate(operation, amount);
  if (error) return { content: `❌ ${error}` };
  if (!user) return { content: "❌ Informe um usuário do servidor." };
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member || member.user.bot)
    return { content: "❌ O alvo deve ser um membro humano deste servidor." };
  const change = await services.apply(
    member,
    { operation, amount: BigInt(amount) },
    channel,
  );
  await services.store.audit(
    guild.id,
    actor.id,
    "xp.admin",
    user.id,
    { xp: change.oldXp.toString() },
    { xp: change.xp.toString(), operation },
  );
  await services.platform.log(
    guild,
    "xp",
    `${actor.user?.username || actor.id}: ${operation} · <@${user.id}> · ${change.oldXp} → ${change.xp} XP`,
  );
  return {
    content:
      `🌙 XP de <@${user.id}> atualizado.\nXP antigo: **${change.oldXp.toLocaleString("pt-BR")}**\nXP novo: **${change.xp.toLocaleString("pt-BR")}**\nNível: **${change.level}**` +
      (change.rankResult.ok
        ? ""
        : "\n⚠️ XP salvo; não foi possível sincronizar os cargos. Verifique permissões, hierarquia e configuração; os detalhes estão no console."),
  };
}
module.exports = { execute, canManage, validate };
