const { PermissionFlagsBits: P } = require("discord.js");
const { randomInt } = require("node:crypto");
const { mentionless, embed, actor, channel, UserError } = require("./common");
const { MODULES } = require("../../packages/shared/modules");
const option = (name, description, type = 3, required = true) => ({
  name,
  description,
  type,
  required,
});
const specs = {
  remind: [
    "Agendar lembrete neste canal",
    [
      {
        ...option("minutos", "Em quantos minutos?", 4),
        min_value: 1,
        max_value: 43200,
      },
      { ...option("texto", "Lembrete"), max_length: 1000 },
    ],
  ],
  ping: ["Latência do Kagetsu"],
  uptime: ["Tempo de atividade"],
  avatar: ["Avatar de um usuário", [option("usuario", "Usuário", 6, false)]],
  userinfo: [
    "Informações do usuário",
    [option("usuario", "Usuário", 6, false)],
  ],
  serverinfo: ["Informações deste servidor"],
  roleinfo: ["Informações de um cargo", [option("cargo", "Cargo", 8)]],
  channelinfo: ["Informações do canal", [option("canal", "Canal", 7, false)]],
  botinfo: ["Informações do Kagetsu"],
  choose: [
    "Escolher entre alternativas",
    [{ ...option("opcoes", "Alternativas separadas por |"), max_length: 1000 }],
  ],
  announce: [
    "Publicar um anúncio",
    [{ ...option("texto", "Mensagem"), max_length: 2000 }],
    P.ManageMessages,
  ],
  embed: [
    "Publicar um embed",
    [
      { ...option("titulo", "Título"), max_length: 256 },
      { ...option("descricao", "Descrição"), max_length: 2000 },
    ],
    P.ManageMessages,
  ],
  poll: [
    "Criar enquete",
    [
      { ...option("pergunta", "Pergunta"), max_length: 300 },
      {
        ...option("opcoes", "De 2 a 10 respostas separadas por |"),
        max_length: 1000,
      },
    ],
    P.ManageMessages,
  ],
  module: [
    "Ativar ou desativar módulo",
    [
      {
        ...option("modulo", "ID do módulo"),
        choices: MODULES.map((id) => ({ name: id, value: id })),
      },
      option("ativo", "Ativar?", 5),
    ],
    P.ManageGuild,
  ],
  config: ["Consultar módulos e configuração geral", [], P.ManageGuild],
  sync: ["Reconciliar comandos da guild", [], P.ManageGuild],
  status: ["Consultar status do bot", [], P.ManageGuild],
};
const slashCommands = Object.entries(specs).map(
  ([name, [description, options = [], permission]]) => ({
    name,
    description,
    options,
    ...(permission
      ? { default_member_permissions: permission.toString() }
      : {}),
  }),
);
async function execute(i, ctx, config) {
  const name = i.commandName,
    user = i.options.getUser("usuario") || i.user;
  let content;
  if (name === "remind") {
    if (!config.modules.scheduler)
      throw new UserError("Módulo de mensagens agendadas desativado.");
    const member = await i.guild.members.fetch(i.user.id);
    if (!i.channel.permissionsFor(member)?.has([P.ViewChannel, P.SendMessages]))
      throw new UserError("Sem permissão neste canal.");
    await ctx.store.enqueue(
      i.guildId,
      i.user.id,
      "reminder",
      {
        channelId: i.channelId,
        text: i.options.getString("texto"),
        requestId: i.id,
      },
      i.options.getInteger("minutos") * 60,
    );
    content = "Lembrete salvo e agendado neste canal.";
  }
  if (name === "ping")
    content = `Latência gateway: ${Math.max(0, Math.round(ctx.client.ws.ping))} ms.`;
  if (name === "uptime")
    content = `Online há ${Math.floor(process.uptime() / 60)} minutos.`;
  if (name === "avatar")
    return i.editReply(
      mentionless({
        embeds: [
          embed({
            title: user.username,
            imageUrl: user.displayAvatarURL({ extension: "png", size: 1024 }),
          }),
        ],
      }),
    );
  if (name === "userinfo") {
    const member = await i.guild.members.fetch(user.id);
    content = `${member.displayName} · @${user.username}\nID: ${user.id}\nConta criada: <t:${Math.floor(user.createdTimestamp / 1000)}:F>\nEntrou: <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;
  }
  if (name === "serverinfo")
    content = `${i.guild.name}\nID: ${i.guild.id}\nMembros: ${i.guild.memberCount}\nCriado: <t:${Math.floor(i.guild.createdTimestamp / 1000)}:F>`;
  if (name === "roleinfo") {
    const role = i.options.getRole("cargo");
    content = `${role.name}\nID: ${role.id}\nPosição: ${role.position}\nCor: ${role.hexColor}\nGerenciado por integração: ${role.managed ? "sim" : "não"}`;
  }
  if (name === "channelinfo") {
    const selected = i.options.getChannel("canal") || i.channel;
    if (!selected.permissionsFor(i.member)?.has(P.ViewChannel))
      throw new UserError("Você não pode acessar esse canal.");
    content = `#${selected.name}\nID: ${selected.id}\nTipo: ${selected.type}`;
  }
  if (name === "botinfo")
    content = `Kagetsu · Bot multi-servidor\nTempo de atividade: ${Math.floor(process.uptime() / 60)} minutos.\nUse /help para os comandos disponíveis.`;
  if (name === "choose") {
    const choices = i.options
      .getString("opcoes")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean);
    if (choices.length < 2)
      throw new UserError("Informe ao menos duas opções separadas por |.");
    content = choices[randomInt(choices.length)];
  }
  if (["announce", "embed", "poll"].includes(name)) {
    const member = await actor(i.guild, i.user.id, P.ManageMessages),
      dest = await channel(i.guild, i.channelId);
    if (
      !dest
        .permissionsFor(member)
        ?.has([P.ViewChannel, P.SendMessages, P.ManageMessages])
    )
      throw new UserError("Sem permissão neste canal.");
    const payload =
      name === "announce"
        ? { content: i.options.getString("texto") }
        : name === "embed"
          ? {
              embeds: [
                embed({
                  title: i.options.getString("titulo"),
                  description: i.options.getString("descricao"),
                }),
              ],
            }
          : {
              poll: {
                question: { text: i.options.getString("pergunta") },
                answers: i.options
                  .getString("opcoes")
                  .split("|")
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .map((text) => ({ text })),
                duration: 24,
                allowMultiselect: false,
              },
            };
    if (
      payload.poll &&
      (payload.poll.answers.length < 2 ||
        payload.poll.answers.length > 10 ||
        payload.poll.answers.some((a) => a.text.length > 55))
    )
      throw new UserError("Use 2 a 10 opções com até 55 caracteres cada.");
    await dest.send(
      mentionless({ ...payload, nonce: i.id, enforceNonce: true }),
    );
    await ctx.store.audit(i.guildId, i.user.id, `command.${name}`, i.channelId);
    content = "Publicado neste canal.";
  }
  if (["module", "config", "sync", "status"].includes(name)) {
    await actor(i.guild, i.user.id);
    if (name === "module") {
      const id = i.options.getString("modulo");
      if (!MODULES.includes(id)) throw new UserError("Módulo inválido.");
      const saved = await ctx.store.getConfig(i.guildId);
      saved.config.modules[id] = i.options.getBoolean("ativo");
      await ctx.store.saveConfig(
        i.guildId,
        saved.config,
        i.user.id,
        saved.version,
      );
      ctx.configs.invalidate(i.guildId);
      content = "Configuração salva. A sincronização de comandos foi agendada.";
    }
    if (name === "config")
      content = `Prefixo: ${config.general.prefix}\nMódulos ativos: ${MODULES.filter((id) => config.modules[id]).join(", ") || "nenhum"}`;
    if (name === "sync") {
      await ctx.store.enqueue(i.guildId, i.user.id, "sync_commands", {});
      content =
        "Sincronização agendada. Se o conjunto não mudou, nenhuma chamada ao Discord será feita.";
    }
    if (name === "status") {
      await ctx.pool.query("SELECT 1");
      content = `Bot online · Banco conectado · ${Math.max(0, Math.round(ctx.client.ws.ping))} ms`;
    }
  }
  return i.editReply(
    mentionless({ content: content || "Comando indisponível." }),
  );
}
module.exports = { slashCommands, execute };
