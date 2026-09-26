export type Data = Record<string, any>;
export type User = {
  id: string;
  username: string;
  global_name?: string;
  globalName?: string;
  avatar?: string;
};
export type Guild = {
  id: string;
  name: string;
  icon?: string;
  installed: boolean;
  inviteUrl?: string;
  memberCount?: number;
};
export type Channel = { id: string; name: string; type: number };
export type Role = {
  id: string;
  name: string;
  color?: number;
  manageable: boolean;
  dangerous: boolean;
};
export type GuildContext = {
  onboarding_completed_at?: string | null;
  guild: Guild;
  metadataStatus?: string;
  config: Data;
  version: number;
  channels: Channel[];
  roles: Role[];
  permissions: { missing: string[]; unavailable?: boolean };
  status: Data;
};
export type Resource = {
  id: string;
  guild_id: string;
  kind: string;
  data: Data;
  published_data?: Data | null;
  status: string;
  channel_id?: string;
  message_id?: string;
  version: number;
  created_at?: string;
  updated_at?: string;
};
export type Job = { id: string; status: string; error?: string; result?: Data };
export type Section = {
  id: string;
  name: string;
  group: string;
  description: string;
  module?: string;
  kind?: string;
};
export const sections: Section[] = [
  {
    id: "overview",
    name: "Visão geral",
    group: "",
    description: "Um olhar sobre a sua comunidade.",
  },
  {
    id: "levels",
    name: "XP & Níveis",
    group: "Comunidade",
    module: "levels",
    description: "Reconheça quem faz parte da conversa.",
  },
  {
    id: "rewards",
    name: "Recompensas",
    group: "Comunidade",
    module: "levels",
    description: "Transforme participação em reconhecimento.",
  },
  {
    id: "progressions",
    name: "Progressões",
    group: "Comunidade",
    module: "roles",
    description: "Crie caminhos independentes para sua comunidade.",
  },
  {
    id: "welcome",
    name: "Boas-vindas",
    group: "Comunidade",
    module: "welcome",
    description: "Faça cada chegada ser especial.",
  },
  {
    id: "profile",
    name: "Perfil",
    group: "Comunidade",
    description: "Escolha o que aparece nos perfis da comunidade.",
  },
  {
    id: "role-panels",
    name: "Painéis de cargos",
    group: "Automação",
    module: "roles",
    kind: "role_panel",
    description: "Dê à sua comunidade a liberdade de escolher.",
  },
  {
    id: "embeds",
    name: "Criador de embeds",
    group: "Automação",
    kind: "embed",
    description: "Mensagens que merecem destaque.",
  },
  {
    id: "scheduler",
    name: "Mensagens agendadas",
    group: "Automação",
    module: "scheduler",
    kind: "scheduled_message",
    description: "A mensagem certa, na hora certa.",
  },
  {
    id: "commands",
    name: "Comandos personalizados",
    group: "Automação",
    module: "customCommands",
    kind: "custom_command",
    description: "Respostas úteis, ao alcance de um comando.",
  },
  {
    id: "moderation",
    name: "Moderação",
    group: "Segurança",
    module: "moderation",
    description: "Histórico de casos e respostas proporcionais.",
  },
  {
    id: "automod",
    name: "AutoMod",
    group: "Segurança",
    module: "automod",
    description: "Defina as regras para uma conversa melhor.",
  },
  {
    id: "logs",
    name: "Logs",
    group: "Segurança",
    module: "logs",
    description: "Acompanhe o que acontece no servidor.",
  },
  {
    id: "tickets",
    name: "Tickets",
    group: "Interação",
    module: "tickets",
    kind: "ticket_panel",
    description: "Um espaço reservado para cada atendimento.",
  },
  {
    id: "suggestions",
    name: "Sugestões",
    group: "Interação",
    module: "suggestions",
    kind: "suggestion",
    description: "Boas ideias começam com espaço para ouvir.",
  },
  {
    id: "events",
    name: "Eventos",
    group: "Interação",
    module: "events",
    kind: "event",
    description: "Crie momentos para reunir a comunidade.",
  },
  {
    id: "giveaways",
    name: "Sorteios",
    group: "Interação",
    module: "giveaways",
    kind: "giveaway",
    description: "Celebre sua comunidade com algo especial.",
  },
  {
    id: "tempVoice",
    name: "Salas temporárias",
    group: "Interação",
    module: "tempVoice",
    description: "Salas de voz que acompanham a conversa.",
  },
  {
    id: "seasons",
    name: "Temporadas",
    group: "Progresso",
    module: "seasons",
    kind: "season",
    description: "Novos ciclos, com todo o histórico preservado.",
  },
  {
    id: "achievements",
    name: "Conquistas",
    group: "Progresso",
    module: "achievements",
    kind: "achievement",
    description: "Pequenas vitórias merecem ser lembradas.",
  },
  {
    id: "missions",
    name: "Missões",
    group: "Progresso",
    module: "missions",
    kind: "mission",
    description: "Incentive participação com objetivos claros.",
  },
  {
    id: "prestige",
    name: "Prestígio",
    group: "Progresso",
    module: "prestige",
    description: "Um novo capítulo para quem chegou ao topo.",
  },
  {
    id: "modules",
    name: "Módulos",
    group: "Configurações",
    description: "Seu servidor. Suas funcionalidades.",
  },
  {
    id: "appearance",
    name: "Aparência",
    group: "Configurações",
    description: "A identidade da comunidade em cada card.",
  },
  {
    id: "general",
    name: "Servidor",
    group: "Configurações",
    description: "Os detalhes que fazem o Kagetsu ser seu.",
  },
  {
    id: "audit",
    name: "Auditoria",
    group: "Configurações",
    description: "Um registro transparente de cada alteração.",
  },
  {
    id: "status",
    name: "Status do Kagetsu",
    group: "Configurações",
    description: "Diagnóstico e integridade da configuração.",
  },
  {
    id: "setup",
    name: "Configuração rápida",
    group: "Configurações",
    description: "Tudo pronto para receber a comunidade.",
  },
];
export const moduleNames: Record<string, string> = {
  levels: "XP & Níveis",
  roles: "Cargos e progressões",
  welcome: "Boas-vindas",
  moderation: "Moderação",
  automod: "AutoMod",
  logs: "Logs",
  tickets: "Tickets",
  suggestions: "Sugestões",
  events: "Eventos",
  giveaways: "Sorteios",
  tempVoice: "Salas temporárias",
  scheduler: "Mensagens agendadas",
  customCommands: "Comandos personalizados",
  achievements: "Conquistas",
  missions: "Missões",
  seasons: "Temporadas",
  prestige: "Prestígio",
};
