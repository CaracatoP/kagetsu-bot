require("dotenv").config({ quiet: true });
module.exports = {
  token: process.env.DISCORD_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
};
