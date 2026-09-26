const INFO = {
  levels: [
    "XP por mensagens e voz, níveis e ranking.",
    [],
    ["SendMessages", "AttachFiles"],
  ],
  roles: ["Painéis, progressões e atribuição de cargos.", [], ["ManageRoles"]],
  welcome: [
    "Mensagens, embeds e cards de entrada e saída.",
    [],
    ["SendMessages", "EmbedLinks", "AttachFiles"],
  ],
  moderation: [
    "Ações manuais e histórico de moderação.",
    [],
    ["ManageMessages", "ModerateMembers", "KickMembers", "BanMembers"],
  ],
  automod: [
    "Regras automáticas opcionais e escalonamento.",
    [],
    ["ManageMessages", "ModerateMembers"],
  ],
  logs: [
    "Registros de eventos em canais configurados.",
    [],
    ["SendMessages", "EmbedLinks"],
  ],
  tickets: [
    "Atendimento privado com cargo temporário e transcript.",
    [],
    ["ManageChannels", "ManageRoles", "ReadMessageHistory", "AttachFiles"],
  ],
  suggestions: [
    "Receber e acompanhar sugestões.",
    [],
    ["SendMessages", "EmbedLinks"],
  ],
  events: [
    "Publicar eventos e participantes.",
    [],
    ["SendMessages", "EmbedLinks"],
  ],
  giveaways: [
    "Publicar sorteios e encerrar inscrições.",
    [],
    ["SendMessages", "EmbedLinks"],
  ],
  tempVoice: [
    "Criar e gerenciar salas temporárias.",
    [],
    ["ManageChannels", "MoveMembers"],
  ],
  scheduler: ["Mensagens agendadas e lembretes.", [], ["SendMessages"]],
  customCommands: [
    "Respostas configuráveis por prefixo.",
    [],
    ["SendMessages"],
  ],
  achievements: [
    "Reconhecer conquistas de membros.",
    ["levels"],
    ["ManageRoles"],
  ],
  missions: ["Objetivos periódicos para a comunidade.", ["levels"], []],
  seasons: ["Ranking e progresso sazonal.", ["levels"], []],
  prestige: ["Recomeço do XP sazonal com prestígio.", ["seasons"], []],
};
function moduleDetails(id) {
  const [description, dependencies, permissions] = INFO[id] || ["", [], []];
  return { description, dependencies, permissions };
}
module.exports = { moduleDetails };
