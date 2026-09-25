const { ApiError } = require("./errors");
function referenceValidator(metadata) {
  const roles = new Map(metadata.roles.map((r) => [r.id, r])),
    channels = new Map(metadata.channels.map((c) => [c.id, c]));
  function role(id, assign = false) {
    if (!id) return;
    const found = roles.get(id);
    if (!found)
      throw new ApiError(
        422,
        "ROLE_MISSING",
        "Um cargo selecionado foi removido ou pertence a outro servidor.",
      );
    if (assign && (!found.manageable || found.dangerous))
      throw new ApiError(
        422,
        "ROLE_UNSAFE",
        `O cargo ${found.name} não pode ser atribuído com segurança pelo Kagetsu.`,
      );
  }
  function channel(id, kind = "text") {
    if (!id) return;
    const found = channels.get(id);
    if (!found)
      throw new ApiError(
        422,
        "CHANNEL_MISSING",
        "Um canal selecionado foi removido ou pertence a outro servidor.",
      );
    if (kind === "text" && (![0, 5].includes(found.type) || !found.sendable))
      throw new ApiError(
        422,
        "CHANNEL_PERMISSIONS",
        `O Kagetsu precisa ver, enviar mensagens e incorporar links no canal ${found.name}.`,
      );
    if (kind === "category" && found.type !== 4)
      throw new ApiError(
        422,
        "CHANNEL_TYPE",
        "Selecione uma categoria de canais.",
      );
    if (kind === "voice" && ![2, 13].includes(found.type))
      throw new ApiError(422, "CHANNEL_TYPE", "Selecione um canal de voz.");
  }
  return { role, channel };
}
function validateConfigReferences(config, metadata) {
  const { role, channel } = referenceValidator(metadata);
  for (const id of [
    config.levels.levelUpChannelId,
    config.welcome.channelId,
    config.welcome.leaveChannelId,
    config.tickets.logChannelId,
    config.suggestions.channelId,
    ...Object.values(config.logs.channels),
  ])
    channel(id);
  config.levels.blockedChannelIds.forEach((id) => channel(id, "any"));
  Object.keys(config.levels.channelMultipliers).forEach((id) =>
    channel(id, "any"),
  );
  config.automod.whitelistChannelIds.forEach((id) => channel(id, "any"));
  channel(config.tempVoice.triggerChannelId, "voice");
  channel(config.tempVoice.categoryId, "category");
  [
    ...config.levels.blockedRoleIds,
    ...Object.keys(config.levels.roleMultipliers),
    ...config.profile.roleIds,
    ...config.automod.whitelistRoleIds,
  ].forEach((id) => role(id));
  config.profile.labels.forEach((value) => role(value.roleId));
  config.profile.badges.forEach((value) => role(value.roleId));
  config.welcome.autoroleIds.forEach((id) => role(id, true));
  for (const reward of config.rewards) {
    role(reward.roleId, true);
    role(reward.requiredRoleId);
  }
  for (const progression of config.progressions) {
    role(progression.baseRoleId);
    for (const reward of progression.ranks) {
      role(reward.roleId, true);
      role(reward.requiredRoleId);
    }
  }
}
function validateResourceReferences(
  kind,
  data,
  metadata,
  { publishing = false } = {},
) {
  const { role, channel } = referenceValidator(metadata);
  if (
    publishing &&
    [
      "role_panel",
      "embed",
      "ticket_panel",
      "suggestion",
      "event",
      "giveaway",
    ].includes(kind) &&
    !data.channelId
  )
    throw new ApiError(
      422,
      "CHANNEL_REQUIRED",
      "Escolha um canal antes de publicar.",
    );
  if (data.channelId) channel(data.channelId);
  if (kind === "role_panel")
    data.options.forEach((option) => role(option.roleId, true));
  if (kind === "ticket_panel") {
    channel(data.categoryId, "category");
    data.supportRoleIds.forEach((id) => role(id));
  }
  if (kind === "giveaway") role(data.requiredRoleId);
}
module.exports = {
  referenceValidator,
  validateConfigReferences,
  validateResourceReferences,
};
