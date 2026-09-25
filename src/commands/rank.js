const { AttachmentBuilder } = require("discord.js");
const { createRankCard } = require("../cards/rankCard");
const { cardData } = require("./cardData");
async function execute(context) {
  const image = await createRankCard(await cardData(context));
  return {
    files: [new AttachmentBuilder(image, { name: "kagetsu-rank.png" })],
  };
}
module.exports = { execute };
