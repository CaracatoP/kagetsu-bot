const { Events, MessageFlags } = require("discord.js");
const { commands, execute, slashCommands } = require("./commands");
const { randomXp } = require("./services/levelMath");
const {
  eligibleForXp,
  multiplier,
} = require("../packages/shared/progressions");
const { translate: t } = require("../packages/shared/i18n");
const { importLegacyGuild } = require("../packages/database/importLegacy");
const logger = require("../packages/shared/logger");
function attachHandlers(client, s) {
  let ready = false;
  const pending = new Set(),
    cooldowns = new Map();
  const on = (event, handler) =>
    client.on(event, (...args) => {
      if (!ready) return;
      const task = Promise.resolve()
        .then(() => handler(...args))
        .catch((err) => logger.error({ err, event }, "Evento Discord"));
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  async function prepare(guild) {
    await s.store.ensureGuild(guild.id, guild.name);
    await s.pool.query(
      "UPDATE guilds SET installed=true,name=$2,updated_at=NOW() WHERE id=$1",
      [guild.id, guild.name],
    );
    await importLegacyGuild(guild, s.store, s.pool);
    s.configs.invalidate(guild.id);
    await s.configs.get(guild.id);
  }
  async function register(guild) {
    try {
      const definitions = [...slashCommands, ...s.platform.slashCommands];
      const current = await guild.commands.fetch();
      const names = new Set(definitions.map((c) => c.name));
      const extras = current
        .filter((c) => !names.has(c.name))
        .map((c) => ({
          name: c.name,
          type: c.type,
          description: c.description,
          options: c.options,
          default_member_permissions:
            c.defaultMemberPermissions?.bitfield.toString() ?? null,
        }));
      await guild.commands.set([...extras, ...definitions]);
      logger.info({ guildId: guild.id }, "Slash commands registrados");
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "Registro de comandos");
    }
  }
  on(Events.InteractionCreate, async (i) => {
    if (await s.platform.handleInteraction(i)) return;
    if (!i.isChatInputCommand() || !commands[i.commandName]) return;
    const c = i.guildId ? await s.configs.get(i.guildId) : null;
    try {
      if (!i.inGuild()) {
        await i.reply({
          content: t("pt-BR", "guildOnly"),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!c.modules.levels) {
        await i.reply({
          content: t(c.general.locale, "disabled"),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const admin = i.commandName === "xp";
      await i.deferReply(
        admin || i.commandName === "prestige"
          ? { flags: MessageFlags.Ephemeral }
          : {},
      );
      const actor = admin
        ? await i.guild.members.fetch({ user: i.user.id, force: true })
        : i.member;
      await i.editReply(
        await execute(i.commandName, {
          guild: i.guild,
          actor,
          services: s,
          config: c,
          channel: i.channel,
          user: i.options.getUser("usuario") || i.user,
          operation: admin ? i.options.getSubcommand() : undefined,
          amount: admin ? i.options.getInteger("quantidade") : undefined,
          type:
            i.commandName === "leaderboard"
              ? i.options.getString("tipo") || "xp"
              : undefined,
        }),
      );
    } catch (err) {
      logger.error({ err }, "Comando slash");
      const payload = { content: t(c?.general.locale, "error") };
      await (
        i.deferred || i.replied
          ? i.editReply(payload)
          : i.reply({ ...payload, flags: MessageFlags.Ephemeral })
      ).catch(() => {});
    }
  });
  on(Events.MessageCreate, async (m) => {
    if (!m.inGuild() || m.author.bot) return;
    const c = await s.configs.get(m.guild.id);
    s.metrics.record(m.guild.id, m.author.id, { messages: 1 });
    if (await s.platform.onMessage(m, c)) return;
    if (m.content.startsWith(c.general.prefix)) {
      const tokens = m.content
        .slice(c.general.prefix.length)
        .trim()
        .split(/\s+/);
      let name = tokens[0].toLowerCase();
      if (name === "lb") name = "leaderboard";
      if (commands[name]) {
        if (!c.modules.levels) {
          await m.reply(t(c.general.locale, "disabled"));
          return;
        }
        try {
          const admin = name === "xp",
            actor = admin
              ? await m.guild.members.fetch({ user: m.author.id, force: true })
              : m.member;
          const mention = admin ? /^<@!?(\d+)>$/.exec(tokens[2] || "") : null;
          await m.reply(
            await execute(name, {
              guild: m.guild,
              actor,
              user: admin
                ? mention
                  ? m.mentions.users.get(mention[1])
                  : null
                : m.mentions.users.first() || m.author,
              services: s,
              config: c,
              channel: m.channel,
              operation: tokens[1]?.toLowerCase(),
              amount: admin && tokens.length === 4 ? tokens[3] : undefined,
              type: tokens[1] === "season" ? "season" : "xp",
            }),
          );
        } catch (err) {
          logger.error({ err }, "Comando prefixo");
          await m.reply(t(c.general.locale, "error")).catch(() => {});
        }
        return;
      }
    }
    if (!c.levels.chat.enabled || !eligibleForXp(m.member, m.channelId, c))
      return;
    const factor = multiplier(m.member, m.channelId, c);
    if (factor <= 0) return;
    const key = `${m.guild.id}:${m.author.id}`,
      now = Date.now();
    if ((cooldowns.get(key) || 0) > now) return;
    cooldowns.set(key, now + c.levels.chat.cooldownSeconds * 1000);
    await s.apply(
      m.member,
      {
        amount: Math.floor(
          randomXp(c.levels.chat.min, c.levels.chat.max) * factor,
        ),
        source: "chat",
        cooldownMs: c.levels.chat.cooldownSeconds * 1000,
        eligible: () => {
          const current = s.configs.peek(m.guild.id);
          return !!current && eligibleForXp(m.member, m.channelId, current);
        },
      },
      m.channel,
    );
  });
  on(Events.GuildMemberUpdate, async (old, m) => {
    s.voice.refreshGuild(m.guild);
    await s.platform.onMemberUpdate(old, m);
    const c = await s.configs.get(m.guild.id);
    const relevant = [
      ...c.progressions.map((p) => p.baseRoleId),
      ...c.rewards.map((r) => r.requiredRoleId),
      ...c.progressions.flatMap((p) => p.ranks.map((r) => r.requiredRoleId)),
    ].filter(Boolean);
    if (
      relevant.some((id) => old.roles.cache.has(id) !== m.roles.cache.has(id))
    )
      await s.ranks.sync(m);
  });
  on(Events.VoiceStateUpdate, async (old, state) => {
    await s.configs.get(state.guild.id);
    s.voice.refreshGuild(state.guild);
    await s.platform.onVoiceStateUpdate(old, state);
  });
  on(Events.GuildMemberAdd, s.platform.onMemberAdd);
  on(Events.GuildMemberRemove, s.platform.onMemberRemove);
  on(Events.MessageDelete, s.platform.onMessageDelete);
  on(Events.MessageUpdate, s.platform.onMessageUpdate);
  on(Events.MessageReactionAdd, s.platform.onReactionAdd);
  on(Events.MessageReactionRemove, s.platform.onReactionRemove);
  on(Events.GuildCreate, async (guild) => {
    await prepare(guild);
    s.voice.refreshGuild(guild);
    await register(guild);
  });
  on(Events.GuildDelete, async (guild) => {
    s.voice.clearGuild(guild.id);
    await s.pool.query("UPDATE guilds SET installed=false WHERE id=$1", [
      guild.id,
    ]);
  });
  on(Events.GuildUnavailable, (guild) => s.voice.clearGuild(guild.id));
  on(Events.ShardDisconnect, (_event, id) => {
    for (const guild of client.guilds.cache.values())
      if (guild.shardId === id) s.voice.clearGuild(guild.id);
  });
  s.configs.onInvalidate((id) => {
    s.voice.clearGuild(id);
    void s.configs
      .get(id)
      .catch((err) => logger.warn({ err }, "Atualização config"));
  });
  const cleanup = setInterval(() => {
    for (const [key, until] of cooldowns)
      if (until <= Date.now()) cooldowns.delete(key);
  }, 60000);
  cleanup.unref();
  return {
    async start() {
      for (const guild of client.guilds.cache.values()) await prepare(guild);
      ready = true;
      s.metrics.start();
      s.voice.start();
      await s.platform.start();
      for (const guild of client.guilds.cache.values()) await register(guild);
    },
    async stop() {
      ready = false;
      clearInterval(cleanup);
      s.voice.stop();
      await s.platform.stop();
      await Promise.allSettled([...pending]);
      await s.voice.drain();
      await s.metrics.stop();
    },
  };
}
module.exports = { attachHandlers };
