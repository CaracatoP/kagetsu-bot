require("dotenv").config({ quiet: true });
function number(name, fallback, minimum = 0) {
  const value =
    process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < minimum)
    throw new Error(`Configuração inválida: ${name}`);
  return value;
}
const config = {
  XP: { min: 15, max: 25, cooldownMs: 60_000 },
  VOICE_XP: {
    enabled: process.env.VOICE_XP_ENABLED !== "false",
    intervalMinutes: number("VOICE_XP_INTERVAL_MINUTES", 5, 1),
    min: number("VOICE_XP_MIN", 20),
    max: number("VOICE_XP_MAX", 35),
  },
  SLAYER_ROLE: process.env.SLAYER_ROLE_ID || "",
  DEMON_ROLE: process.env.DEMON_ROLE_ID || "",
  LEVEL_UP_CHANNEL_ID: process.env.LEVEL_UP_CHANNEL_ID || "",
  GAME_STYLE_ROLES: {
    pvp: process.env.GAME_STYLE_PVP_ROLE_ID || "",
    pve: process.env.GAME_STYLE_PVE_ROLE_ID || "",
    both: process.env.GAME_STYLE_BOTH_ROLE_ID || "",
  },
  SPECIAL_ROLE_IDS: (process.env.SPECIAL_ROLE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  RANKS: require("./legacyRanks"),
};
for (const range of [config.XP, config.VOICE_XP]) {
  if (
    !Number.isSafeInteger(range.min) ||
    !Number.isSafeInteger(range.max) ||
    range.max < range.min
  ) {
    throw new Error(
      "Os limites de XP devem ser inteiros positivos, com max >= min.",
    );
  }
}
if (!Number.isSafeInteger(config.VOICE_XP.intervalMinutes * 60_000))
  throw new Error("Intervalo de voz inválido.");
module.exports = config;
