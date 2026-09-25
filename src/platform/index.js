const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { createRoles } = require("./roles");
const { createTickets } = require("./tickets");
const {
  createModeration,
  slashCommands: moderationCommands,
} = require("./moderation");
const { createEngagement } = require("./engagement");
const { createAutomation } = require("./automation");
const {
  UserError,
  t,
  channel,
  embed,
  actor,
  locked,
  nonce,
  mentionless,
  createResourceCache,
} = require("./common");
const logger = require("../../packages/shared/logger");
const kindModule = {
  role_panel: "roles",
  ticket_panel: "tickets",
  suggestion: "suggestions",
  event: "events",
  giveaway: "giveaways",
  custom_command: "customCommands",
  scheduled_message: "scheduler",
  season: "seasons",
  achievement: "achievements",
  mission: "missions",
};
const slashCommands = [
  ...moderationCommands,
  { name: "help", description: "Comandos dos módulos ativos", options: [] },
  {
    name: "sugerir",
    description: "Enviar uma sugestão",
    options: [
      {
        type: 3,
        name: "texto",
        description: "Sua sugestão",
        required: true,
        max_length: 2000,
      },
    ],
  },
  {
    name: "sala",
    description: "Gerenciar sua sala temporária",
    options: [
      {
        type: 1,
        name: "nome",
        description: "Renomear",
        options: [
          {
            type: 3,
            name: "valor",
            description: "Nome",
            required: true,
            max_length: 100,
          },
        ],
      },
      {
        type: 1,
        name: "limite",
        description: "Limite de membros",
        options: [
          {
            type: 4,
            name: "valor",
            description: "0 sem limite",
            required: true,
            min_value: 0,
            max_value: 99,
          },
        ],
      },
      { type: 1, name: "lock", description: "Trancar" },
      { type: 1, name: "unlock", description: "Destrancar" },
      {
        type: 1,
        name: "expulsar",
        description: "Desconectar membro",
        options: [
          { type: 6, name: "usuario", description: "Membro", required: true },
        ],
      },
    ],
  },
];
function createPlatform(options) {
  const ctx = {
    ...options,
    resources: createResourceCache(options.store),
    requireActor: actor,
  };
  let timer,
    running = false,
    stopped = false;
  async function log(guild, event, content) {
    const config = await ctx.configs.get(guild.id);
    const id = config.modules.logs && config.logs.channels[event];
    if (!id) return;
    try {
      await (
        await channel(guild, id)
      ).send(
        mentionless({
          embeds: [
            embed({
              title: `Kagetsu · ${event}`,
              description: String(content).slice(0, 4000),
            }),
          ],
        }),
      );
    } catch (err) {
      logger.warn({ err, guildId: guild.id, event }, "Log Discord");
    }
  }
  ctx.log = log;
  const roles = createRoles(ctx),
    tickets = createTickets(ctx),
    moderation = createModeration(ctx),
    engage = createEngagement(ctx),
    automation = createAutomation(ctx);
  ctx.configs.onInvalidate?.((id) => ctx.resources.invalidate(id));
  async function publish(guild, id, actorId, jobId) {
    return locked(ctx.pool, `resource:${guild.id}`, async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 FOR UPDATE",
          [guild.id, id],
        )
      ).rows[0];
      if (!r) throw new UserError("Recurso removido.");
      const config = await ctx.configs.get(guild.id),
        module = kindModule[r.kind];
      if (module && !config.modules[module])
        throw new UserError("Módulo desativado.");
      let payload;
      if (r.kind === "role_panel") payload = await roles.validate(guild, r);
      else if (r.kind === "ticket_panel") payload = tickets.payload(r);
      else if (["suggestion", "event", "giveaway"].includes(r.kind))
        payload = await engage.payload({ ...r, published_data: null }, db);
      else if (r.kind === "embed")
        payload = mentionless({
          embeds: [embed(r.data)],
          components: r.data.buttons?.length
            ? [
                new ActionRowBuilder().addComponents(
                  r.data.buttons.map((b) =>
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Link)
                      .setLabel(b.label)
                      .setURL(b.url),
                  ),
                ),
              ]
            : [],
        });
      else if (
        ![
          "custom_command",
          "scheduled_message",
          "season",
          "achievement",
          "mission",
        ].includes(r.kind)
      )
        throw new UserError("Tipo não publicável.");
      if (payload) {
        const dest = await channel(guild, r.data.channelId);
        if (r.message_id) {
          if (r.channel_id !== dest.id)
            throw new UserError("Despublique antes de trocar o canal.");
          await (await dest.messages.fetch(r.message_id)).edit(payload);
        } else {
          const msg = await dest.send({
            ...payload,
            nonce: nonce(jobId || r.id),
            enforceNonce: true,
          });
          r.channel_id = dest.id;
          r.message_id = msg.id;
        }
        if (r.kind === "role_panel" && r.data.type === "reactions") {
          const msg = await dest.messages.fetch(r.message_id);
          await msg.reactions.removeAll();
          for (const opt of r.data.options) await msg.react(opt.emoji);
        }
      }
      if (r.kind === "season") {
        const overlapping = (
          await db.query(
            `SELECT id FROM guild_resources WHERE guild_id=$1 AND id<>$2 AND kind='season' AND status='published' AND (data->>'startsAt')::timestamptz<$4::timestamptz AND (data->>'endsAt')::timestamptz>$3::timestamptz`,
            [guild.id, r.id, r.data.startsAt, r.data.endsAt],
          )
        ).rowCount;
        if (overlapping)
          throw new UserError("Já existe uma temporada neste período.");
      }
      if (r.kind === "scheduled_message")
        await db.query(
          `INSERT INTO community_schedules(guild_id,resource_id,actor_id,next_run_at) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,resource_id) DO UPDATE SET actor_id=$3,next_run_at=$4,status='pending',last_error=NULL`,
          [guild.id, r.id, actorId, r.data.runAt],
        );
      await db.query(
        "UPDATE guild_resources SET status='published',published_data=data,channel_id=$3,message_id=$4,updated_at=NOW() WHERE guild_id=$1 AND id=$2",
        [guild.id, r.id, r.channel_id, r.message_id],
      );
      return {
        resourceId: r.id,
        channelId: r.channel_id,
        messageId: r.message_id,
      };
    });
  }
  async function unpublish(guild, id) {
    return locked(ctx.pool, `resource:${guild.id}:${id}`, async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 FOR UPDATE",
          [guild.id, id],
        )
      ).rows[0];
      if (!r) throw new UserError("Recurso removido.");
      if (r.message_id) {
        const dest = await guild.channels.fetch(r.channel_id).catch(() => null);
        if (dest) {
          const msg = await dest.messages.fetch(r.message_id).catch((e) => {
            if (e.code === 10008) return null;
            throw e;
          });
          if (msg) await msg.delete();
        }
      }
      await db.query(
        "UPDATE guild_resources SET status='draft',message_id=NULL,channel_id=NULL,published_data=NULL WHERE guild_id=$1 AND id=$2",
        [guild.id, id],
      );
      await db.query(
        "UPDATE community_schedules SET status='cancelled' WHERE guild_id=$1 AND resource_id=$2",
        [guild.id, id],
      );
      return { resourceId: id };
    });
  }
  async function executeJob(job) {
    const guild = ctx.client.guilds.cache.get(job.guild_id);
    if (!guild) throw new UserError("Bot ausente deste servidor.");
    await actor(guild, job.actor_id);
    let result;
    const config = await ctx.configs.get(guild.id);
    if (
      (job.action === "ticket_action" && !config.modules.tickets) ||
      (job.action === "suggestion_status" && !config.modules.suggestions)
    )
      throw new UserError("Módulo desativado.");
    if (job.action === "publish_resource" || job.action === "send_embed")
      result = await publish(
        guild,
        job.payload.resourceId,
        job.actor_id,
        job.id,
      );
    else if (job.action === "unpublish_resource")
      result = await unpublish(guild, job.payload.resourceId);
    else if (job.action === "ticket_action")
      result = await tickets.action(
        guild,
        job.actor_id,
        job.payload.ticketId,
        job.payload.action,
      );
    else if (job.action === "suggestion_status") {
      await engage.status(guild, job.payload.resourceId, job.payload.status);
      result = { status: job.payload.status };
    } else throw new UserError("Ação não suportada.");
    ctx.resources.invalidate(guild.id);
    await ctx.store.audit(
      guild.id,
      job.actor_id,
      job.action,
      job.payload.resourceId || job.id,
      null,
      result || {},
    );
    return result || {};
  }
  async function tick() {
    if (running || stopped) return;
    running = true;
    try {
      const ids = [...ctx.client.guilds.cache.keys()];
      // A stale in-flight external request is ambiguous: never resend automatically.
      await ctx.pool.query(
        "UPDATE bot_jobs SET status='failed',error='Execução interrompida; confira o Discord antes de repetir.',updated_at=NOW() WHERE guild_id=ANY($1::text[]) AND status='running' AND locked_at<NOW()-INTERVAL '10 minutes'",
        [ids],
      );
      const job = await locked(
        ctx.pool,
        "kagetsu:jobs",
        async (db) =>
          (
            await db.query(
              `UPDATE bot_jobs SET status='running',locked_at=NOW(),attempts=attempts+1 WHERE id=(SELECT id FROM bot_jobs WHERE guild_id=ANY($1::text[]) AND status='pending' AND available_at<=NOW() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
              [ids],
            )
          ).rows[0],
      );
      if (job) {
        try {
          const result = await executeJob(job);
          await ctx.pool.query(
            "UPDATE bot_jobs SET status='done',result=$2,updated_at=NOW() WHERE id=$1",
            [job.id, result],
          );
        } catch (err) {
          logger.error({ err, jobId: job.id }, "Job falhou");
          await ctx.pool.query(
            "UPDATE bot_jobs SET status='failed',error=$2,updated_at=NOW() WHERE id=$1",
            [
              job.id,
              err instanceof UserError
                ? err.message
                : "Não foi possível concluir. Verifique permissões, canal e logs do bot.",
            ],
          );
        }
      }
      for (const guild of ctx.client.guilds.cache.values()) {
        const c = await ctx.configs.get(guild.id);
        await automation.autoroles(guild, c);
        await automation.schedules(guild, c);
        if (c.modules.tempVoice) await automation.cleanupRooms(guild);
        if (c.modules.giveaways)
          for (const r of await ctx.resources.list(guild.id, "giveaway"))
            if (
              r.status === "published" &&
              Date.parse((r.published_data || r.data).endsAt) <= Date.now()
            ) {
              await engage.finish(guild, r);
              ctx.resources.invalidate(guild.id);
            }
      }
      moderation.cleanup();
    } finally {
      running = false;
    }
  }
  async function handleInteraction(i) {
    if (!i.inGuild()) return false;
    const config = await ctx.configs.get(i.guildId),
      name = i.commandName;
    if (!i.customId && !slashCommands.some((c) => c.name === name))
      return false;
    if (i.customId && !i.customId.startsWith("kg:")) return false;
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (name === "help") {
        const list = ["/help"];
        if (config.modules.levels)
          list.push("/rank · /perfil · /leaderboard · /xp");
        if (config.modules.moderation)
          list.push(moderationCommands.map((c) => `/${c.name}`).join(" · "));
        if (config.modules.suggestions) list.push("/sugerir");
        if (config.modules.tempVoice) list.push("/sala");
        if (config.modules.prestige) list.push("/prestige");
        await i.editReply({ content: list.join("\n") });
        return true;
      }
      if (moderationCommands.some((c) => c.name === name)) {
        await moderation.interaction(i);
        return true;
      }
      if (name === "sala") {
        if (!config.modules.tempVoice)
          throw new UserError(t(config, "disabled"));
        await automation.roomControl(i);
        return true;
      }
      if (name === "sugerir") {
        if (!config.modules.suggestions || !config.suggestions.channelId)
          throw new UserError(t(config, "disabled"));
        const r = await ctx.store.saveResource(
          i.guildId,
          "suggestion",
          {
            title: `Sugestão de ${i.user.username}`,
            description: i.options.getString("texto"),
            channelId: config.suggestions.channelId,
            status: "pending",
          },
          i.user.id,
        );
        await publish(i.guild, r.id, i.user.id, randomUUID());
        ctx.resources.invalidate(i.guildId);
        await i.editReply({ content: "Sugestão enviada." });
        return true;
      }
      const [, type, id, action] = i.customId.split(":");
      if (type === "ticketctl") {
        if (!config.modules.tickets) throw new UserError(t(config, "disabled"));
        await tickets.action(i.guild, i.user.id, id, action);
        await i.editReply({ content: t(config, "success") });
        return true;
      }
      const r = await ctx.store.getResource(i.guildId, id);
      if (!r || r.status !== "published" || r.message_id !== i.message.id)
        throw new UserError(t(config, "missing"));
      if (!config.modules[kindModule[r.kind]])
        throw new UserError(t(config, "disabled"));
      if (type === "role" && r.kind === "role_panel")
        await roles.interaction(i, r, action);
      else if (type === "ticket" && r.kind === "ticket_panel")
        await tickets.open(i, r, action);
      else if (
        type === "engage" &&
        ["event", "suggestion", "giveaway"].includes(r.kind)
      )
        await engage.interaction(i, r, action);
      else throw new UserError("Componente inválido.");
    } catch (err) {
      logger.warn({ err, guildId: i.guildId }, "Interação");
      await i
        .editReply({
          content:
            err instanceof UserError ? err.message : t(config, "failure"),
        })
        .catch(() => {});
    }
    return true;
  }
  return {
    slashCommands,
    handleInteraction,
    log,
    processOnce: tick,
    async start() {
      stopped = false;
      timer = setInterval(
        () =>
          void tick().catch((err) =>
            logger.error({ err }, "Processamento comunidade"),
          ),
        5000,
      );
      timer.unref();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 50));
    },
    onMemberAdd: (m) => automation.welcome(m),
    onMemberRemove: (m) => automation.welcome(m, true),
    onVoiceStateUpdate: automation.voice,
    onReactionAdd: (r, u) => roles.reaction(r, u, true),
    onReactionRemove: (r, u) => roles.reaction(r, u, false),
    async onMessage(m, c) {
      if (c.modules.automod && (await moderation.automod(m, c))) return true;
      return automation.custom(m, c);
    },
    onMessageDelete: (m) =>
      m.guild &&
      log(
        m.guild,
        "messageDelete",
        `${m.author?.username || "Autor desconhecido"}: ${m.content || "Conteúdo não disponível no cache"}`,
      ),
    onMessageUpdate: (old, m) =>
      m.guild &&
      old.content !== m.content &&
      log(
        m.guild,
        "messageUpdate",
        `${m.author?.username}: ${old.content || "—"} → ${m.content || "—"}`,
      ),
    onMemberUpdate: (old, m) =>
      !old.roles.cache.equals(m.roles.cache) &&
      log(m.guild, "roles", `Cargos alterados: <@${m.id}>`),
  };
}
module.exports = { createPlatform, slashCommands, kindModule };
