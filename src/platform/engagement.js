const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { randomInt } = require("node:crypto");
const { embed, locked, UserError, mentionless } = require("./common");
function createEngagement(ctx) {
  async function payload(resource, db = ctx.pool) {
    const data = resource.published_data || resource.data;
    const members = (
      await db.query(
        "SELECT user_id,value FROM community_members WHERE guild_id=$1 AND resource_id=$2",
        [resource.guild_id, resource.id],
      )
    ).rows;
    const buttons = [];
    let details = "";
    if (resource.kind === "suggestion") {
      details = `\n\n👍 ${members.filter((m) => m.value === "up").length} · 👎 ${members.filter((m) => m.value === "down").length}\nStatus: ${data.status || "pending"}`;
      buttons.push(["up", "👍 Concordo"], ["down", "👎 Discordo"]);
    } else if (resource.kind === "event") {
      details = `\n\n<t:${Math.floor(Date.parse(data.startsAt) / 1000)}:F> · ${members.length}/${data.maxParticipants || "∞"} participantes\n${members
        .slice(0, 20)
        .map((m) => `<@${m.user_id}>`)
        .join(", ")}`;
      buttons.push(["join", "Participar"], ["leave", "Sair"]);
    } else if (resource.kind === "giveaway") {
      details = `\n\n${members.length} participantes · ${data.winners} vencedor(es)\nEncerra <t:${Math.floor(Date.parse(data.endsAt) / 1000)}:R>`;
      if (data.result)
        details += `\nResultado: ${data.result.length ? data.result.map((id) => `<@${id}>`).join(", ") : "Sem participantes elegíveis"}`;
      buttons.push(["join", "Participar"], ["leave", "Sair"]);
    }
    const card = embed({
      ...data,
      description: `${data.description || ""}${details}`.slice(0, 4000),
    });
    return mentionless({
      embeds: [card],
      components:
        resource.status === "closed"
          ? []
          : [
              new ActionRowBuilder().addComponents(
                buttons.map(([value, label]) =>
                  new ButtonBuilder()
                    .setCustomId(`kg:engage:${resource.id}:${value}`)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Secondary),
                ),
              ),
            ],
    });
  }
  async function update(guild, resource, db = ctx.pool) {
    if (!resource.message_id) return;
    const channel = await guild.channels.fetch(resource.channel_id);
    const message = await channel.messages.fetch(resource.message_id);
    await message.edit(await payload(resource, db));
  }
  async function interaction(interaction, resource, action) {
    await locked(
      ctx.pool,
      `engage:${interaction.guildId}:${resource.id}`,
      async (db) => {
        resource = (
          await db.query(
            "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 FOR UPDATE",
            [interaction.guildId, resource.id],
          )
        ).rows[0];
        if (resource.status !== "published")
          throw new UserError("Inscrições encerradas.");
        const data = resource.published_data || resource.data;
        if (
          resource.kind === "giveaway" &&
          Date.parse(data.endsAt) <= Date.now()
        )
          throw new UserError("Sorteio encerrado.");
        if (
          resource.kind === "event" &&
          Date.parse(data.startsAt) <= Date.now()
        )
          throw new UserError("Este evento já começou.");
        const member = await interaction.guild.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        if (
          resource.kind === "giveaway" &&
          data.requiredRoleId &&
          !member.roles.cache.has(data.requiredRoleId)
        )
          throw new UserError("Você não tem o cargo necessário.");
        if (action === "leave")
          await db.query(
            "DELETE FROM community_members WHERE guild_id=$1 AND resource_id=$2 AND user_id=$3",
            [interaction.guildId, resource.id, member.id],
          );
        else {
          if (!["join", "up", "down"].includes(action))
            throw new UserError("Ação inválida.");
          const rows = (
            await db.query(
              "SELECT user_id FROM community_members WHERE guild_id=$1 AND resource_id=$2",
              [interaction.guildId, resource.id],
            )
          ).rows;
          if (
            resource.kind === "event" &&
            data.maxParticipants &&
            rows.length >= data.maxParticipants &&
            !rows.some((row) => row.user_id === member.id)
          )
            throw new UserError("Evento lotado.");
          await db.query(
            `INSERT INTO community_members(guild_id,resource_id,user_id,value) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,resource_id,user_id) DO UPDATE SET value=$4`,
            [interaction.guildId, resource.id, member.id, action],
          );
        }
        await update(interaction.guild, resource, db);
      },
    );
    await interaction.editReply({ content: "Participação atualizada." });
  }
  async function status(guild, id, status) {
    return locked(ctx.pool, `engage:${guild.id}:${id}`, async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 AND kind='suggestion' FOR UPDATE",
          [guild.id, id],
        )
      ).rows[0];
      if (!r) throw new UserError("Sugestão não encontrada.");
      r.data.status = status;
      r.published_data = { ...(r.published_data || r.data), status };
      await db.query(
        "UPDATE guild_resources SET data=$3,published_data=$4 WHERE guild_id=$1 AND id=$2",
        [guild.id, id, r.data, r.published_data],
      );
      await update(guild, r, db);
    });
  }
  async function finish(guild, resource) {
    await locked(ctx.pool, `engage:${guild.id}:${resource.id}`, async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2 AND status='published' FOR UPDATE",
          [guild.id, resource.id],
        )
      ).rows[0];
      if (!r) return;
      const data = r.published_data || r.data;
      if (Date.parse(data.endsAt) > Date.now()) return;
      const rows = (
        await db.query(
          "SELECT user_id FROM community_members WHERE guild_id=$1 AND resource_id=$2",
          [guild.id, r.id],
        )
      ).rows;
      const eligible = [];
      for (const row of rows) {
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (
          member &&
          !member.user.bot &&
          (!data.requiredRoleId || member.roles.cache.has(data.requiredRoleId))
        )
          eligible.push(member.id);
      }
      const result = [];
      while (eligible.length && result.length < data.winners)
        result.push(eligible.splice(randomInt(eligible.length), 1)[0]);
      r.status = "closed";
      r.data = { ...r.data, result };
      r.published_data = { ...data, result };
      await db.query(
        "UPDATE guild_resources SET status='closed',data=$3,published_data=$4 WHERE guild_id=$1 AND id=$2",
        [guild.id, r.id, r.data, r.published_data],
      );
      await update(guild, r, db);
      await db.query(
        "INSERT INTO audit_logs(guild_id,user_id,action,target,new_value) VALUES($1,$2,$3,$4,$5)",
        [guild.id, "system", "giveaway.result", r.id, { winners: result }],
      );
    });
  }
  return { payload, interaction, status, finish };
}
module.exports = { createEngagement };
