const { DateTime } = require("luxon");
const { ChannelType, AttachmentBuilder } = require("discord.js");
const {
  P,
  UserError,
  substitute,
  embed,
  channel,
  locked,
  mentionless,
  nonce,
} = require("./common");
const { validateRole } = require("./roles");
const { base, text, avatar } = require("../cards/shared");
function nextRun(data, timezone, after = Date.now()) {
  if (data.recurrence === "none") return null;
  const start = DateTime.fromISO(data.runAt).setZone(timezone);
  let next = start;
  if (next.toMillis() <= after) {
    const current = DateTime.fromMillis(after).setZone(timezone);
    next = current.set({
      hour: start.hour,
      minute: start.minute,
      second: start.second,
      millisecond: 0,
    });
    if (next.toMillis() <= after) next = next.plus({ days: 1 });
  }
  if (data.recurrence === "weekly") {
    const days = data.daysOfWeek?.length
      ? data.daysOfWeek
      : [start.weekday % 7];
    while (!days.includes(next.weekday % 7)) next = next.plus({ days: 1 });
  }
  return next.toUTC().toISO();
}
function createAutomation(ctx) {
  async function welcome(member, leaving = false) {
    const c = await ctx.configs.get(member.guild.id);
    ctx.metrics?.record(member.guild.id, member.id, {
      [leaving ? "leaves" : "joins"]: 1,
    });
    await ctx.log(
      member.guild,
      leaving ? "leave" : "join",
      `${member.user.username} ${leaving ? "saiu" : "entrou"} no servidor.`,
    );
    if (!c.modules.welcome) return;
    const id = leaving ? c.welcome.leaveChannelId : c.welcome.channelId;
    if (id) {
      const dest = await channel(member.guild, id);
      const content = substitute(
        leaving ? c.welcome.leaveMessage : c.welcome.message,
        { user: member.user, guild: member.guild },
      );
      if (!leaving && c.welcome.type === "card") {
        const { canvas, ctx: draw } = base(350, "BOAS-VINDAS", c.appearance);
        await avatar(draw, member.user, 65, 133, 130);
        text(draw, member.displayName, 235, 181, 780, 32);
        text(
          draw,
          content.replaceAll(`<@${member.id}>`, member.displayName),
          235,
          234,
          780,
          20,
        );
        await dest.send(
          mentionless({
            files: [
              new AttachmentBuilder(canvas.toBuffer("image/png"), {
                name: "welcome.png",
              }),
            ],
          }),
        );
      } else
        await dest.send(
          mentionless(
            !leaving && c.welcome.type === "embed"
              ? {
                  embeds: [
                    embed({
                      title: member.guild.name,
                      description: content,
                      color: c.appearance.primary,
                    }),
                  ],
                }
              : { content },
          ),
        );
    }
    if (!leaving && c.welcome.autoroleIds.length)
      await ctx.pool.query(
        `INSERT INTO autorole_jobs(guild_id,user_id,run_at,status) VALUES($1,$2,NOW()+$3*INTERVAL '1 minute','pending') ON CONFLICT(guild_id,user_id) DO UPDATE SET run_at=EXCLUDED.run_at,status='pending'`,
        [member.guild.id, member.id, c.welcome.delayMinutes],
      );
  }
  async function autoroles(guild, c) {
    if (!c.modules.welcome) return;
    const rows = (
      await ctx.pool.query(
        "SELECT * FROM autorole_jobs WHERE guild_id=$1 AND status='pending' AND run_at<=NOW() LIMIT 50",
        [guild.id],
      )
    ).rows;
    for (const job of rows)
      await locked(ctx.pool, `roles:${guild.id}:${job.user_id}`, async (db) => {
        const row = (
          await db.query(
            "SELECT * FROM autorole_jobs WHERE guild_id=$1 AND user_id=$2 AND status='pending' FOR UPDATE",
            [guild.id, job.user_id],
          )
        ).rows[0];
        if (!row) return;
        try {
          const member = await guild.members
            .fetch({ user: job.user_id, force: true })
            .catch(() => null);
          if (member)
            for (const id of c.welcome.autoroleIds) {
              await validateRole(guild, id);
              if (!member.roles.cache.has(id))
                await member.roles.add(id, "Kagetsu: boas-vindas");
            }
          await db.query(
            "UPDATE autorole_jobs SET status='done' WHERE guild_id=$1 AND user_id=$2",
            [guild.id, job.user_id],
          );
        } catch (error) {
          await db.query(
            "UPDATE autorole_jobs SET status='failed',last_error=$3 WHERE guild_id=$1 AND user_id=$2",
            [guild.id, job.user_id, error.message.slice(0, 300)],
          );
        }
      });
  }
  async function schedules(guild, c) {
    if (!c.modules.scheduler) return;
    const rows = (
      await ctx.pool.query(
        "SELECT * FROM community_schedules WHERE guild_id=$1 AND status='pending' AND next_run_at<=NOW() LIMIT 20",
        [guild.id],
      )
    ).rows;
    for (const schedule of rows)
      await locked(
        ctx.pool,
        `schedule:${guild.id}:${schedule.resource_id}`,
        async (db) => {
          const job = (
            await db.query(
              "SELECT * FROM community_schedules WHERE guild_id=$1 AND resource_id=$2 AND status='pending' AND next_run_at<=NOW() FOR UPDATE",
              [guild.id, schedule.resource_id],
            )
          ).rows[0];
          if (!job) return;
          const r = (
            await db.query(
              "SELECT * FROM guild_resources WHERE guild_id=$1 AND id=$2",
              [guild.id, job.resource_id],
            )
          ).rows[0];
          if (!r || r.status !== "published") return;
          const data = r.published_data || r.data;
          try {
            await ctx.requireActor(guild, job.actor_id);
            const dest = await channel(guild, data.channelId);
            await dest.send(
              mentionless({
                content: substitute(data.content, { guild, channel: dest }),
                nonce: nonce(`${r.id}:${job.next_run_at.toISOString()}`),
                enforceNonce: true,
              }),
            );
            const next = nextRun(data, c.general.timezone);
            await db.query(
              "UPDATE community_schedules SET next_run_at=COALESCE($3,next_run_at),status=$4,updated_at=NOW() WHERE guild_id=$1 AND resource_id=$2",
              [guild.id, r.id, next, next ? "pending" : "done"],
            );
          } catch (error) {
            await db.query(
              "UPDATE community_schedules SET status='failed',last_error=$3 WHERE guild_id=$1 AND resource_id=$2",
              [guild.id, r.id, error.message.slice(0, 300)],
            );
          }
        },
      );
  }
  async function custom(message, c) {
    if (
      !c.modules.customCommands ||
      !message.content.startsWith(c.general.prefix)
    )
      return false;
    const name = message.content
      .slice(c.general.prefix.length)
      .split(/\s+/)[0]
      .toLowerCase();
    const r = (
      await ctx.resources.list(message.guild.id, "custom_command")
    ).find(
      (r) =>
        r.status === "published" &&
        (r.published_data || r.data).name.toLowerCase() === name,
    );
    if (!r) return false;
    await message.reply(
      mentionless({
        content: substitute((r.published_data || r.data).response, {
          user: message.author,
          guild: message.guild,
          channel: message.channel,
        }),
      }),
    );
    return true;
  }
  async function voice(old, state) {
    const guild = state.guild,
      c = await ctx.configs.get(guild.id);
    if (!c.modules.tempVoice) return;
    if (
      state.channelId === c.tempVoice.triggerChannelId &&
      old.channelId !== state.channelId &&
      !state.member?.user.bot
    ) {
      await locked(
        ctx.pool,
        `tempvoice:${guild.id}:${state.id}`,
        async (db) => {
          const exists = (
            await db.query(
              "SELECT channel_id FROM temp_voice_channels WHERE guild_id=$1 AND owner_id=$2",
              [guild.id, state.id],
            )
          ).rows[0];
          if (exists) {
            const room = await guild.channels
              .fetch(exists.channel_id)
              .catch(() => null);
            if (room) {
              await state.setChannel(room);
              return;
            }
            await db.query(
              "DELETE FROM temp_voice_channels WHERE guild_id=$1 AND channel_id=$2",
              [guild.id, exists.channel_id],
            );
          }
          const room = await guild.channels.create({
            name: `Sala de ${state.member.displayName}`.slice(0, 100),
            type: ChannelType.GuildVoice,
            parent: c.tempVoice.categoryId || state.channel?.parentId,
            permissionOverwrites: [
              ...(state.channel?.permissionOverwrites.cache.map((o) => ({
                id: o.id,
                allow: o.allow.bitfield,
                deny: o.deny.bitfield,
                type: o.type,
              })) || []),
              { id: state.id, allow: [P.ViewChannel, P.Connect] },
            ],
          });
          try {
            await db.query(
              "INSERT INTO temp_voice_channels(guild_id,channel_id,owner_id) VALUES($1,$2,$3)",
              [guild.id, room.id, state.id],
            );
            await state.setChannel(room);
          } catch (error) {
            await room.delete().catch(() => {});
            throw error;
          }
        },
      );
    }
    await cleanupRooms(guild);
  }
  async function cleanupRooms(guild) {
    const rows = (
      await ctx.pool.query(
        "SELECT channel_id FROM temp_voice_channels WHERE guild_id=$1 AND created_at<NOW()-INTERVAL '10 seconds'",
        [guild.id],
      )
    ).rows;
    for (const row of rows) {
      const room = await guild.channels.fetch(row.channel_id).catch(() => null);
      if (!room || !room.members.size) {
        if (room) await room.delete("Kagetsu: sala vazia");
        await ctx.pool.query(
          "DELETE FROM temp_voice_channels WHERE guild_id=$1 AND channel_id=$2",
          [guild.id, row.channel_id],
        );
      }
    }
  }
  async function roomControl(i) {
    const row = (
      await ctx.pool.query(
        "SELECT * FROM temp_voice_channels WHERE guild_id=$1 AND owner_id=$2",
        [i.guildId, i.user.id],
      )
    ).rows[0];
    if (!row) throw new UserError("Você não possui uma sala temporária.");
    const room = await i.guild.channels.fetch(row.channel_id);
    const op = i.options.getSubcommand();
    if (op === "nome") await room.setName(i.options.getString("valor"));
    if (op === "limite") await room.setUserLimit(i.options.getInteger("valor"));
    if (op === "lock" || op === "unlock")
      await room.permissionOverwrites.edit(i.guildId, {
        Connect: op === "lock" ? false : null,
      });
    if (op === "expulsar") {
      const member = await i.guild.members.fetch(
        i.options.getUser("usuario").id,
      );
      if (
        member.id === i.user.id ||
        member.permissions.has(P.ManageChannels) ||
        member.voice.channelId !== room.id
      )
        throw new UserError("Não é possível expulsar este membro.");
      await member.voice.disconnect();
    }
    await i.editReply({ content: "Sala atualizada." });
  }
  return {
    welcome,
    autoroles,
    schedules,
    custom,
    voice,
    cleanupRooms,
    roomControl,
  };
}
module.exports = { createAutomation, nextRun };
