const { PermissionFlagsBits } = require("discord.js");
const { transaction } = require("../database/db");
const { calculateLevel } = require("./levelMath");
const { rewardsFor } = require("../../packages/shared/progressions");
const logger = require("../../packages/shared/logger");
function getTargetRank(ranks, level) {
  return (
    ranks
      .filter((rank) => level >= rank.level)
      .sort((a, b) => b.level - a.level)[0] || null
  );
}
function createRankService(pool, configs) {
  function expected(member, config, level, xp) {
    return rewardsFor(member, config, level, xp);
  }
  function needsSync(member, config, level, xp) {
    if (!config.modules.roles) return false;
    const desired = new Set(
      expected(member, config, level, xp).selected.map((r) => r.roleId),
    );
    const all = [
      ...config.rewards,
      ...config.progressions.flatMap((p) => p.ranks),
    ].map((r) => r.roleId);
    return all.some((id) => member.roles.cache.has(id) !== desired.has(id));
  }
  async function sync(member) {
    try {
      return await transaction(pool, async (db) => {
        const config =
          (
            await db.query(
              "SELECT config FROM guild_settings WHERE guild_id=$1 FOR SHARE",
              [member.guild.id],
            )
          ).rows[0]?.config || (await configs.get(member.guild.id));
        if (!config.modules.roles) return { ok: true, changed: false };
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `roles:${member.guild.id}:${member.id}`,
        ]);
        const { rows } = await db.query(
          "SELECT xp FROM user_levels WHERE guild_id=$1 AND user_id=$2 FOR UPDATE",
          [member.guild.id, member.id],
        );
        const xp = BigInt(rows[0]?.xp || 0),
          level = calculateLevel(xp, config.levels.curve);
        member = await member.guild.members.fetch({
          user: member.id,
          force: true,
        });
        const info = expected(member, config, level, xp),
          desired = new Set(info.selected.map((r) => r.roleId));
        const all = [
          ...new Set(
            [
              ...config.rewards,
              ...config.progressions.flatMap((p) => p.ranks),
            ].map((r) => r.roleId),
          ),
        ];
        const remove = all.filter(
          (id) => member.roles.cache.has(id) && !desired.has(id),
        );
        const add = [...desired].filter((id) => !member.roles.cache.has(id));
        const me =
          member.guild.members.me || (await member.guild.members.fetchMe());
        if (
          (add.length || remove.length) &&
          !me.permissions.has(PermissionFlagsBits.ManageRoles)
        )
          throw new Error("Bot sem permissão Gerenciar Cargos.");
        for (const id of [...remove, ...add]) {
          const role =
            member.guild.roles.cache.get(id) ||
            (await member.guild.roles.fetch(id));
          const {
            dangerousMask: dangerous,
          } = require("../../packages/shared/permissions");
          if (
            !role ||
            role.managed ||
            role.id === member.guild.id ||
            me.roles.highest.comparePositionTo(role) <= 0 ||
            (add.includes(id) && role.permissions.any(dangerous))
          )
            throw new Error("Cargo ausente, perigoso ou acima do bot.");
        }
        for (const id of remove)
          await member.roles.remove(id, "Kagetsu: sincronização de progressão");
        for (const id of add)
          await member.roles.add(id, "Kagetsu: sincronização de progressão");
        return {
          ok: true,
          changed: add.length > 0,
          rankName: info.rank?.name,
          level,
        };
      });
    } catch (err) {
      logger.error(
        { err, guildId: member.guild.id, userId: member.id },
        "Falha ao sincronizar cargos",
      );
      return { ok: false, changed: false };
    }
  }
  return { sync, needsSync, expected };
}
module.exports = { createRankService, getTargetRank };
