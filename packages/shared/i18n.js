const dictionary = {
  "pt-BR": {
    disabled: "Este módulo está desativado.",
    error: "Não foi possível concluir. Consulte os logs do bot.",
    guildOnly: "Use este comando em um servidor.",
    emptyLeaderboard: "Ainda não há membros neste ranking.",
    level: "Nível",
    rank: "Rank",
    progression: "Progressão",
    profile: "PERFIL",
    position: "POSIÇÃO NO SERVIDOR",
    badges: "BADGES",
    roles: "CARGOS",
    none: "Não definido",
    joined: "No servidor desde",
  },
  "en-US": {
    disabled: "This module is disabled.",
    error: "Could not complete this action. Check the bot logs.",
    guildOnly: "Use this command in a server.",
    emptyLeaderboard: "There are no members on this leaderboard yet.",
    level: "Level",
    rank: "Rank",
    progression: "Progression",
    profile: "PROFILE",
    position: "SERVER POSITION",
    badges: "BADGES",
    roles: "ROLES",
    none: "Not set",
    joined: "Joined",
  },
};
function translate(locale, key) {
  return (dictionary[locale] || dictionary["pt-BR"])[key] || key;
}
module.exports = { translate };
