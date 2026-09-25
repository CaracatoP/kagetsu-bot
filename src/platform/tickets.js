const { randomUUID } = require("node:crypto");
const {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { P, UserError, locked, embed, mentionless } = require("./common");

function ticketPayload(resource) {
  const data = resource.data,
    categories = data.categories?.length
      ? data.categories
      : [{ id: "support", label: "Abrir ticket" }];
  if (categories.length > 25)
    throw new UserError("Use até 25 categorias por painel.");
  const components = [];
  for (let i = 0; i < categories.length; i += 5)
    components.push(
      new ActionRowBuilder().addComponents(
        categories
          .slice(i, i + 5)
          .map((item) =>
            new ButtonBuilder()
              .setCustomId(`kg:ticket:${resource.id}:${item.id}`)
              .setLabel(item.label.slice(0, 80))
              .setStyle(ButtonStyle.Primary),
          ),
      ),
    );
  return mentionless({ embeds: [embed(data)], components });
}
function controls(id, closed = false) {
  return [
    new ActionRowBuilder().addComponents(
      (closed
        ? [
            ["reopen", "Reabrir", ButtonStyle.Success],
            ["delete", "Excluir", ButtonStyle.Danger],
          ]
        : [
            ["claim", "Assumir", ButtonStyle.Primary],
            ["close", "Fechar", ButtonStyle.Secondary],
          ]
      ).map(([action, label, style]) =>
        new ButtonBuilder()
          .setCustomId(`kg:ticketctl:${id}:${action}`)
          .setLabel(label)
          .setStyle(style),
      ),
    ),
  ];
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
async function transcript(channel) {
  const messages = [];
  let before,
    truncated = false;
  while (messages.length < 10000) {
    const page = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (!page.size) break;
    for (const message of page.values()) messages.push(message);
    before = page.last().id;
    if (page.size < 100) break;
    if (messages.length >= 10000) truncated = true;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const body = messages
    .map(
      (message) =>
        `<article><h3>${escapeHtml(message.author?.tag || message.author?.id || "Unknown")} · ${new Date(message.createdTimestamp).toISOString()}</h3><pre>${escapeHtml(message.content || "")}</pre>${[...message.attachments.values()].map((file) => `<p>Arquivo: ${escapeHtml(file.name)} — ${escapeHtml(file.url)}</p>`).join("")}${message.embeds.map((card) => `<pre>${escapeHtml([card.title, card.description].filter(Boolean).join("\n"))}</pre>`).join("")}</article>`,
    )
    .join("\n");
  return {
    count: messages.length,
    html: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Ticket ${escapeHtml(channel.name)}</title><style>body{background:#101321;color:#edf0ff;font:15px system-ui;max-width:1000px;margin:30px auto;padding:20px}article{border-bottom:1px solid #45445a;padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}h3{color:#b49aff}</style><h1>${escapeHtml(channel.name)}</h1>${truncated ? "<p>Limite de segurança: últimas 10.000 mensagens. Exportações adicionais devem ser solicitadas antes de excluir o canal.</p>" : ""}${body}</html>`,
  };
}
function createTickets(ctx) {
  async function open(interaction, resource, categoryId) {
    const guild = interaction.guild,
      data = resource.published_data || resource.data;
    const category = (
      data.categories?.length
        ? data.categories
        : [{ id: "support", label: "Suporte" }]
    ).find((item) => item.id === categoryId);
    if (!category) throw new UserError("Categoria de ticket removida.");
    return locked(
      ctx.pool,
      `ticket-open:${guild.id}:${resource.id}:${interaction.user.id}`,
      async (db) => {
        const { rows } = await db.query(
          "SELECT channel_id FROM tickets WHERE guild_id=$1 AND resource_id=$2 AND owner_id=$3 AND status='open'",
          [guild.id, resource.id, interaction.user.id],
        );
        if (rows[0]) {
          await interaction.editReply({
            content: `Você já possui um ticket: <#${rows[0].channel_id}>`,
          });
          return;
        }
        const me = await guild.members.fetchMe();
        if (!me.permissions.has(P.ManageChannels))
          throw new UserError("O bot precisa de Gerenciar Canais.");
        const supportRoles = [];
        for (const id of data.supportRoleIds || []) {
          const role = await guild.roles.fetch(id);
          if (!role || id === guild.id)
            throw new UserError("Cargo de suporte inválido.");
          supportRoles.push(id);
        }
        const parent = data.categoryId
          ? await guild.channels.fetch(data.categoryId)
          : null;
        if (parent && parent.type !== ChannelType.GuildCategory)
          throw new UserError("Selecione uma categoria de canais válida.");
        const id = randomUUID(),
          permissions = [
            P.ViewChannel,
            P.SendMessages,
            P.ReadMessageHistory,
            P.AttachFiles,
            P.EmbedLinks,
          ];
        const channel = await guild.channels.create({
          name:
            `ticket-${interaction.user.username}`
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 90) || "ticket",
          type: ChannelType.GuildText,
          parent: parent?.id,
          topic: `Kagetsu ticket ${id} | ${category.label}`.slice(0, 1024),
          permissionOverwrites: [
            { id: guild.id, deny: [P.ViewChannel] },
            { id: interaction.user.id, allow: permissions },
            { id: me.id, allow: [...permissions, P.ManageChannels] },
            ...supportRoles.map((roleId) => ({
              id: roleId,
              allow: permissions,
            })),
          ],
          reason: `Kagetsu: ticket de ${interaction.user.id}`,
        });
        try {
          await db.query(
            "INSERT INTO tickets(id,guild_id,resource_id,channel_id,owner_id) VALUES($1,$2,$3,$4,$5)",
            [id, guild.id, resource.id, channel.id, interaction.user.id],
          );
          await channel.send(
            mentionless({
              content: `<@${interaction.user.id}> · ${category.label}`,
              embeds: [
                embed({
                  title: "Ticket aberto",
                  description:
                    "Descreva o que você precisa. A equipe responderá neste canal.",
                }),
              ],
              components: controls(id),
            }),
          );
        } catch (error) {
          await channel
            .delete("Kagetsu: falha ao registrar ticket")
            .catch(() => {});
          throw error;
        }
        // A confirmação abaixo identifica o canal privado criado.
        await interaction.editReply({
          content: `Ticket criado: <#${channel.id}>`,
        });
      },
    );
  }
  async function action(guild, userId, id, operation) {
    if (!["claim", "close", "reopen", "delete"].includes(operation))
      throw new UserError("Ação de ticket inválida.");
    const config = await ctx.configs.get(guild.id);
    const result = await locked(
      ctx.pool,
      `ticket:${guild.id}:${id}`,
      async (db) => {
        const { rows } = await db.query(
          "SELECT * FROM tickets WHERE guild_id=$1 AND id=$2 FOR UPDATE",
          [guild.id, id],
        );
        const ticket = rows[0];
        if (!ticket || ticket.status === "deleted")
          throw new UserError("Ticket não encontrado.");
        const resource = ticket.resource_id
          ? (
              await db.query(
                "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 AND kind='ticket_panel'",
                [guild.id, ticket.resource_id],
              )
            ).rows[0]
          : null;
        const member = await guild.members.fetch({ user: userId, force: true });
        const staff =
          member.permissions.has(P.ManageChannels) ||
          (resource?.published_data || resource?.data)?.supportRoleIds?.some(
            (roleId) => member.roles.cache.has(roleId),
          );
        if (!staff && !(operation === "close" && userId === ticket.owner_id))
          throw new UserError("Somente a equipe pode executar esta ação.");
        const channel = await guild.channels
          .fetch(ticket.channel_id)
          .catch(() => null);
        if (!channel && operation !== "delete")
          throw new UserError("Canal do ticket removido.");
        if (operation === "claim") {
          if (ticket.status !== "open")
            throw new UserError("Reabra o ticket antes de assumir.");
          if (ticket.claimed_by && ticket.claimed_by !== userId)
            throw new UserError(
              "Este ticket já foi assumido por outro membro da equipe.",
            );
          await db.query(
            "UPDATE tickets SET claimed_by=$3,updated_at=NOW() WHERE guild_id=$1 AND id=$2",
            [guild.id, id, userId],
          );
        }
        if (operation === "close" && ticket.status !== "closed") {
          const document = await transcript(channel);
          await db.query(
            "UPDATE tickets SET status='closed',closed_at=NOW(),transcript=$3,transcript_count=$4,updated_at=NOW() WHERE guild_id=$1 AND id=$2",
            [guild.id, id, document.html, document.count],
          );
          await channel.permissionOverwrites.edit(ticket.owner_id, {
            SendMessages: false,
          });
          const file = new AttachmentBuilder(
            Buffer.from(document.html, "utf8"),
            { name: `ticket-${id}.html` },
          );
          await channel.send(
            mentionless({
              content: `Ticket fechado por <@${userId}>. Transcript: ${document.count} mensagens.`,
              components: controls(id, true),
              files: [file],
            }),
          );
          const logId = config.tickets?.logChannelId;
          if (logId) {
            const logs = await guild.channels.fetch(logId).catch(() => null);
            if (logs?.send)
              await logs
                .send(
                  mentionless({
                    content: `Transcript do ticket ${id}`,
                    files: [file],
                  }),
                )
                .catch(() => {});
          }
        }
        if (operation === "reopen") {
          await db.query(
            "UPDATE tickets SET status='open',closed_at=NULL,updated_at=NOW() WHERE guild_id=$1 AND id=$2",
            [guild.id, id],
          );
          await channel.permissionOverwrites.edit(ticket.owner_id, {
            SendMessages: true,
          });
          await channel.send(
            mentionless({
              content: "Ticket reaberto.",
              components: controls(id),
            }),
          );
        }
        if (operation === "delete") {
          if (ticket.status !== "closed" || !ticket.transcript)
            throw new UserError(
              "Feche o ticket e gere o transcript antes de excluir.",
            );
          if (channel)
            await channel.delete(`Kagetsu: ticket excluído por ${userId}`);
          await db.query(
            "UPDATE tickets SET status='deleted',updated_at=NOW() WHERE guild_id=$1 AND id=$2",
            [guild.id, id],
          );
        }
        return { ticketId: id, action: operation };
      },
    );
    await ctx.store.audit(
      guild.id,
      userId,
      `ticket.${operation}`,
      id,
      null,
      result,
    );
    await ctx.log(
      guild,
      "tickets",
      `Ticket ${id}: ${operation} por <@${userId}>.`,
    );
    return result;
  }
  return { open, action, payload: ticketPayload };
}
module.exports = {
  createTickets,
  ticketPayload,
  controls,
  escapeHtml,
  transcript,
};
