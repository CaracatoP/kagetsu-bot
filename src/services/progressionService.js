const logger = require("../../packages/shared/logger");
function createProgressionService(
  xpService,
  rankService,
  announce,
  configs,
  metrics,
) {
  return async function apply(member, options, fallbackChannel) {
    const config = await configs.get(member.guild.id);
    const change = await xpService.change({
      ...options,
      guildId: member.guild.id,
      userId: member.id,
    });
    if (!change) return null;
    const rankResult =
      change.level !== change.oldLevel ||
      !options.source ||
      rankService.needsSync(member, config, change.level, change.xp)
        ? await rankService.sync(member)
        : { ok: true, changed: false };
    if (options.source && change.xp > change.oldXp)
      metrics?.record(member.guild.id, member.id, {
        xp: change.xp - change.oldXp,
      });
    try {
      await announce({ member, change, rankResult, fallbackChannel });
    } catch (err) {
      logger.warn({ err }, "Falha no anúncio");
    }
    return { ...change, rankResult };
  };
}
module.exports = { createProgressionService };
