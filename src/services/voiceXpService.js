const { performance } = require("node:perf_hooks");
const { randomXp } = require("./levelMath");
const {
  eligibleForXp,
  multiplier,
} = require("../../packages/shared/progressions");
const logger = require("../../packages/shared/logger");
function createVoiceXpService({
  client,
  configs,
  apply,
  metrics,
  now = () => performance.now(),
}) {
  const sessions = new Map();
  let timer,
    running = false,
    active = false;
  function eligibleMembers(guild, config) {
    const channels = new Map();
    if (!config?.modules.levels || !config.levels.voice.enabled)
      return new Map();
    for (const state of guild.voiceStates.cache.values()) {
      if (
        !state.channelId ||
        state.channelId === guild.afkChannelId ||
        state.deaf ||
        state.suppress ||
        !state.member ||
        state.member.user.bot
      )
        continue;
      const list = channels.get(state.channelId) || [];
      list.push(state.member);
      channels.set(state.channelId, list);
    }
    const eligible = new Map();
    for (const [channelId, members] of channels) {
      if (members.length < 2) continue;
      for (const member of members)
        if (
          eligibleForXp(member, channelId, config) &&
          multiplier(member, channelId, config) > 0
        )
          eligible.set(member.id, { member, channelId });
    }
    return eligible;
  }
  function clearGuild(gid) {
    for (const [key, s] of sessions)
      if (s.member.guild.id === gid) sessions.delete(key);
  }
  function refreshGuild(guild) {
    const config = configs.peek(guild.id);
    if (!active || !guild.available || !client.isReady() || !config) {
      clearGuild(guild.id);
      return;
    }
    const eligible = eligibleMembers(guild, config);
    for (const [key, s] of sessions)
      if (
        s.member.guild.id === guild.id &&
        eligible.get(s.member.id)?.channelId !== s.channelId
      )
        sessions.delete(key);
    for (const [id, value] of eligible) {
      const key = `${guild.id}:${id}`;
      if (!sessions.has(key)) sessions.set(key, { ...value, since: now() });
    }
  }
  async function tick() {
    if (running || !active) return;
    running = true;
    try {
      for (const guild of client.guilds.cache.values()) {
        await configs.get(guild.id);
        refreshGuild(guild);
      }
      for (const [key, s] of sessions) {
        if (!active) break;
        const config = configs.peek(s.member.guild.id);
        if (!config) continue;
        const intervalMs = config.levels.voice.intervalMinutes * 60000;
        if (now() - s.since < intervalMs) continue;
        const eligible = () =>
          active &&
          sessions.get(key) === s &&
          eligibleMembers(s.member.guild, configs.peek(s.member.guild.id)).get(
            s.member.id,
          )?.channelId === s.channelId;
        try {
          if (!eligible()) {
            sessions.delete(key);
            continue;
          }
          const change = await apply(s.member, {
            amount: Math.floor(
              randomXp(config.levels.voice.min, config.levels.voice.max) *
                multiplier(s.member, s.channelId, config),
            ),
            source: "voice",
            cooldownMs: intervalMs,
            eligible,
          });
          if (change)
            metrics?.record(s.member.guild.id, s.member.id, {
              voiceSeconds: intervalMs / 1000,
            });
        } catch (err) {
          logger.error({ err, guildId: s.member.guild.id }, "XP de voz");
        }
        if (sessions.get(key) === s) s.since = now();
      }
    } finally {
      running = false;
    }
  }
  function start() {
    if (active) return;
    active = true;
    for (const guild of client.guilds.cache.values()) refreshGuild(guild);
    timer = setInterval(
      () => void tick().catch((err) => logger.error({ err }, "Ciclo de voz")),
      15000,
    );
    timer.unref?.();
  }
  function stop() {
    active = false;
    clearInterval(timer);
    sessions.clear();
  }
  async function drain() {
    while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { start, stop, tick, refreshGuild, clearGuild, drain };
}
module.exports = { createVoiceXpService };
