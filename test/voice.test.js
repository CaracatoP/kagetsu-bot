const { test } = require("node:test");
const assert = require("node:assert/strict");
const { defaultConfig } = require("../packages/shared/defaults");
const { createVoiceXpService } = require("../src/services/voiceXpService");
function fixture(applyOverride) {
  let time = 0,
    connected = true;
  const guild = {
    id: "g",
    available: true,
    afkChannelId: "afk",
    voiceStates: { cache: new Map() },
  };
  const awards = [];
  const config = defaultConfig();
  config.levels.requireProgression = true;
  config.progressions = [
    { id: "p", name: "A", baseRoleId: "base", exclusiveGroup: "", ranks: [] },
  ];
  const client = {
    guilds: { cache: new Map([["g", guild]]) },
    isReady: () => connected,
  };
  const service = createVoiceXpService({
    client,
    configs: { get: async () => config, peek: () => config },
    now: () => time,
    apply:
      applyOverride ||
      (async (member, options) => {
        if (options.eligible()) awards.push(member.id);
      }),
  });
  function member(id, options = {}) {
    const state = {
      channelId: "call",
      deaf: false,
      suppress: false,
      member: {
        id,
        guild,
        user: { bot: false },
        roles: { cache: new Map([["base", {}]]) },
      },
      ...options,
    };
    guild.voiceStates.cache.set(id, state);
    service.refreshGuild(guild);
    return state;
  }
  return {
    guild,
    service,
    awards,
    member,
    advance: (ms) => {
      time += ms;
    },
    disconnect: () => {
      connected = false;
    },
  };
}
test("voz exige companhia e cinco minutos contínuos; não paga atrasados", async () => {
  const f = fixture();
  f.service.start();
  try {
    f.member("a");
    f.advance(300000);
    await f.service.tick();
    assert.equal(f.awards.length, 0);
    f.member("b");
    f.advance(299999);
    await f.service.tick();
    assert.equal(f.awards.length, 0);
    f.advance(1);
    await f.service.tick();
    assert.deepEqual(f.awards, ["a", "b"]);
    await f.service.tick();
    assert.equal(f.awards.length, 2);
    f.advance(3000000);
    await f.service.tick();
    assert.equal(f.awards.length, 4);
  } finally {
    f.service.stop();
  }
});
test("sair, deaf, AFK, bots e perda da facção interrompem elegibilidade", async () => {
  for (const reason of ["leave", "deaf", "afk", "bot", "faction", "suppress"]) {
    const f = fixture();
    f.service.start();
    try {
      const a = f.member("a");
      f.member("b");
      f.advance(299999);
      if (reason === "leave") a.channelId = null;
      if (reason === "deaf") a.deaf = true;
      if (reason === "afk") a.channelId = "afk";
      if (reason === "bot") a.member.user.bot = true;
      if (reason === "faction") a.member.roles.cache.clear();
      if (reason === "suppress") a.suppress = true;
      f.service.refreshGuild(f.guild);
      f.advance(1);
      await f.service.tick();
      assert.ok(!f.awards.includes("a"), reason);
      Object.assign(a, { channelId: "call", deaf: false, suppress: false });
      a.member.user.bot = false;
      a.member.roles.cache.set("base", {});
      f.service.refreshGuild(f.guild);
      f.advance(299999);
      await f.service.tick();
      assert.ok(!f.awards.includes("a"), reason);
      f.advance(1);
      await f.service.tick();
      assert.ok(f.awards.includes("a"), reason);
    } finally {
      f.service.stop();
    }
  }
});
test("restart e desconexão reiniciam o tempo; ticks não se sobrepõem", async () => {
  let release,
    calls = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture(async () => {
    calls++;
    await gate;
  });
  f.service.start();
  try {
    f.member("a");
    f.member("b");
    f.advance(300000);
    const pending = f.service.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await f.service.tick();
    assert.equal(calls, 1);
    release();
    await pending;
    assert.equal(calls, 2);
    f.service.stop();
    f.service.start();
    await f.service.tick();
    assert.equal(calls, 2);
    f.disconnect();
    f.advance(300000);
    await f.service.tick();
    assert.equal(calls, 2);
  } finally {
    release();
    f.service.stop();
  }
});
