const fs = require("node:fs/promises");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const { createRankCard } = require("../src/cards/rankCard");
const { createProfileCard } = require("../src/cards/profileCard");
const { createLeaderboardCard } = require("../src/cards/leaderboardCard");
const { totalXpForLevel } = require("../src/services/levelMath");
async function main() {
  const output = path.resolve(__dirname, "../artifacts");
  await fs.mkdir(output, { recursive: true });
  const canvas = createCanvas(128, 128),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#38385a";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#b4acff";
  ctx.beginPath();
  ctx.arc(64, 48, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(64, 124, 48, 0, Math.PI * 2);
  ctx.fill();
  const avatar = `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
  const user = {
    username: "Tsukikage",
    globalName: "Tsukikage · Guardião da Lua",
    displayAvatarURL: () => avatar,
  };
  const data = {
    user,
    level: 25,
    xp: totalXpForLevel(25) + 1750n,
    faction: "slayer",
    rank: "Kanoe",
    position: "7",
    gameStyle: "PvP & PvE",
    specialRole: "Guardião da Lua",
  };
  await fs.writeFile(
    path.join(output, "rank-preview.png"),
    await createRankCard(data),
  );
  await fs.writeFile(
    path.join(output, "profile-preview.png"),
    await createProfileCard(data),
  );
  const long = {
    ...data,
    user: {
      ...user,
      globalName: "👨‍👩‍👧‍👦 WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    },
    rank: "Um rank com nome extremamente longo para validar a truncagem",
  };
  await fs.writeFile(
    path.join(output, "rank-long-name.png"),
    await createRankCard(long),
  );
  await fs.writeFile(
    path.join(output, "profile-long-name.png"),
    await createProfileCard({
      ...long,
      specialRole:
        "Nome de cargo especial extremamente longo WWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    }),
  );
  const guild = {
    name: "Kagetsu · Comunidade",
    members: {
      fetch: async (id) => ({
        user,
        displayName: Number(id) % 2 ? user.globalName : long.user.globalName,
      }),
    },
  };
  const users = Array.from({ length: 10 }, (_, i) => ({
    user_id: String(i),
    xp: 120000n - BigInt(i) * 4000n,
    level: 40 - i,
    position: i + 1,
  }));
  await fs.writeFile(
    path.join(output, "leaderboard-preview.png"),
    await createLeaderboardCard({ guild, users }),
  );
  console.log(`Cards renderizados em ${output}`);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
