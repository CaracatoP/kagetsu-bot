const { test } = require("node:test");
const { Response } = globalThis;
const assert = require("node:assert/strict");
const { createTransport } = require("../apps/api/discordTransport");
const { createDiscord } = require("../apps/api/discord");
const { createApp } = require("../apps/api/app");
const { createSecurity } = require("../apps/api/security");
const { defaultConfig } = require("../packages/shared/defaults");
const { randomUUID } = require("node:crypto");
const A = "111111111111111111",
  B = "222222222222222222",
  U = "333333333333333333",
  R = "444444444444444444",
  C = "555555555555555555";
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
test("Discord Retry-After: body/header maximum, single flight, global cooldown and no token logs", async () => {
  let now = 0,
    calls = 0;
  const logs = [];
  const request = createTransport({
    now: () => now,
    logger: { info: (x) => logs.push(x), warn: (x) => logs.push(x) },
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? json({ retry_after: 2.5, global: true }, 429, { "Retry-After": "5" })
        : json({ ok: true });
    },
  });
  const options = {
    botToken: "secret-token",
    context: { guildId: A, operation: "publish_metadata" },
  };
  await assert.rejects(
    request(`/guilds/${A}/roles`, options),
    (e) => e.retryAfter === 5,
  );
  now = 4999;
  await assert.rejects(
    request(`/guilds/${A}/channels`, options),
    (e) => e.status === 429,
  );
  assert.equal(calls, 1);
  now = 5000;
  await Promise.all(
    Array.from({ length: 10 }, () => request(`/guilds/${A}/roles`, options)),
  );
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(logs).includes("secret-token"));
  assert.ok(
    logs.some(
      (x) =>
        x.status === 429 &&
        x.guild_id === A &&
        x.endpoint === "/guilds/:id/roles" &&
        x.retryAfter === 5,
    ),
  );
});
test("metadata TTL, per-guild isolation and stale fallback for each exact Discord route", async () => {
  for (const failed of ["guild", "roles", "channels", "member"]) {
    let now = 0,
      fail = false,
      calls = 0;
    const logs = [],
      warnings = [];
    const client = createDiscord({
      clientId: U,
      botToken: "bot-secret",
      now: () => now,
      logger: { info: (x) => logs.push(x), warn: (x) => logs.push(x) },
      fetchImpl: async (url) => {
        calls++;
        const path = new URL(url).pathname;
        const gid = path.split("/")[4];
        const kind = path.endsWith("/roles")
          ? "roles"
          : path.endsWith("/channels")
            ? "channels"
            : path.includes("/members/")
              ? "member"
              : "guild";
        if (fail && gid === A && kind === failed)
          return json({ retry_after: 10 }, 429);
        if (kind === "roles")
          return json([
            { id: gid, name: "everyone", position: 0, permissions: "0" },
            { id: R, name: "Role", position: 1, permissions: "0" },
            { id: U, name: "Bot", position: 2, permissions: "268454912" },
          ]);
        if (kind === "channels")
          return json([
            {
              id: C,
              name: "channel-" + gid,
              type: 0,
              permission_overwrites: [],
            },
          ]);
        if (kind === "member") return json({ user: { id: U }, roles: [U] });
        return json({ id: gid, name: "Guild-" + gid });
      },
    });
    const original = await client.metadata(A);
    assert.equal(calls, 4);
    await client.metadata(A);
    assert.equal(calls, 4);
    now = 60001;
    fail = true;
    assert.deepEqual(
      await client.metadata(A, { warn: (x) => warnings.push(x) }),
      original,
    );
    assert.equal(calls, 8);
    assert.equal(warnings.length, 1);
    await client.metadata(A, { warn: (x) => warnings.push(x) });
    assert.equal(calls, 8);
    const other = await client.metadata(B);
    assert.equal(other.guild.id, B);
    assert.equal(calls, 12);
    assert.ok(logs.some((x) => x.status === 429 && x.cache === "stale"));
  }
});
test("auth cache never grants stale mutation permissions; revoked permissions replace prior reads", async () => {
  let now = 0,
    calls = 0,
    mode = "allow";
  const client = createDiscord({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return mode === "rate"
        ? json({ retry_after: 20 }, 429)
        : json(mode === "allow" ? [{ id: A, permissions: "32" }] : []);
    },
  });
  await client.guilds("user-token");
  await client.guilds("user-token");
  assert.equal(calls, 1);
  now = 30001;
  mode = "rate";
  const warnings = [];
  assert.equal(
    (await client.guilds("user-token", { warn: (w) => warnings.push(w) }))
      .length,
    1,
  );
  await assert.rejects(
    client.guilds("user-token", { fresh: true }),
    (e) => e.status === 429,
  );
  assert.equal(calls, 2);
  now = 50002;
  mode = "deny";
  assert.deepEqual(await client.guilds("user-token", { fresh: true }), []);
  assert.deepEqual(await client.guilds("user-token"), []);
  assert.equal(calls, 3);
});
test("HTTP persisted lists and draft save survive metadata 429; cold auth failure is not an empty list", async (t) => {
  const security = createSecurity("k".repeat(48)),
    session = security.random();
  let now = Date.now(),
    limited = false,
    authLimited = false,
    metadataCalls = 0;
  const pool = {
    query: async (sql) => ({
      rows: sql.includes("FROM sessions")
        ? [
            {
              id_hash: security.hash(session),
              user_id: U,
              user_data: { id: U },
              encrypted_tokens: security.encrypt({
                access_token: "token",
                expires_at: Date.now() + 999999,
              }),
            },
          ]
        : sql.includes("online")
          ? [{ online: true }]
          : [],
    }),
  };
  const resources = [
    {
      id: randomUUID(),
      guild_id: A,
      kind: "role_panel",
      data: { title: "Existing" },
      status: "published",
      version: 1,
    },
  ];
  const store = {
    ensureGuild: async () => {},
    getConfig: async () => ({ config: defaultConfig(), version: 1 }),
    saveConfig: async (gid, config) => ({ config, version: 2, guild_id: gid }),
    listResources: async (gid) => resources.filter((x) => x.guild_id === gid),
    saveResource: async (gid, kind, data) => {
      const resource = {
        id: randomUUID(),
        guild_id: gid,
        kind,
        data,
        status: "draft",
        version: 1,
      };
      resources.push(resource);
      return resource;
    },
  };
  const discord = createDiscord({
    clientId: U,
    botToken: "bot",
    now: () => now,
    fetchImpl: async (url) => {
      const path = new URL(url).pathname;
      if (path.includes("/users/@me/guilds"))
        return authLimited
          ? json({ retry_after: 11 }, 429)
          : json([
              { id: A, name: "A", permissions: "32" },
              { id: B, name: "B", permissions: "32" },
            ]);
      metadataCalls++;
      if (limited) return json({ retry_after: 12 }, 429);
      if (path.endsWith("/roles"))
        return json([
          { id: A, name: "everyone", permissions: "0", position: 0 },
          { id: R, name: "role", permissions: "0", position: 1 },
          { id: U, name: "bot", permissions: "8", position: 2 },
        ]);
      if (path.endsWith("/channels"))
        return json([{ id: C, name: "channel", type: 0 }]);
      if (path.includes("/members/"))
        return json({ user: { id: U }, roles: [U] });
      return json({ id: A, name: "A" });
    },
  });
  const app = createApp({
    pool,
    store,
    discord,
    env: {
      SESSION_SECRET: "k".repeat(48),
      WEB_URL: "http://localhost:3000",
      LOG_LEVEL: "silent",
    },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`,
    headers = {
      cookie: `kagetsu_session=${session}`,
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-csrf-token": security.csrf(session),
    };
  assert.equal((await fetch(`${base}/guilds/${A}`, { headers })).status, 200);
  now += 60001;
  limited = true;
  let response = await fetch(`${base}/guilds/${A}`, { headers });
  const detail = await response.json();
  assert.equal(response.status, 200);
  assert.equal(detail.metadataStatus, "stale");
  const before = metadataCalls;
  response = await fetch(`${base}/guilds/${A}/resources?kind=role_panel`, {
    headers,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).resources.length, 1);
  assert.equal(metadataCalls, before);
  response = await fetch(`${base}/guilds/${A}/resources`, {
    headers,
    method: "POST",
    body: JSON.stringify({
      kind: "role_panel",
      data: {
        name: "Saved",
        title: "Saved",
        channelId: C,
        type: "buttons",
        mode: "multiple",
        options: [{ id: "choice", label: "Role", roleId: R }],
      },
    }),
  });
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.resource.data.title, "Saved");
  assert.ok(saved.warnings.length);
  response = await fetch(`${base}/guilds/${A}/resources`, { headers });
  assert.equal((await response.json()).resources.length, 2);
  response = await fetch(`${base}/guilds/${B}/resources`, { headers });
  assert.deepEqual((await response.json()).resources, []);
  // No previous metadata for B: database draft save still succeeds with explicit warning.
  response = await fetch(`${base}/guilds/${B}/resources`, {
    headers,
    method: "POST",
    body: JSON.stringify({
      kind: "role_panel",
      data: {
        name: "B",
        title: "B",
        channelId: C,
        type: "buttons",
        mode: "multiple",
        options: [{ id: "choice", label: "Role", roleId: R }],
      },
    }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).warnings[0].unavailable, true);
  response = await fetch(`${base}/guilds/${B}/config`, {
    headers,
    method: "PUT",
    body: JSON.stringify({ config: defaultConfig(), version: 1 }),
  });
  assert.equal(response.status, 200);
  const configSaved = await response.json();
  assert.equal(configSaved.version, 2);
  assert.ok(configSaved.warnings.length);
  now += 130000;
  authLimited = true;
  response = await fetch(`${base}/guilds/${A}/resources`, { headers });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "11");
  const error = await response.json();
  assert.equal(error.resources, undefined);
  assert.equal(error.error.retryAfter, 11);
});
test("45 job polls plus navigation: warm metadata costs zero Discord calls, mutations keep one permission check", async () => {
  let calls = 0;
  const client = createDiscord({
    clientId: U,
    botToken: "bot",
    fetchImpl: async (url) => {
      calls++;
      const path = new URL(url).pathname;
      if (path.includes("/users/@me/guilds"))
        return json([{ id: A, permissions: "32" }]);
      if (path.endsWith("/roles"))
        return json([
          { id: A, permissions: "0", position: 0 },
          { id: U, permissions: "8", position: 2 },
        ]);
      if (path.endsWith("/channels")) return json([]);
      if (path.includes("/members/"))
        return json({ user: { id: U }, roles: [U] });
      return json({ id: A, name: "A" });
    },
  });
  await client.guilds("user");
  await client.metadata(A);
  await client.guilds("user");
  assert.equal(calls, 5);
  for (let i = 0; i < 45; i++) await client.guilds("user");
  assert.equal(calls, 5);
  await client.guilds("user", { fresh: true });
  await client.metadata(A);
  assert.equal(calls, 6);
  await client.guilds("user", { fresh: true });
  await client.metadata(A);
  assert.equal(calls, 7);
  await client.guilds("user");
  assert.equal(calls, 7);
});
test("frontend API retains valid results, throws on failed lists, isolates sessions and honors polling Retry-After", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    ts = require("../apps/web/node_modules/typescript");
  const code = ts.transpileModule(
    fs.readFileSync("apps/web/src/lib/api.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  let now = 1000,
    calls = 0,
    mode = "list";
  const sleeps = [];
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const context = {
    exports: {},
    Date: Clock,
    Map,
    Set,
    Promise,
    Error,
    Math,
    Number,
    Array,
    fetch: async () => {
      calls++;
      if (mode === "rate" || mode === "poll") {
        if (mode === "poll") mode = "done";
        return json({ error: { message: "temporário", retryAfter: 7 } }, 429, {
          "Retry-After": "7",
        });
      }
      if (mode === "done")
        return json({
          job: { id: "job", status: "done", result: { messageId: "same" } },
        });
      return json({ resources: [{ id: "saved" }] });
    },
    setTimeout: (fn, ms) => {
      sleeps.push(ms);
      now += ms;
      fn();
    },
  };
  vm.runInNewContext(code, context);
  const api = context.exports;
  api.setCsrf("one");
  const loaded = await api.api(`/guilds/${A}/resources`);
  assert.equal(loaded.resources.length, 1);
  await api.api(`/guilds/${A}/resources`);
  assert.equal(calls, 1);
  now += 16000;
  mode = "rate";
  await assert.rejects(
    api.api(`/guilds/${A}/resources`),
    (e) => e.status === 429 && e.retryAfter === 7,
  );
  assert.equal(loaded.resources.length, 1);
  assert.equal(api.getRetryDeadline(), now + 7000);
  mode = "list";
  api.setCsrf("two");
  await api.api(`/guilds/${A}/resources`);
  assert.equal(calls, 3);
  mode = "poll";
  const job = await api.waitJob(A, { job: { id: "job" } });
  assert.equal(job.result.messageId, "same");
  assert.deepEqual(sleeps, [7000]);
});
test("panel emoji whitespace is normalized for buttons/selects; invalid text is rejected before Discord", () => {
  const { rolePayload } = require("../src/platform/roles");
  const { parseResource } = require("../packages/shared/validation");
  const data = {
    name: "Panel",
    title: "Panel",
    channelId: C,
    type: "buttons",
    mode: "single",
    options: [{ id: "demon", label: "Demon", roleId: R, emoji: "🩸 " }],
  };
  assert.equal(parseResource("role_panel", data).options[0].emoji, "🩸");
  const button = rolePayload({ id: "panel", data }).components[0].components[0];
  assert.equal(button.data.emoji.name, "🩸");
  const select = rolePayload({ id: "panel", data: { ...data, type: "select" } })
    .components[0].components[0];
  assert.equal(select.options[0].data.emoji.name, "🩸");
  assert.throws(() =>
    parseResource("role_panel", {
      ...data,
      options: [{ ...data.options[0], emoji: "invalid emoji" }],
    }),
  );
  assert.throws(() =>
    rolePayload({
      id: "panel",
      data: { ...data, options: [{ ...data.options[0], emoji: "🩸 🗡️" }] },
    }),
  );
});
test("bot role lookup propagates 429 instead of misreporting a removed role", async () => {
  const { createRoles } = require("../src/platform/roles");
  const limited = Object.assign(new Error("rate"), {
    status: 429,
    retry_after: 20,
  });
  const guild = {
    id: A,
    members: { me: {} },
    roles: {
      fetch: async () => {
        throw limited;
      },
    },
  };
  await assert.rejects(
    createRoles({}).validate(guild, {
      id: "panel",
      data: {
        title: "Panel",
        type: "buttons",
        options: [{ id: "option", label: "Role", roleId: R, emoji: "🩸 " }],
      },
    }),
    (e) => e === limited,
  );
});
