function activeProgressions(member, config) {
  if (!member) return [];
  const active = config.progressions.filter(
    (p) => !p.baseRoleId || member.roles.cache.has(p.baseRoleId),
  );
  return active.filter(
    (p) =>
      !p.exclusiveGroup ||
      active.filter((other) => other.exclusiveGroup === p.exclusiveGroup)
        .length === 1,
  );
}
function qualifies(rank, level, xp, member) {
  return (
    level >= rank.level &&
    BigInt(xp) >= BigInt(rank.xp || 0) &&
    (!rank.requiredRoleId || member?.roles.cache.has(rank.requiredRoleId))
  );
}
function rewardsFor(member, config, level, xp) {
  const active = activeProgressions(member, config),
    selected = [];
  function select(ranks, mode) {
    const earned = ranks
      .filter((rank) => qualifies(rank, level, xp, member))
      .sort(
        (a, b) =>
          a.level - b.level || (BigInt(a.xp || 0) > BigInt(b.xp || 0) ? 1 : -1),
      );
    return mode === "stack" ? earned : earned.slice(-1);
  }
  selected.push(
    ...select(
      config.rewards,
      config.levels.rewardMode === "stack" ? "stack" : "highest",
    ),
  );
  for (const progression of active)
    selected.push(...select(progression.ranks, progression.mode));
  return {
    active,
    selected,
    rank: selected.slice().sort((a, b) => b.level - a.level)[0],
  };
}
function eligibleForXp(member, channelId, config) {
  if (!member || member.user.bot || !config.modules.levels) return false;
  if (config.levels.blockedChannelIds.includes(channelId)) return false;
  if (config.levels.blockedRoleIds.some((id) => member.roles.cache.has(id)))
    return false;
  return (
    !config.levels.requireProgression ||
    activeProgressions(member, config).length > 0
  );
}
function multiplier(member, channelId, config) {
  const channel = config.levels.channelMultipliers[channelId] ?? 1;
  const role = Object.entries(config.levels.roleMultipliers)
    .filter(([id]) => member.roles.cache.has(id))
    .map(([, value]) => value);
  return channel * (role.length ? Math.max(...role) : 1);
}
module.exports = {
  activeProgressions,
  qualifies,
  rewardsFor,
  eligibleForXp,
  multiplier,
};
