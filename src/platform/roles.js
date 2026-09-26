const {
  normalizeEmoji,
  isDiscordEmoji,
} = require("../../packages/shared/emoji");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { P, UserError, embed, locked, mentionless, t } = require("./common");
const {
  dangerousPermissions: dangerous,
} = require("../../packages/shared/permissions");

async function validateRole(guild, id) {
  const me = guild.members.me || (await guild.members.fetchMe());
  const role = await guild.roles.fetch(id).catch((error) => {
    if (error.code === 10011) return null;
    throw error;
  });
  if (
    !me.permissions.has(P.ManageRoles) ||
    !role ||
    role.id === guild.id ||
    role.managed ||
    me.roles.highest.comparePositionTo(role) <= 0
  )
    throw new UserError(
      "Cargo removido, gerenciado ou acima do bot. Confira Gerenciar Cargos e a hierarquia.",
    );
  if (dangerous.some((permission) => role.permissions.has(permission, false)))
    throw new UserError(
      "Cargos com permissões administrativas não podem ser concedidos automaticamente.",
    );
  return role;
}
function panelData(resource) {
  return resource.published_data || resource.data;
}
function roleDelta(resources, resource, current, chosenIds, toggle = false) {
  const data = panelData(resource),
    options = data.options || [];
  const selected = [...new Set(chosenIds)];
  if (
    selected.some((id) => !options.some((option) => option.id === id)) ||
    (data.mode === "single" && selected.length > 1)
  )
    throw new UserError("Seleção de cargos inválida.");
  const target = new Set(
    selected.map((id) => options.find((option) => option.id === id).roleId),
  );
  if (toggle === true)
    for (const id of target) if (current.has(id)) target.delete(id);
  const controlled = new Set(options.map((option) => option.roleId));
  if (data.mode === "single" && data.group && target.size) {
    for (const other of resources) {
      const value = panelData(other);
      if (other.status === "published" && value.group === data.group)
        for (const option of value.options || []) controlled.add(option.roleId);
    }
  }
  if (toggle && data.mode !== "single")
    return {
      add: [...target].filter((id) => !current.has(id)),
      remove:
        toggle === true
          ? selected
              .map((id) => options.find((option) => option.id === id).roleId)
              .filter((id) => current.has(id))
          : [],
    };
  return {
    add: [...target].filter((id) => !current.has(id)),
    remove: [...controlled].filter((id) => current.has(id) && !target.has(id)),
  };
}
function rolePayload(resource) {
  const data = resource.data,
    options = (data.options || []).map((option) => ({
      ...option,
      emoji: normalizeEmoji(option.emoji),
    }));
  if (options.some((option) => !isDiscordEmoji(option.emoji)))
    throw new UserError(
      "Emoji inválido em uma opção do painel. Use um único emoji ou o formato <:nome:id>.",
    );
  if (
    !options.length ||
    options.length > 25 ||
    new Set(options.map((o) => o.id)).size !== options.length ||
    new Set(options.map((o) => o.roleId)).size !== options.length
  )
    throw new UserError("O painel precisa de 1 a 25 opções únicas.");
  const components = [];
  if (data.type === "select") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`kg:role:${resource.id}:select`)
      .setPlaceholder(
        data.mode === "single" ? "Escolha um cargo" : "Escolha seus cargos",
      )
      .setMinValues(0)
      .setMaxValues(data.mode === "single" ? 1 : options.length)
      .addOptions(
        options.map((option) => ({
          label: option.label.slice(0, 100),
          value: option.id,
          ...(option.emoji ? { emoji: option.emoji } : {}),
        })),
      );
    components.push(new ActionRowBuilder().addComponents(select));
  } else if (data.type === "buttons") {
    for (let index = 0; index < options.length; index += 5)
      components.push(
        new ActionRowBuilder().addComponents(
          options.slice(index, index + 5).map((option) => {
            const button = new ButtonBuilder()
              .setCustomId(`kg:role:${resource.id}:${option.id}`)
              .setLabel(option.label.slice(0, 80))
              .setStyle(ButtonStyle.Secondary);
            if (option.emoji) button.setEmoji(option.emoji);
            return button;
          }),
        ),
      );
  } else if (data.type !== "reactions")
    throw new UserError("Tipo de painel inválido.");
  const card = embed(data);
  if (data.type === "reactions") {
    if (options.some((option) => !option.emoji))
      throw new UserError("Configure um emoji em cada opção de reação.");
    card.setDescription(
      `${data.description || ""}\n\n${options.map((option) => `${option.emoji} — ${option.label}`).join("\n")}`.slice(
        0,
        4096,
      ),
    );
  }
  return mentionless({ embeds: [card], components });
}
function createRoles(ctx) {
  async function validate(guild, resource) {
    const payload = rolePayload(resource);
    for (const option of resource.data.options || [])
      await validateRole(guild, option.roleId);
    return payload;
  }
  async function apply(guild, resource, userId, chosen, toggle) {
    const resources = await ctx.resources.list(guild.id, "role_panel");
    const delta = await locked(
      ctx.pool,
      `roles:${guild.id}:${userId}`,
      async () => {
        const member = await guild.members.fetch({ user: userId, force: true });
        const delta = roleDelta(
          resources,
          resource,
          new Set(member.roles.cache.keys()),
          chosen,
          toggle,
        );
        for (const id of [...delta.add, ...delta.remove])
          await validateRole(guild, id);
        // Individual role endpoints preserve unrelated roles updated by Discord or another application.
        for (const id of delta.remove)
          await member.roles.remove(id, "Kagetsu: escolha de cargos");
        for (const id of delta.add)
          await member.roles.add(id, "Kagetsu: escolha de cargos");
        return delta;
      },
    );
    await ctx.store.audit(
      guild.id,
      userId,
      "role_panel.select",
      resource.id,
      null,
      delta,
    );
    await ctx.log(guild, "rolePanel", `<@${userId}> atualizou seus cargos.`);
    return delta;
  }
  async function interaction(interaction, resource, optionId) {
    const selection = optionId === "select" ? interaction.values : [optionId];
    await apply(
      interaction.guild,
      resource,
      interaction.user.id,
      selection,
      optionId !== "select",
    );
    // Shared public components cannot display a different state for each member. The
    // private response is the member-specific confirmation; public options stay neutral.
    await interaction.editReply({
      content: t(await ctx.configs.get(interaction.guildId), "role"),
    });
  }
  async function reaction(reaction, user, add) {
    if (user.bot) return;
    if (reaction.partial) reaction = await reaction.fetch();
    const message = reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message;
    if (!message.guild) return;
    const config = await ctx.configs.get(message.guild.id);
    if (!config.modules.roles) return;
    const panels = await ctx.resources.list(message.guild.id, "role_panel");
    const resource = panels.find(
      (row) =>
        row.status === "published" &&
        row.message_id === message.id &&
        panelData(row).type === "reactions",
    );
    if (!resource) return;
    const data = panelData(resource),
      key = reaction.emoji.id || reaction.emoji.name;
    const option = data.options.find(
      (item) =>
        (/<a?:[^:]+:(\d+)>/.exec(item.emoji || "")?.[1] || item.emoji) === key,
    );
    if (!option) return;
    if (add) {
      await apply(message.guild, resource, user.id, [option.id], "add");
      if (data.mode === "single")
        for (const other of message.reactions.cache.values())
          if ((other.emoji.id || other.emoji.name) !== key)
            await other.users.remove(user.id).catch(() => {});
    } else {
      await locked(
        ctx.pool,
        `roles:${message.guild.id}:${user.id}`,
        async () => {
          const member = await message.guild.members.fetch({
            user: user.id,
            force: true,
          });
          await validateRole(message.guild, option.roleId);
          if (member.roles.cache.has(option.roleId))
            await member.roles.remove(
              option.roleId,
              "Kagetsu: reação removida",
            );
        },
      );
    }
  }
  return { validate, interaction, reaction, apply, validateRole };
}
module.exports = {
  createRoles,
  roleDelta,
  rolePayload,
  validateRole,
  panelData,
  dangerous,
};
