const { ApiError } = require("./errors");
const { createTransport } = require("./discordTransport");
const P = {
  ADMIN: 8n,
  MANAGE_GUILD: 32n,
  MANAGE_ROLES: 268435456n,
  VIEW: 1024n,
  SEND: 2048n,
  EMBED: 16384n,
  ATTACH: 32768n,
  MANAGE_CHANNELS: 16n,
  READ_HISTORY: 65536n,
  ADD_REACTIONS: 64n,
};
const {
  dangerousMask: DANGEROUS,
} = require("../../packages/shared/permissions");
function has(bits, permission) {
  return (
    (BigInt(bits) & 8n) !== 0n || (BigInt(bits) & permission) === permission
  );
}
function canManageGuild(guild) {
  return guild.owner === true || has(guild.permissions || "0", P.MANAGE_GUILD);
}
function guildPermissions(guildId, roles, member) {
  return roles
    .filter((r) => r.id === guildId || member.roles.includes(r.id))
    .reduce((bits, r) => bits | BigInt(r.permissions), 0n);
}
function channelPermissions(channel, guildId, roles, member) {
  let bits = guildPermissions(guildId, roles, member);
  if (has(bits, P.ADMIN)) return bits;
  const overwrites = channel.permission_overwrites || [];
  const everyone = overwrites.find((o) => o.id === guildId);
  if (everyone) bits = (bits & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let denied = 0n,
    allowed = 0n;
  for (const overwrite of overwrites.filter(
    (o) => Number(o.type) === 0 && member.roles.includes(o.id),
  )) {
    denied |= BigInt(overwrite.deny);
    allowed |= BigInt(overwrite.allow);
  }
  bits = (bits & ~denied) | allowed;
  const own = overwrites.find(
    (o) => Number(o.type) === 1 && o.id === member.user.id,
  );
  if (own) bits = (bits & ~BigInt(own.deny)) | BigInt(own.allow);
  return bits;
}
function createDiscord({
  clientId,
  clientSecret,
  redirectUri,
  botToken,
  fetchImpl = fetch,
  logger,
  now,
}) {
  const transport = createTransport({ fetchImpl, logger, now });
  const request = (path, options = {}) =>
    transport(path, {
      ...options,
      botToken: options.bot ? botToken : undefined,
    });
  async function token(parameters) {
    const result = await request("/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        ...parameters,
      }),
    });
    return {
      ...result,
      expires_at: Date.now() + Number(result.expires_in) * 1000,
    };
  }
  return {
    exchange: (code) =>
      token({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    refresh: (refreshToken) =>
      token({ grant_type: "refresh_token", refresh_token: refreshToken }),
    revoke: (accessToken) =>
      request("/oauth2/token/revoke", {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: accessToken,
        }),
      }),
    user: (accessToken) => request("/users/@me", { accessToken }),
    async guilds(accessToken, context = {}) {
      let result = [],
        after = "";
      for (let page = 0; page < 10; page++) {
        const batch = await request(
          `/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`,
          {
            accessToken,
            ttl: context.fresh ? 0 : 30000,
            stale: context.fresh ? 0 : 120000,
            context,
          },
        );
        result.push(...batch);
        if (batch.length < 200) return result;
        after = batch[batch.length - 1].id;
      }
      return result;
    },
    async metadata(guildId, context = {}) {
      const options = {
        bot: true,
        ttl: 60000,
        stale: 600000,
        context: { ...context, guildId },
      };
      if (!botToken)
        throw new ApiError(
          503,
          "BOT_NOT_CONFIGURED",
          "O token do bot ainda não foi configurado.",
        );
      const [guild, roles, channels, member] = await Promise.all([
        request(`/guilds/${guildId}?with_counts=true`, options),
        request(`/guilds/${guildId}/roles`, options),
        request(`/guilds/${guildId}/channels`, options),
        request(`/guilds/${guildId}/members/${clientId}`, options),
      ]);
      const bits = guildPermissions(guildId, roles, member),
        highest = Math.max(
          0,
          ...roles
            .filter((r) => member.roles.includes(r.id))
            .map((r) => r.position),
        );
      const mappedRoles = roles.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        manageable:
          r.id !== guildId &&
          !r.managed &&
          r.position < highest &&
          has(bits, P.MANAGE_ROLES),
        dangerous: (BigInt(r.permissions) & DANGEROUS) !== 0n,
      }));
      const mappedChannels = channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        sendable:
          [0, 5].includes(c.type) &&
          has(
            channelPermissions(c, guildId, roles, member),
            P.VIEW | P.SEND | P.EMBED,
          ),
        readable: has(channelPermissions(c, guildId, roles, member), P.VIEW),
      }));
      return {
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          memberCount:
            guild.approximate_member_count || guild.member_count || 0,
        },
        roles: mappedRoles,
        channels: mappedChannels,
        permissions: {
          missing: [
            [P.VIEW, "ViewChannel"],
            [P.SEND, "SendMessages"],
            [P.EMBED, "EmbedLinks"],
            [P.ATTACH, "AttachFiles"],
            [P.MANAGE_ROLES, "ManageRoles"],
          ]
            .filter(([bit]) => !has(bits, bit))
            .map(([, name]) => name),
        },
        botPermissions: bits.toString(),
      };
    },
  };
}
function inviteUrl(clientId, guildId) {
  return `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: clientId, scope: "bot applications.commands", permissions: "268553280", guild_id: guildId, disable_guild_select: "true" })}`;
}
module.exports = {
  createDiscord,
  canManageGuild,
  guildPermissions,
  channelPermissions,
  has,
  P,
  DANGEROUS,
  inviteUrl,
};
