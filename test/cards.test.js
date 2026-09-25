const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { truncate } = require("../src/cards/shared");
const { createRankCard } = require("../src/cards/rankCard");
const { createProfileCard } = require("../src/cards/profileCard");
test("truncagem respeita largura real e preserva grafemas", () => {
  const ctx = createCanvas(100, 100).getContext("2d");
  ctx.font = "bold 38px sans-serif";
  const name = "👨‍👩‍👧‍👦".repeat(30) + "WWWWW";
  const result = truncate(ctx, name, 400);
  assert.ok(ctx.measureText(result).width <= 400);
  assert.ok(result.endsWith("…"));
  assert.ok(!result.includes("\ufffd"));
  assert.equal(truncate(ctx, "abc", 0), "");
});
test("cards renderizam com fallback de avatar e XP zero", async () => {
  const data = {
    user: {
      username: "Nome".repeat(40),
      displayAvatarURL() {
        throw new Error("offline");
      },
    },
    xp: 0n,
    level: 0,
    position: "1",
  };
  for (const [render, height] of [
    [createRankCard, 440],
    [createProfileCard, 620],
  ]) {
    const buffer = await render(data),
      image = await loadImage(buffer);
    assert.equal(image.width, 1100);
    assert.equal(image.height, height);
  }
});
