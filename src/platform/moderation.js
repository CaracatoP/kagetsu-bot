const { P, UserError, locked, mentionless } = require("./common");

const actionPermissions = {
  ban: P.BanMembers,
  kick: P.KickMembers,
  timeout: P.ModerateMembers,
  warn: P.ModerateMembers,
  warnings: P.ModerateMembers,
  clear: P.ManageMessages,
  slowmode: P.ManageChannels,
  lock: P.ManageChannels,
  unlock: P.ManageChannels,
};
const userOption = {
  name: "usuario",
  description: "Membro do servidor",
  type: 6,
  required: true,
};
const reasonOption = {
  name: "motivo",
  description: "Motivo registrado no histórico",
  type: 3,
  max_length: 500,
};
const definitions = {
  ban: ["Banir um membro", [userOption, reasonOption]],
  kick: ["Expulsar um membro", [userOption, reasonOption]],
  timeout: [
    "Aplicar timeout",
    [
      userOption,
      {
        name: "minutos",
        description: "Duração em minutos (até 28 dias)",
        type: 4,
        required: true,
        min_value: 1,
        max_value: 40320,
      },
      reasonOption,
    ],
  ],
  warn: ["Registrar advertência", [userOption, reasonOption]],
  warnings: ["Consultar advertências", [userOption]],
  clear: [
    "Apagar até 100 mensagens recentes",
    [
      {
        name: "quantidade",
        description: "Quantidade",
        type: 4,
        required: true,
        min_value: 1,
        max_value: 100,
      },
    ],
  ],
  slowmode: [
    "Configurar intervalo entre mensagens",
    [
      {
        name: "segundos",
        description: "Intervalo (0 desativa)",
        type: 4,
        required: true,
        min_value: 0,
        max_value: 21600,
      },
    ],
  ],
  lock: ["Bloquear envio para everyone neste canal", []],
  unlock: ["Restaurar permissão anterior deste canal", []],
};
const slashCommands = Object.entries(definitions).map(
  ([name, [description, options]]) => ({
    name,
    description,
    options,
    dm_permission: false,
    default_member_permissions: actionPermissions[name].toString(),
  }),
);
function validInteger(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new UserError(`${name}: informe um inteiro entre ${min} e ${max}.`);
  return value;
}
function assertTarget(guild, actor, target, me) {
  if (
    !target ||
    target.id === guild.ownerId ||
    target.id === actor.id ||
    target.id === me.id ||
    me.roles.highest.comparePositionTo(target.roles.highest) <= 0 ||
    (actor.id !== guild.ownerId &&
      actor.id !== me.id &&
      actor.roles.highest.comparePositionTo(target.roles.highest) <= 0)
  )
    throw new UserError(
      "A hierarquia de cargos impede esta ação sobre este membro.",
    );
}
function ruleMatches(rule, message, samples) {
  const threshold = rule.threshold || (rule.type === "mentions" ? 5 : 5);
  const recent = samples.filter(
    (entry) => entry.at > Date.now() - (rule.windowSeconds || 8) * 1000,
  );
  if (rule.type === "spam") return recent.length >= threshold;
  if (rule.type === "flood")
    return (
      recent.filter((entry) => entry.content === message.content.toLowerCase())
        .length >= threshold
    );
  if (rule.type === "invite")
    return /(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/i.test(
      message.content,
    );
  if (rule.type === "mentions")
    return (
      message.mentions.users.size +
        message.mentions.roles.size +
        (message.mentions.everyone ? threshold : 0) >=
      threshold
    );
  if (rule.type === "words")
    return (rule.words || []).some(
      (word) =>
        word &&
        message.content.toLocaleLowerCase().includes(word.toLocaleLowerCase()),
    );
  return false;
}
function createModeration(ctx) {
  const recent = new Map(),
    punished = new Map();
  async function record(
    guild,
    action,
    userId,
    actorId,
    reason,
    metadata = {},
    db = ctx.pool,
  ) {
    const { rows } = await db.query(
      "INSERT INTO moderation_cases(guild_id,target_user,moderator,reason,action,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [guild.id, userId, actorId, reason.slice(0, 500), action, metadata],
    );
    return rows[0];
  }
  async function perform(guild, actorId, data, system = false) {
    const action = data.action,
      required = actionPermissions[action];
    if (!required) throw new UserError("Ação de moderação inválida.");
    const config = await ctx.configs.get(guild.id);
    if (!system && !config.modules.moderation)
      throw new UserError("Módulo de moderação desativado.");
    const me = await guild.members.fetchMe();
    const moderator = system
      ? me
      : await guild.members.fetch({ user: actorId, force: true });
    if (!moderator.permissions.has(required) || !me.permissions.has(required))
      throw new UserError(
        "O responsável ou o bot não possui a permissão necessária.",
      );
    const reason = String(data.reason || "Sem motivo informado").slice(0, 500);
    if (["clear", "slowmode", "lock", "unlock"].includes(action)) {
      const channel = await guild.channels
        .fetch(data.channelId)
        .catch(() => null);
      if (
        !channel ||
        !channel.permissionsFor(me)?.has(required) ||
        !channel.permissionsFor(moderator)?.has(required)
      )
        throw new UserError("Permissões insuficientes neste canal.");
      if (action === "clear") {
        if (!channel.bulkDelete)
          throw new UserError("Este canal não permite exclusão em lote.");
        const removed = await channel.bulkDelete(
          validInteger(data.amount, 1, 100, "Quantidade"),
          true,
        );
        await record(guild, action, channel.id, moderator.id, reason, {
          count: removed.size,
        });
        return `${removed.size} mensagens apagadas. Mensagens com mais de 14 dias são preservadas.`;
      }
      if (action === "slowmode")
        await channel.setRateLimitPerUser(
          validInteger(data.seconds, 0, 21600, "Segundos"),
          reason,
        );
      else
        await locked(
          ctx.pool,
          `channel:${guild.id}:${channel.id}`,
          async (db) => {
            if (action === "lock") {
              const overwrite = channel.permissionOverwrites.cache.get(
                guild.id,
              );
              const previous = overwrite?.allow.has(P.SendMessages)
                ? true
                : overwrite?.deny.has(P.SendMessages)
                  ? false
                  : null;
              await db.query(
                "INSERT INTO channel_lock_snapshots(guild_id,channel_id,send_messages) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                [guild.id, channel.id, previous],
              );
              await channel.permissionOverwrites.edit(
                guild.id,
                { SendMessages: false },
                { reason },
              );
            } else {
              const { rows } = await db.query(
                "SELECT send_messages FROM channel_lock_snapshots WHERE guild_id=$1 AND channel_id=$2",
                [guild.id, channel.id],
              );
              if (!rows.length)
                throw new UserError(
                  "Este canal não foi bloqueado pelo Kagetsu.",
                );
              await channel.permissionOverwrites.edit(
                guild.id,
                { SendMessages: rows[0].send_messages },
                { reason },
              );
              await db.query(
                "DELETE FROM channel_lock_snapshots WHERE guild_id=$1 AND channel_id=$2",
                [guild.id, channel.id],
              );
            }
          },
        );
      await record(guild, action, channel.id, moderator.id, reason);
      return "Canal atualizado.";
    }
    if (!/^\d{5,25}$/.test(data.userId || ""))
      throw new UserError("Membro inválido.");
    if (action === "warnings") {
      const { rows } = await ctx.pool.query(
        "SELECT id,reason,created_at FROM moderation_cases WHERE guild_id=$1 AND target_user=$2 AND action='warn' ORDER BY created_at DESC LIMIT 20",
        [guild.id, data.userId],
      );
      return rows.length
        ? rows
            .map((row) => `#${row.id}: ${row.reason}`)
            .join("\n")
            .slice(0, 1900)
        : "Nenhuma advertência.";
    }
    return locked(
      ctx.pool,
      `moderation:${guild.id}:${data.userId}`,
      async (db) => {
        const target = await guild.members
          .fetch({ user: data.userId, force: true })
          .catch(() => null);
        assertTarget(guild, moderator, target, me);
        if (action === "ban") await target.ban({ reason });
        if (action === "kick") await target.kick(reason);
        if (action === "timeout") {
          if (!target.moderatable)
            throw new UserError("Este membro não pode receber timeout.");
          await target.timeout(
            validInteger(data.minutes, 1, 40320, "Minutos") * 60_000,
            reason,
          );
        }
        const entry = await record(
          guild,
          action,
          target.id,
          moderator.id,
          reason,
          { minutes: data.minutes },
          db,
        );
        if (action === "warn") {
          const { rows } = await db.query(
            "SELECT COUNT(*)::int AS count FROM moderation_cases WHERE guild_id=$1 AND target_user=$2 AND action='warn'",
            [guild.id, target.id],
          );
          const rule = (config.moderation?.warnRules || []).find(
            (item) => item.count === rows[0].count,
          );
          if (rule) {
            if (
              rule.action === "ban" &&
              me.permissions.has(P.BanMembers) &&
              target.bannable
            ) {
              await target.ban({
                reason: `Kagetsu: ${rule.count} advertências`,
              });
              await record(
                guild,
                "ban",
                target.id,
                me.id,
                `Regra de ${rule.count} advertências`,
                {},
                db,
              );
            }
            if (
              rule.action === "timeout" &&
              me.permissions.has(P.ModerateMembers) &&
              target.moderatable
            ) {
              await target.timeout(
                validInteger(rule.durationMinutes || 60, 1, 40320, "Minutos") *
                  60_000,
                `Kagetsu: ${rule.count} advertências`,
              );
              await record(
                guild,
                "timeout",
                target.id,
                me.id,
                `Regra de ${rule.count} advertências`,
              );
            }
          }
        }
        return `Caso #${entry.id} registrado.`;
      },
    );
  }
  async function run(guild, actorId, data, system = false) {
    const result = await perform(guild, actorId, data, system);
    await ctx.log(
      guild,
      "moderation",
      `${data.action} · <@${data.userId || actorId}> · ${result}`,
    );
    return result;
  }
  async function interaction(interaction) {
    const result = await run(interaction.guild, interaction.user.id, {
      action: interaction.commandName,
      userId: interaction.options.getUser("usuario")?.id,
      reason: interaction.options.getString("motivo"),
      minutes: interaction.options.getInteger("minutos"),
      amount: interaction.options.getInteger("quantidade"),
      seconds: interaction.options.getInteger("segundos"),
      channelId: interaction.channelId,
    });
    await interaction.editReply(mentionless({ content: result }));
  }
  async function automod(message, config) {
    const options = config.automod || {},
      member = message.member;
    if (
      !member ||
      member.permissions.has(P.ManageGuild) ||
      (options.whitelistChannelIds || []).includes(message.channelId) ||
      (options.whitelistRoleIds || []).some((id) => member.roles.cache.has(id))
    )
      return false;
    const key = `${message.guild.id}:${member.id}`,
      now = Date.now(),
      samples = (recent.get(key) || []).filter(
        (item) => now - item.at < 300_000,
      );
    samples.push({ at: now, content: message.content.toLowerCase() });
    recent.set(key, samples.slice(-100));
    const rule = (options.rules || []).find(
      (item) => item.enabled && ruleMatches(item, message, samples),
    );
    if (!rule) return false;
    if (rule.action === "delete") {
      if (message.deletable) await message.delete();
      return true;
    }
    if ((punished.get(key) || 0) > now) return true;
    punished.set(key, now + 30_000);
    await run(
      message.guild,
      ctx.client.user.id,
      {
        action: rule.action,
        userId: member.id,
        reason: `AutoMod: ${rule.type}`,
        minutes: rule.durationMinutes || 10,
      },
      true,
    );
    return true;
  }
  function cleanup() {
    const now = Date.now();
    for (const [key, value] of recent)
      if (value.at(-1)?.at < now - 300_000) recent.delete(key);
    for (const [key, until] of punished) if (until <= now) punished.delete(key);
  }
  return { run, interaction, automod, cleanup };
}
module.exports = {
  createModeration,
  slashCommands,
  actionPermissions,
  assertTarget,
  ruleMatches,
};
