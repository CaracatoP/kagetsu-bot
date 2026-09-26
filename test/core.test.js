const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PermissionsBitField, PermissionFlagsBits } = require("discord.js");
const {
  MAX_XP,
  totalXpForLevel,
  calculateLevel,
} = require("../src/services/levelMath");
const { getTargetRank } = require("../src/services/rankService");
const {
  activeProgressions,
  rewardsFor,
  eligibleForXp,
  multiplier,
} = require("../packages/shared/progressions");
const { defaultConfig } = require("../packages/shared/defaults");
const { validate, canManage, execute } = require("../src/commands/xp");
const { slashCommands } = require("../src/commands");
test("curva original e limites BIGINT sem perda de precisão", () => {
  for (const level of [0, 1, 5, 25, 100, 10000, 100000000]) {
    const xp = totalXpForLevel(level);
    assert.equal(calculateLevel(xp), level);
    if (level > 0) assert.equal(calculateLevel(xp - 1n), level - 1);
  }
  const maxLevel = calculateLevel(MAX_XP);
  assert.ok(totalXpForLevel(maxLevel) <= MAX_XP);
  assert.ok(totalXpForLevel(maxLevel + 1) > MAX_XP);
});
test("progressões genéricas exclusivas, recompensas e bloqueios", () => {
  const c = defaultConfig(),
    member = {
      user: { bot: false },
      roles: {
        cache: new Map([
          ["a", {}],
          ["b", {}],
          ["vip", {}],
        ]),
      },
    };
  c.progressions = ["a", "b"].map((id) => ({
    id,
    name: id,
    baseRoleId: id,
    exclusiveGroup: "teams",
    mode: "highest",
    ranks: [
      {
        level: 5,
        name: "Veterano",
        roleId: "rank",
        xp: "1500",
        requiredRoleId: "vip",
      },
    ],
  }));
  assert.equal(activeProgressions(member, c).length, 0);
  member.roles.cache.delete("b");
  assert.equal(activeProgressions(member, c).length, 1);
  assert.equal(rewardsFor(member, c, 5, 1500n).rank.name, "Veterano");
  member.roles.cache.delete("vip");
  assert.equal(rewardsFor(member, c, 5, 1500n).rank, undefined);
  c.levels.channelMultipliers.channel = 2;
  c.levels.roleMultipliers.a = 1.5;
  assert.equal(multiplier(member, "channel", c), 3);
  c.levels.blockedChannelIds = ["channel"];
  assert.equal(eligibleForXp(member, "channel", c), false);
  assert.equal(getTargetRank([{ level: 20 }, { level: 5 }], 25).level, 20);
});
test("XP administrativo exige permissão e inteiros válidos", async () => {
  for (const amount of [
    -1,
    1.5,
    "1e3",
    "12abc",
    "",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.ok(validate("add", amount));
  assert.ok(validate("add", 0));
  assert.ok(validate("remove", 0));
  assert.equal(validate("set", 0), null);
  assert.equal(validate("add", Number.MAX_SAFE_INTEGER), null);
  assert.ok(validate("invalid", 10));
  assert.equal(canManage({ permissions: new PermissionsBitField(0n) }), false);
  for (const permission of [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.Administrator,
  ]) {
    assert.equal(
      canManage({ permissions: new PermissionsBitField(permission) }),
      true,
    );
  }
  const result = await execute({
    actor: { permissions: new PermissionsBitField(0n) },
  });
  assert.match(result.content, /precisa/);
});
test("slash commands expõem opções e subcomandos tipados", () => {
  assert.deepEqual(
    slashCommands.map((c) => c.name),
    ["level", "rank", "leaderboard", "prestige", "perfil", "xp"],
  );
  const xp = slashCommands.find((c) => c.name === "xp");
  assert.equal(
    xp.default_member_permissions,
    PermissionFlagsBits.ManageGuild.toString(),
  );
  assert.deepEqual(
    xp.options.map((o) => o.name),
    ["add", "remove", "set"],
  );
  assert.equal(xp.options[2].options[1].min_value, 0);
});
