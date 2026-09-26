const { PermissionFlagsBits: P } = require("discord.js");
const { durableLock } = require("./discordReliability");
const { UserError } = require("./common");
function missingOnly(code) {
  return (error) => {
    if (error.code === code) return null;
    throw error;
  };
}
function createTicketRoles(ctx) {
  async function ensure(guild, ticket, db) {
    const me = guild.members.me || (await guild.members.fetchMe());
    if (!me.permissions.has(P.ManageRoles))
      throw new UserError(
        "O bot precisa de Gerenciar Cargos para criar o cargo privado do ticket.",
      );
    const name = `ticket-${ticket.id}`;
    let role = ticket.temporary_role_id
      ? await guild.roles
          .fetch(ticket.temporary_role_id)
          .catch(missingOnly(10011))
      : null;
    if (!role) {
      // Full UUID marker reconciles a successful Discord creation whose SQL checkpoint failed.
      const roles = await guild.roles.fetch();
      role = roles.find(
        (r) => r.name === name && !r.managed && r.permissions.bitfield === 0n,
      );
      if (!role) {
        role = await guild.roles.create({
          name,
          permissions: [],
          mentionable: false,
          hoist: false,
          reason: `Kagetsu ticket ${ticket.id}`,
        });
      }
      await db.query(
        "UPDATE tickets SET temporary_role_id=$3,updated_at=NOW() WHERE guild_id=$1 AND id=$2",
        [guild.id, ticket.id, role.id],
      );
      ticket.temporary_role_id = role.id;
    }
    if (
      role.permissions.bitfield !== 0n ||
      role.managed ||
      me.roles.highest.comparePositionTo(role) <= 0
    )
      throw new UserError(
        "O cargo temporário do ticket foi alterado ou está acima do bot. Verifique a configuração.",
      );
    const member = await guild.members
      .fetch(ticket.owner_id)
      .catch(missingOnly(10007));
    if (member && !member.roles.cache.has(role.id))
      await member.roles.add(role.id, `Kagetsu ticket ${ticket.id}`);
    return role;
  }
  async function remove(guild, ticket, db) {
    if (!ticket.temporary_role_id) return;
    const role = await guild.roles
      .fetch(ticket.temporary_role_id)
      .catch(missingOnly(10011));
    if (role) {
      if (
        role.name !== `ticket-${ticket.id}` ||
        role.managed ||
        role.permissions.bitfield !== 0n
      )
        throw new UserError(
          "Cargo do ticket alterado; exclusão automática bloqueada.",
        );
      const member = await guild.members
        .fetch(ticket.owner_id)
        .catch(missingOnly(10007));
      if (member?.roles.cache.has(role.id))
        await member.roles.remove(role.id, "Kagetsu: exclusão do ticket");
      await role.delete("Kagetsu: exclusão do ticket");
    }
    await db.query(
      "UPDATE tickets SET temporary_role_id=NULL WHERE guild_id=$1 AND id=$2",
      [guild.id, ticket.id],
    );
  }
  async function reconcile(guild) {
    const { rows } = await ctx.pool.query(
      "SELECT * FROM tickets WHERE guild_id=$1 AND (status <> 'deleted' OR temporary_role_id IS NOT NULL)",
      [guild.id],
    );
    for (const row of rows)
      await durableLock(ctx.pool, `tickets:${guild.id}`, async (db) => {
        const ticket = (
          await db.query("SELECT * FROM tickets WHERE guild_id=$1 AND id=$2", [
            guild.id,
            row.id,
          ])
        ).rows[0];
        if (!ticket) return;
        let channel = ticket.channel_id
          ? await guild.channels
              .fetch(ticket.channel_id)
              .catch(missingOnly(10003))
          : null;
        if (!channel && ticket.provisioning_state !== "ready") {
          const channels = await guild.channels.fetch();
          channel = channels.find((c) =>
            c?.topic?.startsWith(`Kagetsu ticket ${ticket.id} |`),
          );
          if (channel) {
            await db.query(
              "UPDATE tickets SET channel_id=$3,provisioning_state='ready' WHERE guild_id=$1 AND id=$2",
              [guild.id, ticket.id, channel.id],
            );
          } else if (
            Date.now() - new Date(ticket.updated_at).getTime() >
            120000
          ) {
            // A durable reservation with no channel can safely be retired after restart.
            if (!ticket.temporary_role_id) {
              const roles = await guild.roles.fetch();
              const orphan = roles.find(
                (r) =>
                  r.name === `ticket-${ticket.id}` &&
                  !r.managed &&
                  r.permissions.bitfield === 0n,
              );
              if (orphan) {
                ticket.temporary_role_id = orphan.id;
                await db.query(
                  "UPDATE tickets SET temporary_role_id=$3 WHERE guild_id=$1 AND id=$2",
                  [guild.id, ticket.id, orphan.id],
                );
              }
            }
            await remove(guild, ticket, db);
            await db.query(
              "UPDATE tickets SET status='deleted',provisioning_state='ready' WHERE guild_id=$1 AND id=$2",
              [guild.id, ticket.id],
            );
            return;
          }
        }
        if (
          ticket.status === "deleted" ||
          (!channel && ticket.provisioning_state === "ready")
        ) {
          await remove(guild, ticket, db);
          await db.query(
            "UPDATE tickets SET status='deleted' WHERE guild_id=$1 AND id=$2",
            [guild.id, ticket.id],
          );
        } else if (channel) {
          const role = await ensure(guild, ticket, db);
          const overwrite = channel.permissionOverwrites.cache.get(role.id);
          const correct =
            overwrite?.allow?.has?.([P.ViewChannel, P.ReadMessageHistory]) &&
            (ticket.status === "open"
              ? overwrite.allow.has(P.SendMessages)
              : overwrite.deny.has(P.SendMessages));
          if (!correct)
            await channel.permissionOverwrites.edit(role.id, {
              ViewChannel: true,
              ReadMessageHistory: true,
              SendMessages: ticket.status === "open",
            });
          if (ticket.status === "closed") {
            const ownerOverwrite = channel.permissionOverwrites.cache.get(
              ticket.owner_id,
            );
            if (!ownerOverwrite?.deny?.has?.(P.SendMessages))
              await channel.permissionOverwrites.edit(ticket.owner_id, {
                SendMessages: false,
              });
          } else if (channel.permissionOverwrites.cache.has(ticket.owner_id))
            await channel.permissionOverwrites.delete(ticket.owner_id);
        }
      });
  }
  return { ensure, remove, reconcile };
}
module.exports = { createTicketRoles, missingOnly };
