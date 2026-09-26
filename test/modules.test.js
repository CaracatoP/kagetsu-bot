const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createGuildConfigService,
} = require("../src/services/guildConfigService");
test("config invalidation prevents stale in-flight reads from restoring disabled modules; guilds remain isolated", async () => {
  const reads = [];
  const service = createGuildConfigService(
    {},
    {
      getConfig: (id) => new Promise((resolve) => reads.push({ id, resolve })),
    },
  );
  const old = service.get("A");
  const other = service.get("B");
  service.invalidate("A");
  const current = service.get("A");
  reads[2].resolve({ config: { modules: { tickets: true } } });
  reads[1].resolve({ config: { modules: { tickets: false } } });
  reads[0].resolve({ config: { modules: { tickets: false } } });
  assert.equal((await old).modules.tickets, true);
  assert.equal(await old, await current);
  assert.equal((await other).modules.tickets, false);
  assert.equal(service.peek("A").modules.tickets, true);
  assert.equal(reads.length, 3);
});

test("command module requirements distinguish prestige from XP and fail closed for disabled flags", () => {
  const {
    commandEnabled,
    enabled,
    MODULES,
  } = require("../packages/shared/modules");
  const { moduleNames } = require("../packages/shared/validation");
  assert.deepEqual(moduleNames, MODULES);
  const a = { modules: { levels: false, prestige: true, seasons: true } };
  assert.equal(commandEnabled(a, "prestige"), true);
  assert.equal(commandEnabled(a, "rank"), false);
  assert.equal(
    commandEnabled({ modules: { prestige: true } }, "prestige"),
    false,
  );
  assert.equal(enabled({ modules: { tickets: "true" } }, "tickets"), false);
});

test("resource cache coalesces reads, survives invalidation races and never converts an error to empty", async () => {
  const { createResourceCache } = require("../src/platform/common");
  const reads = [];
  const cache = createResourceCache({
    listResources: () =>
      new Promise((resolve, reject) => reads.push({ resolve, reject })),
  });
  const old = cache.list("A", "role_panel");
  const duplicate = cache.list("A", "role_panel");
  assert.equal(reads.length, 1);
  cache.invalidate("A");
  const fresh = cache.list("A", "role_panel");
  reads[1].resolve([{ id: "saved" }]);
  reads[0].resolve([]);
  assert.deepEqual(await old, [{ id: "saved" }]);
  assert.deepEqual(await duplicate, await fresh);
  const failed = cache.list("B", "role_panel");
  reads[2].reject(new Error("database unavailable"));
  await assert.rejects(failed, /database unavailable/);
});

test("guild slash command set follows modules and is a single idempotent batch", async () => {
  const {
    definitions,
    syncCommands,
  } = require("../src/services/commandSyncService");
  const { defaultConfig } = require("../packages/shared/defaults");
  const a = defaultConfig(),
    b = defaultConfig();
  b.modules.levels = false;
  b.modules.moderation = true;
  assert.ok(definitions(a).some((c) => c.name === "rank"));
  assert.equal(
    definitions(b).some((c) => c.name === "rank"),
    false,
  );
  assert.ok(definitions(b).some((c) => c.name === "ban"));
  let hash,
    calls = 0;
  const db = {
    release() {},
    query: async (sql, p) => {
      if (sql.startsWith("INSERT INTO guild_command_sync")) hash = p[1];
      return {
        rows:
          sql.startsWith("SELECT command_hash") && hash
            ? [{ command_hash: hash }]
            : [],
      };
    },
  };
  const ctx = {
    pool: { connect: async () => db },
    store: { getConfig: async () => ({ config: a }) },
  };
  const guild = {
    id: "A",
    commands: {
      set: async () => {
        calls++;
      },
    },
  };
  await syncCommands(ctx, guild);
  await syncCommands(ctx, guild);
  assert.equal(calls, 1);
  a.modules.levels = false;
  await syncCommands(ctx, guild);
  assert.equal(calls, 2);
});
