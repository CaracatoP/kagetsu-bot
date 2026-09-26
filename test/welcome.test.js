const test = require("node:test");
const assert = require("node:assert/strict");
const { renderTemplate, welcomeData } = require("../packages/shared/welcome");
const { welcomePayload } = require("../src/platform/welcome");
const { defaultConfig } = require("../packages/shared/defaults");
const { configSchema } = require("../packages/shared/validation");
test("welcome and leave placeholders, embeds, safe images and cards share configuration", async () => {
  const member = {
    id: "123",
    displayName: "Apelido",
    user: {
      username: "Nome",
      displayAvatarURL() {
        throw new Error("offline");
      },
    },
    guild: { name: "Guild A", memberCount: 9 },
  };
  assert.equal(
    renderTemplate(
      "{user} {username} {displayName} {server} {memberCount} {userId}",
      welcomeData(member),
    ),
    "<@123> Nome Apelido Guild A 9 123",
  );
  const config = defaultConfig();
  config.welcome.type = "mixed";
  config.welcome.design = {
    title: "Olá {displayName}",
    imageUrl: "https://cdn.discordapp.com/test.gif",
  };
  const payload = await welcomePayload(member, config);
  assert.ok(payload.content.includes("Guild A"));
  assert.equal(payload.embeds[0].data.title, "Olá Apelido");
  assert.ok(payload.embeds[0].data.image.url.endsWith(".gif"));
  config.welcome.leaveType = "card";
  const leave = await welcomePayload(member, config, true);
  assert.equal(leave.files[0].name, "leave.png");
  assert.ok(configSchema.safeParse(config).success);
  config.welcome.design.imageUrl = "javascript:alert(1)";
  assert.equal(configSchema.safeParse(config).success, false);
});
