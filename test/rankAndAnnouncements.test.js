const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionsBitField, PermissionFlagsBits } = require("discord.js");
const { defaultConfig } = require("../packages/shared/defaults");
const { createRankService } = require("../src/services/rankService");
const { createLevelUpService } = require("../src/services/levelUpService");
function fixture({ both = false, higher = false, fails = false } = {}) {
  const changes = [],
    cache = new Map([
      ["s", {}],
      ["other", {}],
      ["wrong", {}],
    ]);
  if (both) cache.set("d", {});
  const guild = { id: "g", members: {}, roles: { cache: new Map() } };
  for (const id of ["right", "wrong"])
    guild.roles.cache.set(id, {
      id,
      managed: false,
      permissions: new PermissionsBitField(0n),
    });
  const member = {
    id: "u",
    guild,
    roles: {
      cache,
      remove: async (id) => {
        changes.push(["remove", id]);
        cache.delete(id);
      },
      add: async (id) => {
        if (fails) throw new Error("simulated role error");
        changes.push(["add", id]);
        cache.set(id, {});
      },
    },
  };
  guild.members.me = {
    permissions: new PermissionsBitField(PermissionFlagsBits.ManageRoles),
    roles: { highest: { comparePositionTo: () => (higher ? -1 : 1) } },
  };
  guild.members.fetch = async () => member;
  const pool = {
    connect: async () => ({
      query: async (sql) => ({
        rows: sql.startsWith("SELECT xp") ? [{ xp: "1500" }] : [],
      }),
      release() {},
    }),
  };
  const oldConfig = {
    SLAYER_ROLE: "s",
    DEMON_ROLE: "d",
    RANKS: {
      slayer: [{ level: 5, name: "Mizunoto", roleId: "right" }],
      demon: [{ level: 5, name: "Moon", roleId: "wrong" }],
    },
  };
  const config = defaultConfig();
  config.progressions = [
    {
      id: "a",
      name: "A",
      baseRoleId: "s",
      exclusiveGroup: "x",
      mode: "highest",
      ranks: oldConfig.RANKS.slayer,
    },
    {
      id: "b",
      name: "B",
      baseRoleId: "d",
      exclusiveGroup: "x",
      mode: "highest",
      ranks: oldConfig.RANKS.demon,
    },
  ];
  return {
    member,
    changes,
    config,
    ranks: createRankService(pool, { get: async () => config }),
  };
}
test("sincroniza apenas ranks e remove rank ambíguo", async () => {
  const f = fixture();
  assert.equal((await f.ranks.sync(f.member)).ok, true);
  assert.deepEqual(f.changes, [
    ["remove", "wrong"],
    ["add", "right"],
  ]);
  assert.ok(f.member.roles.cache.has("other"));
  f.changes.length = 0;
  await f.ranks.sync(f.member);
  assert.equal(f.changes.length, 0);
  const dual = fixture({ both: true });
  await dual.ranks.sync(dual.member);
  assert.deepEqual(dual.changes, [["remove", "wrong"]]);
});
test("hierarquia e falhas de API não derrubam sincronização", async () => {
  const high = fixture({ higher: true });
  assert.equal((await high.ranks.sync(high.member)).ok, false);
  assert.equal(high.changes.length, 0);
  const failure = fixture({ fails: true });
  assert.equal((await failure.ranks.sync(failure.member)).ok, false);
});
test("anúncios usam fallback e só mostram novo rank real", async () => {
  const f = fixture(),
    sent = [];
  f.member.guild.channels = {
    fetch: async () => {
      throw new Error("canal inexistente");
    },
  };
  const fallback = {
    id: "channel",
    guild: f.member.guild,
    isSendable: () => true,
    send: async (payload) => sent.push(payload),
  };
  const announce = createLevelUpService({
    get: async () => ({
      ...f.config,
      levels: { ...f.config.levels, levelUpChannelId: "missing" },
    }),
  });
  await announce({
    member: f.member,
    change: { oldLevel: 4, level: 5 },
    rankResult: {
      ok: true,
      changed: true,
      level: 5,
      faction: "slayer",
      rankName: "Mizunoto",
    },
    fallbackChannel: fallback,
  });
  assert.match(sent[0].content, /Novo rank/);
  await announce({
    member: f.member,
    change: { oldLevel: 5, level: 6 },
    rankResult: {
      ok: true,
      changed: false,
      level: 6,
      faction: "slayer",
      rankName: "Mizunoto",
    },
    fallbackChannel: fallback,
  });
  assert.doesNotMatch(sent[1].content, /Novo rank/);
  await announce({ member: f.member, change: { oldLevel: 6, level: 2 } });
  assert.equal(sent.length, 2);
});
