const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../apps/api/app");
const { createSecurity, constantEqual } = require("../apps/api/security");
const {
  configSchema,
  parseResource,
  isSafeImageUrl,
} = require("../packages/shared/validation");
const { defaultConfig } = require("../packages/shared/defaults");
const { roleDelta, rolePayload } = require("../src/platform/roles");
const { nextRun } = require("../src/platform/automation");
test("OAuth tokens encrypted, CSRF constant time, URL allowlist and strict schemas", () => {
  const security = createSecurity("x".repeat(48)),
    token = { access_token: "private", expires_at: Date.now() + 1000 };
  const encrypted = security.encrypt(token);
  assert.ok(!encrypted.includes("private"));
  assert.deepEqual(security.decrypt(encrypted), token);
  assert.throws(() => security.decrypt(encrypted.slice(0, -2) + "xx"));
  assert.equal(constantEqual("a", "é"), false);
  assert.equal(isSafeImageUrl("http://127.0.0.1/private"), false);
  assert.equal(isSafeImageUrl("https://cdn.discordapp.com.evil.test/x"), false);
  assert.equal(configSchema.safeParse(defaultConfig()).success, true);
  const custom = defaultConfig();
  custom.levels.curve = {
    type: "custom",
    base: 100,
    coefficient: 50,
    thresholds: [100, 300, 1000],
  };
  assert.ok(configSchema.safeParse(custom).success);
  custom.levels.curve.thresholds = [0, 100];
  assert.ok(!configSchema.safeParse(custom).success);
  assert.throws(() =>
    parseResource("custom_command", {
      name: "test",
      response: "ok",
      guild_id: "hijack",
    }),
  );
});
test("guild authorization is repeated on mutation; CSRF and cross-guild access denied", async (t) => {
  const A = "111111111111111111",
    B = "222222222222222222",
    uid = "333333333333333333";
  let allowed = true,
    writes = 0,
    checks = 0;
  const secret = "k".repeat(48),
    security = createSecurity(secret),
    session = security.random();
  const pool = {
    query: async (sql) => ({
      rows: sql.includes("FROM sessions")
        ? [
            {
              id_hash: security.hash(session),
              user_id: uid,
              user_data: { id: uid },
              encrypted_tokens: security.encrypt({
                access_token: "token",
                expires_at: Date.now() + 999999,
              }),
              expires_at: new Date(Date.now() + 999999),
            },
          ]
        : sql.includes("online")
          ? [{ online: false }]
          : [],
    }),
  };
  const store = {
    ensureGuild: async () => {},
    getConfig: async () => ({ config: defaultConfig(), version: 1 }),
    saveConfig: async (gid, c) => {
      assert.equal(gid, A);
      writes++;
      return { config: c, version: 2 };
    },
  };
  const discord = {
    guilds: async () => {
      checks++;
      return allowed ? [{ id: A, name: "A", permissions: "32" }] : [];
    },
    metadata: async (id) => ({
      guild: { id, name: "A" },
      channels: [],
      roles: [],
      permissions: { missing: [] },
    }),
  };
  const app = createApp({
    pool,
    store,
    discord,
    env: {
      SESSION_SECRET: secret,
      WEB_URL: "http://localhost:3000",
      DISCORD_CLIENT_ID: uid,
      LOG_LEVEL: "silent",
    },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    cookie = `kagetsu_session=${session}`;
  assert.equal((await fetch(`${base}/guilds/${A}`)).status, 401);
  assert.equal(
    (await fetch(`${base}/guilds/${B}`, { headers: { cookie } })).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/guilds/${A}`, { headers: { cookie } })).status,
    200,
  );
  const options = {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-csrf-token": security.csrf(session),
    },
    body: JSON.stringify({ config: defaultConfig(), version: 1 }),
  };
  assert.equal(
    (
      await fetch(`${base}/guilds/${A}/config`, {
        ...options,
        headers: { ...options.headers, origin: "https://evil.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/guilds/${A}/config`, options)).status,
    200,
  );
  assert.equal(writes, 1);
  allowed = false;
  assert.equal(
    (await fetch(`${base}/guilds/${A}/config`, options)).status,
    403,
  );
  assert.equal(writes, 1);
  assert.ok(checks >= 4);
});
test("exclusive role groups and immutable published panel behavior", () => {
  const r = {
    id: "panel",
    data: { type: "buttons", title: "Draft", mode: "multiple", options: [] },
    published_data: {
      title: "Published",
      mode: "single",
      group: "team",
      options: [
        { id: "a", roleId: "A", label: "A" },
        { id: "b", roleId: "B", label: "B" },
      ],
    },
    status: "published",
  };
  const other = {
    id: "other",
    status: "published",
    data: { group: "team", options: [{ id: "c", roleId: "C" }] },
  };
  assert.deepEqual(
    roleDelta([r, other], r, new Set(["A", "C", "unrelated"]), ["b"]),
    { add: ["B"], remove: ["A", "C"] },
  );
  assert.throws(() => roleDelta([r], r, new Set(), ["bad"]));
  const payload = rolePayload({
    ...r,
    data: { ...r.published_data, type: "buttons" },
  });
  assert.equal(payload.components[0].components.length, 2);
  assert.match(payload.components[0].components[0].data.custom_id, /panel:a$/);
});
test("scheduled recurrence preserves local time across DST and weekday choices", () => {
  const next = nextRun(
    { runAt: "2026-03-07T14:00:00Z", recurrence: "daily" },
    "America/New_York",
    Date.parse("2026-03-07T15:00:00Z"),
  );
  assert.equal(next, "2026-03-08T13:00:00.000Z");
  assert.equal(nextRun({ recurrence: "none" }, "UTC"), null);
});
