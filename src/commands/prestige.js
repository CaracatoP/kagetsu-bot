async function execute({ guild, user, services }) {
  try {
    const result = await services.xp.prestige(guild.id, user.id);
    return {
      content: `✨ Prestige ${result.prestige}. XP sazonal reiniciado; XP global preservado.`,
    };
  } catch (error) {
    return { content: error.message };
  }
}
module.exports = { execute };
