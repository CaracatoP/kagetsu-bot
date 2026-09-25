const MAX_XP = 9223372036854775807n,
  MAX_LEVEL = 2147483647;
const DEFAULT_CURVE = {
  type: "progressive",
  coefficient: 50,
  base: 100,
  thresholds: [],
};
function totalXpForLevel(level, curve = DEFAULT_CURVE) {
  const n = BigInt(level);
  if (curve.type === "linear") return BigInt(curve.base) * n;
  if (curve.type === "custom") {
    if (level <= 0) return 0n;
    const thresholds = curve.thresholds || [];
    return level > thresholds.length
      ? MAX_XP + 1n
      : BigInt(thresholds[level - 1]);
  }
  return BigInt(curve.coefficient || 50) * n * (n + 1n);
}
function calculateLevel(xp, curve = DEFAULT_CURVE) {
  xp = BigInt(xp);
  let low = 0,
    high =
      curve.type === "custom"
        ? (curve.thresholds?.length || 0) + 1
        : MAX_LEVEL + 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (totalXpForLevel(mid, curve) <= xp) low = mid;
    else high = mid;
  }
  return low;
}
function randomXp(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
module.exports = {
  MAX_XP,
  MAX_LEVEL,
  DEFAULT_CURVE,
  totalXpForLevel,
  calculateLevel,
  randomXp,
};
