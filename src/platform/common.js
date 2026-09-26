const { PermissionFlagsBits: P, EmbedBuilder } = require("discord.js");
const { createHash } = require("node:crypto");

class UserError extends Error {}
const strings = {
  "pt-BR": {
    disabled: "Este módulo está desativado.",
    denied: "Você não tem permissão para esta ação.",
    missing: "O recurso foi removido ou não está publicado.",
    success: "Pronto! A alteração foi aplicada.",
    role: "Seus cargos foram atualizados.",
    failure:
      "Não foi possível concluir. Confira as permissões e tente novamente.",
    unavailable: "Canal indisponível ou sem permissão para enviar mensagens.",
  },
  "en-US": {
    disabled: "This module is disabled.",
    denied: "You do not have permission for this action.",
    missing: "This resource was removed or is not published.",
    success: "Done! Your change was applied.",
    role: "Your roles have been updated.",
    failure: "Could not complete this action. Check permissions and try again.",
    unavailable: "Channel unavailable or missing permission to send messages.",
  },
};
function t(config, key) {
  return (strings[config?.general?.locale] || strings["pt-BR"])[key] || key;
}
const { enabled } = require("../../packages/shared/modules");
function substitute(text, { user, guild, channel }) {
  return String(text || "").replace(
    /\{(user|username|server|channel|memberCount)\}/g,
    (_, key) =>
      ({
        user: user ? `<@${user.id}>` : "",
        username: user?.username || "",
        server: guild?.name || "",
        channel: channel ? `<#${channel.id}>` : "",
        memberCount: String(guild?.memberCount || 0),
      })[key],
  );
}
function safeUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost" ||
      !url.hostname.includes(".") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(
        url.hostname,
      )
    )
      throw new Error();
    return url.href;
  } catch {
    throw new UserError("Use uma URL HTTPS pública válida.");
  }
}
function embed(data = {}) {
  const result = new EmbedBuilder().setColor(
    /^#[\da-f]{6}$/i.test(data.color || "") ? data.color : "#b49aff",
  );
  if (data.title || data.name)
    result.setTitle(String(data.title || data.name).slice(0, 256));
  if (data.description)
    result.setDescription(String(data.description).slice(0, 4096));
  if (data.footer)
    result.setFooter({ text: String(data.footer).slice(0, 2048) });
  if (data.imageUrl) result.setImage(safeUrl(data.imageUrl));
  if (data.thumbnailUrl) result.setThumbnail(safeUrl(data.thumbnailUrl));
  if (!result.data.title && !result.data.description)
    result.setDescription("Kagetsu");
  // Discord limits the combined textual embed payload to 6,000 characters.
  const overhead =
    (result.data.title || "").length + (result.data.footer?.text || "").length;
  if (result.data.description)
    result.setDescription(result.data.description.slice(0, 6000 - overhead));
  return result;
}
async function transaction(pool, fn) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
async function locked(pool, key, fn) {
  return transaction(pool, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      key,
    ]);
    return fn(db);
  });
}
async function actor(guild, userId, permission = P.ManageGuild) {
  const member = await guild.members.fetch({ user: userId, force: true });
  if (!member.permissions.has(permission))
    throw new UserError("Permissão insuficiente no servidor.");
  return member;
}
async function channel(guild, id, permission = P.SendMessages) {
  const result = id
    ? await guild.channels.fetch(id).catch((error) => {
        if (error.code === 10003) return null;
        throw error;
      })
    : null;
  const me = guild.members.me || (await guild.members.fetchMe());
  if (
    !result ||
    result.guildId !== guild.id ||
    !result.isTextBased() ||
    !result.send ||
    !result.permissionsFor(me)?.has([P.ViewChannel, permission])
  )
    throw new UserError(
      "Canal indisponível ou sem permissão para enviar mensagens.",
    );
  return result;
}
function nonce(key) {
  return createHash("sha256").update(String(key)).digest("hex").slice(0, 24);
}
function mentionless(payload) {
  return { ...payload, allowedMentions: { parse: [], repliedUser: false } };
}
function createResourceCache(store) {
  const cache = new Map(),
    pending = new Map();
  function invalidate(guildId) {
    for (const key of new Set([...cache.keys(), ...pending.keys()])) {
      if (key.startsWith(`${guildId}:`)) {
        cache.delete(key);
        pending.delete(key);
      }
    }
  }
  async function list(guildId, kind) {
    const key = `${guildId}:${kind}`,
      entry = cache.get(key);
    if (entry && entry.until > Date.now()) return entry.rows;
    if (pending.has(key)) return pending.get(key);
    const task = store
      .listResources(guildId, kind)
      .then((rows) => {
        if (pending.get(key) !== task) return list(guildId, kind);
        cache.set(key, { rows, until: Date.now() + 30_000 });
        if (cache.size > 5000) cache.delete(cache.keys().next().value);
        return rows;
      })
      .finally(() => {
        if (pending.get(key) === task) pending.delete(key);
      });
    pending.set(key, task);
    return task;
  }
  return {
    list,
    invalidate,
  };
}
module.exports = {
  P,
  UserError,
  t,
  enabled,
  substitute,
  safeUrl,
  embed,
  transaction,
  locked,
  actor,
  channel,
  nonce,
  mentionless,
  createResourceCache,
};
