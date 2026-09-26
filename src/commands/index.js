const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require("discord.js");
const commands = {
  level: require("./rank"),
  rank: require("./rank"),
  leaderboard: require("./leaderboard"),
  perfil: require("./profile"),
  xp: require("./xp"),
  prestige: require("./prestige"),
};
const userOption = (option) =>
  option.setName("usuario").setDescription("Usuário que deseja consultar");
const slashCommands = [
  new SlashCommandBuilder()
    .setName("level")
    .setDescription("Consultar nível e XP")
    .addUserOption(userOption),
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Mostra seu rank no Kagetsu")
    .addUserOption(userOption),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Mostra o ranking de XP")
    .addStringOption((o) =>
      o
        .setName("tipo")
        .setDescription("Ranking global ou sazonal")
        .addChoices(
          { name: "XP global", value: "xp" },
          { name: "Temporada", value: "season" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("prestige")
    .setDescription("Reinicia XP sazonal e conquista prestígio"),
  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Mostra seu perfil no Kagetsu")
    .addUserOption(userOption),
  ["add", "remove", "set"].reduce(
    (builder, operation) =>
      builder.addSubcommand((sub) =>
        sub
          .setName(operation)
          .setDescription(
            {
              add: "Adiciona XP",
              remove: "Remove XP",
              set: "Define o XP total",
            }[operation],
          )
          .addUserOption((option) => userOption(option).setRequired(true))
          .addIntegerOption((option) =>
            option
              .setName("quantidade")
              .setDescription("Quantidade de XP")
              .setRequired(true)
              .setMinValue(operation === "set" ? 0 : 1)
              .setMaxValue(Number.MAX_SAFE_INTEGER),
          ),
      ),
    new SlashCommandBuilder()
      .setName("xp")
      .setDescription("Administra o XP de um usuário")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  ),
].map((command) => command.setContexts(InteractionContextType.Guild).toJSON());
async function execute(name, context) {
  const payload = await commands[name].execute(context);
  return { ...payload, allowedMentions: { parse: [], repliedUser: false } };
}
module.exports = { commands, slashCommands, execute };
