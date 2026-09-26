require("dotenv").config({ quiet: true });
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createDatabase, initDatabase } = require("../src/database/db");
const { createXpService } = require("../src/services/xpService");
const { MAX_XP, calculateLevel } = require("../src/services/levelMath");
const { createStore } = require("../packages/database/store");
const { createPlatform } = require("../src/platform");

test(
  "PostgreSQL: migration, concorrência, cooldowns e isolamento em schema isolado",
  { timeout: 180000 },
  async () => {
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    assert.ok(
      url,
      "Configure TEST_DATABASE_URL ou DATABASE_URL para o teste de integração.",
    );
    const schema = `kagetsu_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^kagetsu_test_[a-f0-9]+$/);
    const admin = createDatabase(url);
    const pool = createDatabase(url, { options: `-c search_path=${schema}` });
    let created = false;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await pool.query(`CREATE TABLE user_levels (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp BIGINT NOT NULL DEFAULT 0,
      level INT NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY(guild_id,user_id))`);
      await pool.query(
        "INSERT INTO user_levels (guild_id,user_id,xp,level) VALUES ('g','legacy',1500,5)",
      );
      await initDatabase(pool);
      await initDatabase(pool);
      const xp = createXpService(pool);
      assert.deepEqual(await xp.getUserData("g", "legacy"), {
        xp: 1500n,
        level: 5,
      });
      const awards = Array.from({ length: 20 }, (_, i) =>
        xp.change({
          guildId: "g",
          userId: "race",
          amount: 25,
          source: i % 2 ? "voice" : "chat",
          cooldownMs: 0,
        }),
      );
      await Promise.all(awards);
      assert.deepEqual(await xp.getUserData("g", "race"), {
        xp: 500n,
        level: 2,
      });
      const voiceAwards = await Promise.all(
        Array.from({ length: 10 }, () =>
          xp.change({
            guildId: "g",
            userId: "voice",
            amount: 20,
            source: "voice",
            cooldownMs: 300000,
          }),
        ),
      );
      assert.equal(voiceAwards.filter(Boolean).length, 1);
      assert.equal((await xp.getUserData("g", "voice")).xp, 20n);
      const restarted = createXpService(pool);
      assert.equal(
        await restarted.change({
          guildId: "g",
          userId: "voice",
          amount: 20,
          source: "voice",
          cooldownMs: 300000,
        }),
        null,
      );
      assert.equal(
        await xp.change({
          guildId: "g",
          userId: "voice",
          amount: 99,
          source: "chat",
          eligible: () => false,
        }),
        null,
      );
      await xp.change({
        guildId: "g",
        userId: "race",
        operation: "remove",
        amount: 99999,
      });
      assert.deepEqual(await xp.getUserData("g", "race"), { xp: 0n, level: 0 });
      await xp.change({
        guildId: "g",
        userId: "big",
        operation: "set",
        amount: MAX_XP,
      });
      assert.equal((await xp.getUserData("g", "big")).xp, MAX_XP);
      await assert.rejects(
        xp.change({ guildId: "g", userId: "big", amount: 1 }),
        /limite/,
      );
      assert.equal((await xp.getUserData("g", "big")).xp, MAX_XP);
      await xp.change({ guildId: "other", userId: "big", amount: 20 });
      assert.equal((await xp.getUserData("other", "big")).xp, 20n);
      assert.equal((await xp.getCardData("g", "missing")).position, "4");
      const injection = "'; DROP TABLE user_levels; --";
      await xp.change({ guildId: "g", userId: injection, amount: 100 });
      assert.equal((await xp.getUserData("g", injection)).level, 1);
      const { rows } = await pool.query("SELECT xp, level FROM user_levels");
      for (const row of rows) assert.equal(row.level, calculateLevel(row.xp));
      assert.equal((await xp.getLeaderboard("g"))[0].xp, MAX_XP);
      const store = createStore(pool);
      await store.ensureGuild("A", "Servidor A");
      await store.ensureGuild("B", "Servidor B");
      const a = await store.getConfig("A"),
        b = await store.getConfig("B");
      a.config.general.prefix = "k!";
      a.config.levels.curve = {
        type: "linear",
        base: 100,
        coefficient: 50,
        thresholds: [],
      };
      await xp.change({ guildId: "A", userId: "same", amount: 1500 });
      await xp.change({ guildId: "B", userId: "same", amount: 1500 });
      await store.saveConfig("A", a.config, "admin", a.version);
      assert.equal((await store.getConfig("B")).config.general.prefix, "!");
      assert.equal((await xp.getUserData("A", "same")).level, 15);
      assert.equal((await xp.getUserData("B", "same")).level, 5);
      assert.equal((await xp.getUserData("A", "same")).xp, 1500n);
      const fresh = await store.getConfig("A");
      await assert.rejects(
        store.saveConfig("A", a.config, "other-admin", a.version),
        (error) => error.status === 409,
      );
      const resource = await store.saveResource(
        "A",
        "role_panel",
        { title: "A", options: [] },
        "admin",
      );
      assert.equal(await store.getResource("B", resource.id), null);
      await assert.rejects(
        store.saveResource(
          "B",
          "role_panel",
          { title: "Hijack" },
          "admin",
          resource.id,
          resource.version,
        ),
        (error) => error.status === 404,
      );
      assert.equal((await store.getResource("A", resource.id)).data.title, "A");
      fresh.config.levels.curve = {
        type: "custom",
        base: 100,
        coefficient: 50,
        thresholds: [100, 500, 2000],
      };
      await store.saveConfig("A", fresh.config, "admin", fresh.version);
      assert.equal((await xp.getUserData("A", "same")).level, 2);
      const stored = (
        await pool.query(
          "SELECT level FROM user_levels WHERE guild_id=$1 AND user_id=$2",
          ["A", "same"],
        )
      ).rows[0];
      assert.equal(stored.level, 2);
      assert.equal((await store.getConfig("B")).version, b.version);
      let sends = 0,
        edits = 0,
        sendAttempts = 0,
        sendRate = false,
        reactionRate = false;
      const limited = () =>
        Object.assign(new Error("429 simulated"), {
          status: 429,
          retry_after: 30,
        });
      const sent = {
        id: "discord-message",
        reactions: { removeAll: async () => {} },
        react: async () => {
          if (reactionRate) {
            reactionRate = false;
            throw limited();
          }
        },
        edit: async (payload) => {
          assert.equal(payload.embeds[0].data.title, "Edited");
          edits++;
        },
      };
      const dest = {
        id: "channel",
        guildId: "A",
        isTextBased: () => true,
        permissionsFor: () => ({ has: () => true }),
        send: async () => {
          sendAttempts++;
          if (sendRate) {
            sendRate = false;
            throw limited();
          }
          sends++;
          return sent;
        },
        messages: { fetch: async () => sent },
      };
      const botMember = {
        id: "bot",
        permissions: { has: () => true },
        roles: { highest: { comparePositionTo: () => 1 } },
      };
      const guild = {
        id: "A",
        members: {
          me: botMember,
          fetch: async () => ({ permissions: { has: () => true } }),
        },
        roles: {
          fetch: async (id) => ({
            id,
            managed: false,
            permissions: { has: () => false },
          }),
        },
        channels: { fetch: async () => dest },
      };
      const platform = createPlatform({
        client: { guilds: { cache: new Map([["A", guild]]) } },
        pool,
        store,
        configs: { get: async () => (await store.getConfig("A")).config },
      });
      const panel = await store.saveResource(
        "A",
        "role_panel",
        {
          title: "Original",
          description: "Test",
          channelId: "channel",
          type: "buttons",
          mode: "single",
          options: [{ id: "choice", label: "Role", roleId: "role" }],
        },
        "admin",
      );
      const firstJob = await store.enqueue("A", "admin", "publish_resource", {
        resourceId: panel.id,
      });
      await platform.processOnce();
      assert.equal(
        (
          await pool.query("SELECT status FROM bot_jobs WHERE id=$1", [
            firstJob.id,
          ])
        ).rows[0].status,
        "done",
      );
      const published = await store.getResource("A", panel.id);
      assert.equal(published.message_id, sent.id);
      await store.saveResource(
        "A",
        "role_panel",
        { ...panel.data, title: "Edited" },
        "admin",
        panel.id,
        published.version,
      );
      await store.enqueue("A", "admin", "publish_resource", {
        resourceId: panel.id,
      });
      await platform.processOnce();
      assert.equal(sends, 1);
      assert.equal(edits, 1);
      assert.equal(
        (await store.getResource("A", panel.id)).message_id,
        sent.id,
      );
      assert.equal(await store.getResource("B", panel.id), null);
      const reactionPanel = await store.saveResource(
        "A",
        "role_panel",
        {
          ...panel.data,
          title: "Edited",
          type: "reactions",
          options: [
            { id: "choice", label: "Role", roleId: "role", emoji: "✅" },
          ],
        },
        "admin",
      );
      reactionRate = true;
      const retryJob = await store.enqueue("A", "admin", "publish_resource", {
        resourceId: reactionPanel.id,
      });
      const duplicateJob = await store.enqueue(
        "A",
        "admin",
        "publish_resource",
        { resourceId: reactionPanel.id },
      );
      assert.equal(
        duplicateJob.id,
        retryJob.id,
        "active publish requests share a job",
      );
      await platform.processOnce();
      const partial = await store.getResource("A", reactionPanel.id);
      assert.equal(
        partial.message_id,
        sent.id,
        "message checkpoint survives reaction 429",
      );
      assert.equal(
        partial.published_data,
        null,
        "snapshot only changes after complete publication",
      );
      let pending = (
        await pool.query("SELECT * FROM bot_jobs WHERE id=$1", [retryJob.id])
      ).rows[0];
      assert.equal(pending.status, "pending");
      assert.ok(new Date(pending.available_at).getTime() > Date.now() + 20000);
      const attemptsBefore = sendAttempts;
      await platform.processOnce();
      assert.equal(sendAttempts, attemptsBefore, "no retry before Retry-After");
      await pool.query("UPDATE bot_jobs SET available_at=NOW() WHERE id=$1", [
        retryJob.id,
      ]);
      await platform.processOnce();
      assert.equal(
        sendAttempts,
        attemptsBefore,
        "retry edits checkpointed message",
      );
      assert.equal(
        (await store.getResource("A", reactionPanel.id)).status,
        "published",
      );
      const newPanel = await store.saveResource(
        "A",
        "role_panel",
        panel.data,
        "admin",
      );
      sendRate = true;
      const sendJob = await store.enqueue("A", "admin", "publish_resource", {
        resourceId: newPanel.id,
      });
      await platform.processOnce();
      assert.equal(
        (await store.getResource("A", newPanel.id)).message_id,
        null,
      );
      const beforeRetry = sends;
      await platform.processOnce();
      assert.equal(sends, beforeRetry);
      await pool.query("UPDATE bot_jobs SET available_at=NOW() WHERE id=$1", [
        sendJob.id,
      ]);
      await platform.processOnce();
      assert.equal(
        sends,
        beforeRetry + 1,
        "exactly one successful message after send 429",
      );
      assert.equal(
        (await store.getResource("A", newPanel.id)).status,
        "published",
      );
      const initialA = await store.getConfig("A");
      assert.equal(initialA.onboarding_completed_at, null);
      await pool.query(
        "UPDATE guild_settings SET onboarding_completed_at=NOW() WHERE guild_id=$1",
        ["A"],
      );
      assert.ok((await store.getConfig("A")).onboarding_completed_at);
      assert.equal((await store.getConfig("B")).onboarding_completed_at, null);
      initialA.config.modules.moderation = true;
      const changed = await store.saveConfig(
        "A",
        initialA.config,
        "admin",
        initialA.version,
      );
      changed.config.modules.tickets = true;
      await store.saveConfig("A", changed.config, "admin", changed.version);
      const syncJobs = await pool.query(
        "SELECT * FROM bot_jobs WHERE guild_id=$1 AND action='sync_commands' AND status='pending'",
        ["A"],
      );
      assert.equal(syncJobs.rows.length, 1);
      assert.equal(
        (await store.getConfig("B")).config.modules.moderation,
        false,
      );
    } finally {
      await pool.end();
      if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
