const { MODULES } = require("./defaults");
const COMMAND_MODULES = Object.freeze({
  ticket: ["tickets"],
  level: ["levels"],
  remind: ["scheduler"],
  rank: ["levels"],
  leaderboard: ["levels"],
  perfil: ["levels"],
  xp: ["levels"],
  prestige: ["prestige", "seasons"],
  sugerir: ["suggestions"],
  sala: ["tempVoice"],
});
function enabled(config, name) {
  return MODULES.includes(name) && config?.modules?.[name] === true;
}
function commandEnabled(config, name) {
  return (COMMAND_MODULES[name] || []).every((id) => enabled(config, id));
}
module.exports = { MODULES, COMMAND_MODULES, enabled, commandEnabled };
