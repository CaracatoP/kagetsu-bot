require("./config");
const { Client, Events, GatewayIntentBits, Partials } = require("discord.js");
const { randomUUID } = require("node:crypto");
const { createDatabase, initDatabase } = require("./database/db");
const { createStore } = require("../packages/database/store");
const { createGuildConfigService } = require("./services/guildConfigService");
const { createXpService } = require("./services/xpService");
const { createRankService } = require("./services/rankService");
const { createLevelUpService } = require("./services/levelUpService");
const { createProgressionService } = require("./services/progressionService");
const { createVoiceXpService } = require("./services/voiceXpService");
const { createMetricsService } = require("./services/metricsService");
const { attachAchievements } = require("./services/achievementsService");
const { createPlatform } = require("./platform");
const { attachHandlers } = require("./handlers");
const logger = require("../packages/shared/logger");
async function main() {
  if (!process.env.DISCORD_TOKEN || !process.env.DATABASE_URL)
    throw new Error("Configure DISCORD_TOKEN e DATABASE_URL.");
  const pool = createDatabase(),
    store = createStore(pool),
    configs = createGuildConfigService(pool, store);
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.User,
    ],
    rest: { timeout: 15000, retries: 2 },
  });
  const xp = createXpService(pool, configs),
    ranks = createRankService(pool, configs),
    metrics = createMetricsService(pool, configs);
  const apply = createProgressionService(
    xp,
    ranks,
    createLevelUpService(configs),
    configs,
    metrics,
  );
  const voice = createVoiceXpService({ client, configs, apply, metrics });
  const platform = createPlatform({
    client,
    pool,
    store,
    configs,
    apply,
    metrics,
  });
  attachAchievements({ pool, configs, store, metrics, xp, ranks, client });
  const handlers = attachHandlers(client, {
    pool,
    store,
    configs,
    xp,
    ranks,
    apply,
    voice,
    metrics,
    platform,
  });
  const instance = randomUUID();
  let heartbeat,
    stopping = false;
  async function beat() {
    await pool.query(
      "INSERT INTO bot_status(instance_id,guild_ids,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(instance_id) DO UPDATE SET guild_ids=$2,last_seen=NOW()",
      [instance, [...client.guilds.cache.keys()]],
    );
  }
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    await handlers.stop();
    await configs.stop();
    await client.destroy();
    await pool
      .query("DELETE FROM bot_status WHERE instance_id=$1", [instance])
      .catch(() => {});
    await pool.end();
  }
  const started = new Promise((resolve, reject) =>
    client.once(Events.ClientReady, () => {
      void (async () => {
        await handlers.start();
        await beat();
        heartbeat = setInterval(
          () => void beat().catch((err) => logger.error({ err }, "Heartbeat")),
          30000,
        );
        heartbeat.unref();
        logger.info({ bot: client.user.tag }, "Kagetsu online");
        resolve();
      })().catch(reject);
    }),
  );
  void started.catch(() => {});
  client.on(Events.Error, (err) => logger.error({ err }, "Discord client"));
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  try {
    await initDatabase(pool);
    await configs.start();
    await client.login(process.env.DISCORD_TOKEN);
    await started;
  } catch (err) {
    await shutdown();
    throw err;
  }
  return { client, pool, shutdown };
}
if (require.main === module)
  main().catch((err) => {
    logger.error({ err }, "Falha ao iniciar");
    process.exitCode = 1;
  });
module.exports = { main };
