const definitions = {
  slayer: [
    {
      level: 5,
      name: "Mizunoto",
      env: "RANK_SLAYER_MIZUNOTO",
    },
    {
      level: 10,
      name: "Mizunoe",
      env: "RANK_SLAYER_MIZUNOE",
    },
    {
      level: 15,
      name: "Kanoto",
      env: "RANK_SLAYER_KANOTO",
    },
    {
      level: 20,
      name: "Kanoe",
      env: "RANK_SLAYER_KANOE",
    },
    {
      level: 30,
      name: "Tsuchinoto",
      env: "RANK_SLAYER_TSUCHINOTO",
    },
    {
      level: 40,
      name: "Tsuchinoe",
      env: "RANK_SLAYER_TSUCHINOE",
    },
    {
      level: 50,
      name: "Hinoto",
      env: "RANK_SLAYER_HINOTO",
    },
    {
      level: 60,
      name: "Hinoe",
      env: "RANK_SLAYER_HINOE",
    },
    {
      level: 70,
      name: "Kinoto",
      env: "RANK_SLAYER_KINOTO",
    },
    {
      level: 85,
      name: "Kinoe",
      env: "RANK_SLAYER_KINOE",
    },
    {
      level: 100,
      name: "Hashira",
      env: "RANK_SLAYER_HASHIRA",
    },
  ],
  demon: [
    {
      level: 5,
      name: "Lower Moon VI",
      env: "RANK_DEMON_LOWER_MOON_VI",
    },
    {
      level: 10,
      name: "Lower Moon V",
      env: "RANK_DEMON_LOWER_MOON_V",
    },
    {
      level: 15,
      name: "Lower Moon IV",
      env: "RANK_DEMON_LOWER_MOON_IV",
    },
    {
      level: 20,
      name: "Lower Moon III",
      env: "RANK_DEMON_LOWER_MOON_III",
    },
    {
      level: 25,
      name: "Lower Moon II",
      env: "RANK_DEMON_LOWER_MOON_II",
    },
    {
      level: 30,
      name: "Lower Moon I",
      env: "RANK_DEMON_LOWER_MOON_I",
    },
    {
      level: 40,
      name: "Upper Moon VI",
      env: "RANK_DEMON_UPPER_MOON_VI",
    },
    {
      level: 50,
      name: "Upper Moon V",
      env: "RANK_DEMON_UPPER_MOON_V",
    },
    {
      level: 60,
      name: "Upper Moon IV",
      env: "RANK_DEMON_UPPER_MOON_IV",
    },
    {
      level: 70,
      name: "Upper Moon III",
      env: "RANK_DEMON_UPPER_MOON_III",
    },
    {
      level: 85,
      name: "Upper Moon II",
      env: "RANK_DEMON_UPPER_MOON_II",
    },
    {
      level: 100,
      name: "Upper Moon I",
      env: "RANK_DEMON_UPPER_MOON_I",
    },
  ],
};

module.exports = Object.fromEntries(
  Object.entries(definitions).map(([faction, ranks]) => [
    faction,
    ranks.map(({ level, name, env }) => ({
      level,
      name,
      roleId: process.env[env] || "",
    })),
  ]),
);
