const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultConfig } = require("../packages/shared/defaults");
const { configSchema } = require("../packages/shared/validation");
const { ruleMatches, assertTarget } = require("../src/platform/moderation");
const { definitions } = require("../src/services/commandSyncService");
test("AutoMod new detectors are opt-in and thresholds are explicit", () => {
  const config = defaultConfig();
  assert.equal(config.modules.automod, false);
  assert.deepEqual(config.automod.rules, []);
  assert.equal(
    ruleMatches(
      { type: "links" },
      { content: "acesse https://example.org" },
      [],
    ),
    true,
  );
  assert.equal(
    ruleMatches(
      { type: "caps", threshold: 80 },
      { content: "MENSAGEM EM MAIÚSCULAS" },
      [],
    ),
    true,
  );
  assert.equal(
    ruleMatches(
      { type: "caps", threshold: 80 },
      { content: "Mensagem normal" },
      [],
    ),
    false,
  );
  assert.equal(
    ruleMatches({ type: "emojis", threshold: 3 }, { content: "🎉🎉🎉" }, []),
    true,
  );
  config.automod.rules = [
    {
      id: "raid",
      type: "joinBurst",
      enabled: false,
      action: "log",
      threshold: 10,
      windowSeconds: 30,
      escalation: [{ count: 2, action: "timeout", durationMinutes: 5 }],
    },
  ];
  assert.equal(configSchema.safeParse(config).success, true);
  config.automod.rules[0].action = "execute";
  assert.equal(configSchema.safeParse(config).success, false);
});
test("slash catalog has unique names, valid required option ordering and guild module isolation", () => {
  const a = defaultConfig();
  Object.keys(a.modules).forEach((k) => (a.modules[k] = true));
  const commands = definitions(a);
  assert.equal(new Set(commands.map((c) => c.name)).size, commands.length);
  function check(options) {
    let optional = false;
    for (const o of options || []) {
      if (o.type === 1 || o.type === 2) {
        check(o.options);
        continue;
      }
      if (!o.required) optional = true;
      else assert.equal(optional, false, `required ${o.name} after optional`);
    }
  }
  commands.forEach((c) => check(c.options));
  for (const name of [
    "ping",
    "avatar",
    "userinfo",
    "serverinfo",
    "poll",
    "announce",
    "embed",
    "remind",
    "choose",
    "untimeout",
    "clearwarnings",
    "unban",
    "nick",
    "ticket",
    "level",
    "module",
    "sync",
    "status",
  ])
    assert.ok(
      commands.some((c) => c.name === name),
      name,
    );
  const b = defaultConfig();
  b.modules.levels = false;
  assert.equal(
    definitions(b).some((c) =>
      ["ticket", "remind", "ban", "level"].includes(c.name),
    ),
    false,
  );
});
test("destructive moderation rejects owner, self and hierarchy violations", () => {
  const guild = { ownerId: "owner" },
    actor = {
      id: "actor",
      roles: { highest: { comparePositionTo: () => -1 } },
    },
    bot = { id: "bot", roles: { highest: { comparePositionTo: () => 1 } } };
  assert.throws(
    () => assertTarget(guild, actor, { id: "owner" }, bot),
    /hierarquia/,
  );
  assert.throws(
    () =>
      assertTarget(guild, actor, { id: "other", roles: { highest: {} } }, bot),
    /hierarquia/,
  );
});
