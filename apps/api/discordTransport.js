const { createHash } = require("node:crypto");
const { ApiError } = require("./errors");
function rateError(seconds, endpoint) {
  const retryAfter = Math.max(1, Math.ceil(seconds));
  return Object.assign(
    new ApiError(
      429,
      "DISCORD_RATE_LIMIT",
      `O Discord está limitando temporariamente as solicitações. Seus dados continuam salvos. Tente novamente em ${retryAfter} segundos.`,
    ),
    { retryAfter, endpoint },
  );
}
function createTransport({ fetchImpl = fetch, logger, now = Date.now }) {
  const cache = new Map(),
    flights = new Map(),
    blocked = new Map();
  function prune(map) {
    if (map.size > 5000) map.delete(map.keys().next().value);
  }
  return async function request(
    path,
    {
      accessToken,
      botToken,
      method = "GET",
      body,
      ttl = 0,
      stale = 0,
      context = {},
    } = {},
  ) {
    const scope = createHash("sha256")
      .update(accessToken || botToken || "oauth")
      .digest("hex");
    const route = path.split("?")[0];
    const endpoint = route.replace(/\d{16,22}/g, ":id");
    const bodyKey =
      method === "GET"
        ? ""
        : createHash("sha256")
            .update(body?.toString() || "")
            .digest("hex");
    const key = `${scope}:${method}:${path}:${bodyKey}`,
      limitKey = `${scope}:${method}:${route}`;
    const info = {
      guild_id: context.guildId || path.match(/^\/guilds\/(\d+)/)?.[1],
      operation: context.operation || method,
      endpoint,
      attempt: 1,
    };
    const previous = cache.get(key);
    if (ttl && previous && now() - previous.time < ttl) {
      logger?.info({ ...info, cache: "hit" }, "Discord cache");
      return previous.value;
    }
    logger?.info({ ...info, cache: "miss" }, "Discord cache");
    try {
      const until = Math.max(
        blocked.get(limitKey) || 0,
        blocked.get(scope) || 0,
      );
      if (until > now()) throw rateError((until - now()) / 1000, endpoint);
      if (!flights.has(key)) {
        const task = (async () => {
          let response;
          try {
            response = await fetchImpl(`https://discord.com/api/v10${path}`, {
              method,
              signal: AbortSignal.timeout(12000),
              headers: {
                ...(accessToken
                  ? { Authorization: `Bearer ${accessToken}` }
                  : botToken
                    ? { Authorization: `Bot ${botToken}` }
                    : {}),
                ...(body
                  ? { "Content-Type": "application/x-www-form-urlencoded" }
                  : {}),
              },
              body: body?.toString(),
            });
          } catch {
            throw new ApiError(
              503,
              "DISCORD_UNAVAILABLE",
              "O Discord está indisponível. Seus dados continuam salvos.",
            );
          }
          const data =
            response.status === 204
              ? null
              : await response.json().catch(() => null);
          const header = response.headers?.get("Retry-After");
          const retry =
            Math.max(
              Number(data?.retry_after) || 0,
              Number(header) ||
                (header ? (Date.parse(header) - now()) / 1000 : 0) ||
                0,
              Number(response.headers?.get("X-RateLimit-Reset-After")) || 0,
              0,
            ) || 30;
          if (response.status === 429) {
            const global =
              data?.global ||
              response.headers?.get("X-RateLimit-Global") === "true";
            blocked.set(global ? scope : limitKey, now() + retry * 1000);
            prune(blocked);
            logger?.warn(
              {
                ...info,
                event: "discord_http_429",
                status: 429,
                retryAfter: retry,
                global: !!global,
                cache: previous ? "stale_available" : "miss",
              },
              "Discord rate limit",
            );
            throw rateError(retry, endpoint);
          }
          if (response.headers?.get("X-RateLimit-Remaining") === "0")
            blocked.set(limitKey, now() + retry * 1000);
          if (!response.ok) {
            if ([401, 403, 404].includes(response.status)) cache.delete(key);
            throw new ApiError(
              [401, 403, 404].includes(response.status) ? response.status : 502,
              "DISCORD_ERROR",
              "Não foi possível consultar o Discord.",
            );
          }
          if (method === "GET") {
            cache.set(key, { value: data, time: now() });
            prune(cache);
          }
          logger?.info(
            { ...info, status: response.status, cache: "refresh" },
            "Discord request",
          );
          return data;
        })();
        flights.set(key, task);
        task.finally(() => flights.delete(key)).catch(() => {});
      }
      return await flights.get(key);
    } catch (error) {
      if (
        previous &&
        stale &&
        now() - previous.time < stale &&
        [429, 502, 503].includes(error.status)
      ) {
        context.warn?.({
          code: error.code,
          message: error.message,
          retryAfter: error.retryAfter || 15,
          endpoint,
          stale: true,
        });
        logger?.warn(
          {
            ...info,
            status: error.status,
            retryAfter: error.retryAfter,
            cache: "stale",
            event: "discord_cache_fallback",
          },
          "Discord stale fallback",
        );
        return previous.value;
      }
      throw error;
    }
  };
}
module.exports = { createTransport, rateError };
