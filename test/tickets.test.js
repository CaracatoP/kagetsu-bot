const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection, PermissionFlagsBits: P } = require("discord.js");
const { createTickets } = require("../src/platform/tickets");
function fixture() {
  let ticket,
    creates = 0;
  const roles = new Collection(),
    channels = new Collection(),
    sends = [];
  const owner = {
    id: "owner",
    roles: {
      cache: new Collection(),
      add: async (id) => owner.roles.cache.set(id, roles.get(id)),
      remove: async (id) => owner.roles.cache.delete(id),
    },
    permissions: { has: () => true },
  };
  const db = {
    release() {},
    async query(sql, p = []) {
      if (sql.startsWith("INSERT INTO tickets"))
        ticket = {
          id: p[0],
          guild_id: p[1],
          resource_id: p[2],
          owner_id: p[3],
          status: "open",
          provisioning_state: "creating",
          updated_at: new Date(),
        };
      if (sql.includes("SELECT") && sql.includes("FROM tickets"))
        return { rows: ticket ? [ticket] : [] };
      if (sql.includes("FROM guild_resources"))
        return { rows: [{ data: { supportRoleIds: ["staff"] } }] };
      if (sql.includes("SET temporary_role_id=$3"))
        ticket.temporary_role_id = p[2];
      if (sql.includes("SET temporary_role_id=NULL"))
        ticket.temporary_role_id = null;
      if (sql.includes("SET channel_id=$3")) {
        ticket.channel_id = p[2];
        ticket.provisioning_state = "ready";
      }
      if (sql.includes("status='closed'")) {
        ticket.status = "closed";
        ticket.transcript = p[2];
      }
      if (sql.includes("status='open'")) ticket.status = "open";
      if (sql.includes("status='deleted'")) ticket.status = "deleted";
      return { rows: [] };
    },
  };
  const guild = {
    id: "guild",
    name: "Guild",
    members: {
      me: {
        id: "bot",
        permissions: { has: () => true },
        roles: { highest: { comparePositionTo: () => 1 } },
      },
      fetchMe: async () => guild.members.me,
      fetch: async () => owner,
    },
    roles: {
      fetch: async (id) => (id ? roles.get(id) : roles),
      create: async (data) => {
        creates++;
        const role = {
          id: `role${creates}`,
          name: data.name,
          permissions: { bitfield: 0n },
          managed: false,
          delete: async () => roles.delete(role.id),
        };
        roles.set(role.id, role);
        return role;
      },
    },
    channels: {
      fetch: async (id) => (id ? channels.get(id) : channels),
      create: async (data) => {
        const overwrites = new Collection(
          data.permissionOverwrites.map((o) => [o.id, o]),
        );
        const channel = {
          id: "channel",
          guildId: "guild",
          name: data.name,
          topic: data.topic,
          permissionOverwrites: {
            cache: overwrites,
            edit: async (id, changes) =>
              overwrites.set(id, { ...overwrites.get(id), ...changes }),
            delete: async (id) => overwrites.delete(id),
          },
          messages: { fetch: async () => new Collection() },
          send: async (payload) => sends.push(payload),
          delete: async () => channels.delete(channel.id),
        };
        channels.set(channel.id, channel);
        return channel;
      },
    },
  };
  roles.set("staff", { id: "staff" });
  const ctx = {
    pool: { connect: async () => db, query: db.query },
    configs: { get: async () => ({ tickets: {} }) },
    store: { audit: async () => {} },
    log: async () => {},
  };
  const api = createTickets(ctx);
  return {
    api,
    guild,
    owner,
    roles,
    channels,
    sends,
    get ticket() {
      return ticket;
    },
    get creates() {
      return creates;
    },
    interaction: {
      guild,
      user: { id: "owner", username: "user" },
      editReply: async () => {},
    },
    resource: { id: "resource", data: { supportRoleIds: ["staff"] } },
  };
}
test("ticket private role lifecycle, retry, close attachment, reopen and cleanup", async () => {
  const f = fixture();
  await f.api.open(f.interaction, f.resource, "support");
  await f.api.open(f.interaction, f.resource, "support");
  assert.equal(f.creates, 1);
  assert.ok(f.owner.roles.cache.has(f.ticket.temporary_role_id));
  const channel = f.channels.get("channel"),
    overwrites = channel.permissionOverwrites.cache;
  assert.deepEqual(overwrites.get("guild").deny, [P.ViewChannel]);
  assert.ok(
    overwrites.get(f.ticket.temporary_role_id).allow.includes(P.ViewChannel),
  );
  assert.ok(overwrites.has("staff"));
  assert.equal(overwrites.has("owner"), false);
  await f.api.action(f.guild, "owner", f.ticket.id, "close");
  assert.equal(overwrites.get(f.ticket.temporary_role_id).SendMessages, false);
  assert.equal(overwrites.get("owner").SendMessages, false);
  const payload = f.sends.at(-1);
  assert.equal(payload.content.includes("<!doctype"), false);
  assert.ok(payload.files[0].name.endsWith(".html"));
  await f.api.action(f.guild, "owner", f.ticket.id, "reopen");
  assert.equal(overwrites.get(f.ticket.temporary_role_id).SendMessages, true);
  await f.api.action(f.guild, "owner", f.ticket.id, "close");
  await f.api.action(f.guild, "owner", f.ticket.id, "delete");
  assert.equal(f.roles.size, 1);
  assert.equal(f.channels.size, 0);
  assert.equal(f.owner.roles.cache.size, 0);
});
test("ticket reconciliation restores missing role and removes role after manual channel deletion", async () => {
  const f = fixture();
  await f.api.open(f.interaction, f.resource, "support");
  f.roles.delete(f.ticket.temporary_role_id);
  await f.api.reconcile(f.guild);
  assert.equal(f.creates, 2);
  assert.ok(f.roles.has(f.ticket.temporary_role_id));
  f.channels.clear();
  await f.api.reconcile(f.guild);
  assert.equal(f.ticket.status, "deleted");
  assert.equal(f.ticket.temporary_role_id, null);
});

test("transcript escapes content and only links safe HTTPS attachments", async () => {
  const { transcript } = require("../src/platform/tickets");
  const message = {
    id: "1",
    createdTimestamp: 0,
    author: {
      id: "u",
      tag: "<script>",
      bot: true,
      displayAvatarURL: () => "https://cdn.discordapp.com/avatar.png",
    },
    content: "<img onerror=alert(1)>",
    attachments: new Collection([
      ["a", { name: "unsafe", url: "javascript:alert(1)" }],
      ["b", { name: "safe", url: "https://cdn.discordapp.com/file.png" }],
    ]),
    embeds: [{ title: "<script>", description: "body", fields: [] }],
  };
  const result = await transcript(
    {
      id: "c",
      name: "Ticket",
      guildId: "A",
      messages: { fetch: async () => new Collection([["1", message]]) },
    },
    { id: "t", owner_id: "u" },
    "staff",
  );
  assert.equal(result.count, 1);
  assert.ok(result.html.includes("&lt;img"));
  assert.ok(!result.html.includes('href="javascript:'));
  assert.ok(result.html.includes("[BOT]"));
  assert.ok(
    result.html.includes('<img src="https://cdn.discordapp.com/avatar.png"'),
  );
});
