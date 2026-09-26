const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { rateLimit } = require("express-rate-limit");
const pino = require("pino");
const { z } = require("zod");
const { randomUUID } = require("node:crypto");
const { createSecurity, csrfGuard } = require("./security");
const { createAuth } = require("./auth");
const {
  createDiscord,
  canManageGuild,
  inviteUrl,
  has,
  P,
} = require("./discord");
const { ApiError } = require("./errors");
const {
  validateConfigReferences,
  validateResourceReferences,
} = require("./references");
const {
  configSchema,
  parseResource,
  resourceKind,
  snowflake,
} = require("../../packages/shared/validation");
const { createStore } = require("../../packages/database/store");
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const version = z.number().int().positive();
const uuid = z.string().uuid();
const MODULE_FOR_KIND = {
  role_panel: "roles",
  custom_command: "customCommands",
  scheduled_message: "scheduler",
  ticket_panel: "tickets",
  suggestion: "suggestions",
  event: "events",
  giveaway: "giveaways",
  season: "seasons",
  achievement: "achievements",
  mission: "missions",
};

function createApp({
  pool,
  store = createStore(pool),
  env = process.env,
  discord: providedDiscord,
  logger: providedLogger,
} = {}) {
  if (!pool) throw new Error("PostgreSQL pool obrigatório.");
  const webUrl = env.WEB_URL || "http://localhost:3000";
  const origin = new URL(webUrl).origin;
  if (env.NODE_ENV === "production" && !origin.startsWith("https:"))
    throw new Error("WEB_URL deve usar HTTPS em produção.");
  const logger =
    providedLogger ||
    pino({
      level: env.LOG_LEVEL || "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "token",
        "access_token",
        "refresh_token",
        "client_secret",
        "encrypted_tokens",
      ],
    });
  const security = createSecurity(env.SESSION_SECRET);
  const clientId = env.DISCORD_CLIENT_ID || env.CLIENT_ID;
  const discord =
    providedDiscord ||
    createDiscord({
      clientId,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      redirectUri: `${origin}/api/auth/callback`,
      botToken: env.DISCORD_TOKEN || env.TOKEN,
      logger,
    });
  const auth = createAuth({
    pool,
    security,
    discord,
    clientId,
    webUrl,
    logger,
  });
  const app = express();
  const localLimit = (operation) => (req, res) => {
    const retryAfter = Math.max(
      1,
      Math.ceil(
        ((req.rateLimit?.resetTime?.getTime() || Date.now() + 60000) -
          Date.now()) /
          1000,
      ),
    );
    logger.warn(
      {
        event: "api_rate_limit",
        source: "kagetsu",
        guild_id: req.originalUrl.match(/\/guilds\/(\d+)/)?.[1],
        operation,
        endpoint: req.originalUrl.split("?")[0].replace(/\d{16,22}/g, ":id"),
        status: 429,
        retryAfter,
        requestId: req.requestId,
      },
      "Limite local da API",
    );
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      error: {
        code: "RATE_LIMIT",
        message: `Muitas solicitações ao Kagetsu. Seus dados continuam salvos. Tente novamente em ${retryAfter} segundos.`,
        retryAfter,
        requestId: req.requestId,
      },
    });
  };
  app.disable("x-powered-by");
  if (env.TRUST_PROXY_HOPS) {
    const hops = Number(env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 0 || hops > 5)
      throw new Error("TRUST_PROXY_HOPS deve estar entre 0 e 5.");
    app.set("trust proxy", hops);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 180,
      handler: localLimit("ip"),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Muitas solicitações. Tente novamente em um minuto.",
        },
      },
    }),
  );
  app.use(express.json({ limit: "128kb", strict: true }));
  app.use(cookieParser());
  app.get(
    "/health",
    asyncRoute(async (req, res) => {
      try {
        const { rows } = await pool.query(
          "SELECT EXISTS(SELECT 1 FROM bot_status WHERE last_seen>NOW()-INTERVAL '90 seconds') AS online",
        );
        res.json({
          status: "ok",
          database: "connected",
          bot: rows[0]?.online ? "online" : "offline",
        });
      } catch {
        res.status(503).json({
          status: "degraded",
          database: "disconnected",
          bot: "unknown",
        });
      }
    }),
  );
  const authLimit = rateLimit({
    windowMs: 60000,
    limit: 15,
    handler: localLimit("login"),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT",
        message: "Aguarde antes de tentar entrar novamente.",
      },
    },
  });
  app.get("/auth/login", authLimit, asyncRoute(auth.login));
  app.get("/auth/callback", authLimit, asyncRoute(auth.callback));
  app.use(auth.load);
  app.get("/auth/me", auth.required, (req, res) =>
    res.json({
      user: req.auth.user_data,
      csrfToken: security.csrf(req.auth.sessionId),
    }),
  );
  app.use(auth.required);
  app.use(csrfGuard({ security, origin }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      handler: localLimit("account"),
      keyGenerator: (req) => req.auth.user_id,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Muitas solicitações para esta conta.",
        },
      },
    }),
  );
  app.use((req, res, next) => {
    req.warnings = [];
    const json = res.json.bind(res);
    res.json = (body) =>
      json(
        body && typeof body === "object"
          ? {
              ...body,
              ...(req.warnings.length ? { warnings: req.warnings } : {}),
            }
          : body,
      );
    next();
  });
  const context = (req) => ({
    guildId: req.guildId,
    operation: `${req.method} ${req.route?.path || req.originalUrl.split("?")[0].replace(/\d{16,22}/g, ":id")}`,
    fresh: req.method !== "GET",
    warn: (warning) => req.warnings.push(warning),
  });
  app.post("/auth/logout", asyncRoute(auth.logout));
  app.get(
    "/guilds",
    asyncRoute(async (req, res) => {
      const guilds = (
        await discord.guilds(await auth.accessToken(req.auth), context(req))
      ).filter(canManageGuild);
      const { rows } = await pool.query(
        "SELECT id FROM guilds WHERE installed=true AND id=ANY($1::text[])",
        [guilds.map((g) => g.id)],
      );
      const installed = new Set(rows.map((row) => row.id));
      res.json({
        guilds: guilds.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          installed: installed.has(g.id),
          permissions: g.permissions,
          inviteUrl: inviteUrl(clientId, g.id),
        })),
      });
    }),
  );
  // Read authorization has a bounded cache; mutations always revalidate against Discord.
  app.use(
    "/guilds/:guildId",
    asyncRoute(async (req, res, next) => {
      const guildId = snowflake.parse(req.params.guildId);
      req.guildId = guildId;
      const guilds = await discord.guilds(
        await auth.accessToken(req.auth),
        context(req),
      );
      const guild = guilds.find((g) => g.id === guildId && canManageGuild(g));
      if (!guild)
        throw new ApiError(
          403,
          "GUILD_FORBIDDEN",
          "Você precisa de Administrador ou Gerenciar Servidor neste servidor.",
        );
      req.guildId = guildId;
      req.discordGuild = guild;
      next();
    }),
  );
  async function metadata(req, optional = false) {
    try {
      return (
        req.metadata ||
        (req.metadata = await discord.metadata(req.guildId, context(req)))
      );
    } catch (error) {
      if (!optional || ![429, 502, 503].includes(error.status)) throw error;
      req.warnings.push({
        code: error.code,
        message: error.message,
        retryAfter: error.retryAfter || 15,
        endpoint: error.endpoint,
        unavailable: true,
      });
      return null;
    }
  }
  async function resource(req) {
    uuid.parse(req.params.resourceId);
    const found = await store.getResource(req.guildId, req.params.resourceId);
    if (!found)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Recurso não encontrado neste servidor.",
      );
    return found;
  }
  async function enqueue(req, action, payload) {
    const job = await store.enqueue(
      req.guildId,
      req.auth.user_id,
      action,
      payload,
    );
    await store.audit(
      req.guildId,
      req.auth.user_id,
      `job.${action}`,
      payload.resourceId || payload.ticketId || job.id,
      null,
      { jobId: job.id, ...payload },
    );
    return job;
  }
  app.get(
    "/guilds/:guildId",
    asyncRoute(async (req, res) => {
      const info = await metadata(req, true);
      await store.ensureGuild(
        req.guildId,
        info?.guild.name || req.discordGuild.name,
      );
      const saved = await store.getConfig(req.guildId);
      if (
        info?.botPermissions &&
        (saved.config.modules.tickets || saved.config.modules.tempVoice) &&
        !has(info.botPermissions, P.MANAGE_CHANNELS)
      )
        info.permissions = {
          ...info.permissions,
          missing: [...info.permissions.missing, "ManageChannels"],
        };
      const { rows } = await pool.query(
        "SELECT EXISTS(SELECT 1 FROM bot_status WHERE $1=ANY(guild_ids) AND last_seen>NOW()-INTERVAL '90 seconds') AS online",
        [req.guildId],
      );
      res.json({
        guild: info?.guild || req.discordGuild,
        ...saved,
        channels: info?.channels || [],
        roles: info?.roles || [],
        permissions: info?.permissions || { missing: [], unavailable: true },
        metadataStatus: !info
          ? "unavailable"
          : req.warnings.length
            ? "stale"
            : "fresh",
        status: {
          bot: rows[0]?.online ? "online" : "offline",
          database: "connected",
        },
      });
    }),
  );
  app.get(
    "/guilds/:guildId/diagnostics",
    asyncRoute(async (req, res) => {
      const [heartbeat, sync, jobs, saved] = await Promise.all([
        pool.query(
          "SELECT last_seen,latency_ms,last_seen>NOW()-INTERVAL '90 seconds' AS online FROM bot_status WHERE $1=ANY(guild_ids) ORDER BY last_seen DESC LIMIT 1",
          [req.guildId],
        ),
        pool.query(
          "SELECT synced_at,command_count FROM guild_command_sync WHERE guild_id=$1",
          [req.guildId],
        ),
        pool.query(
          "SELECT id,action,status,error,updated_at FROM bot_jobs WHERE guild_id=$1 AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 10",
          [req.guildId],
        ),
        store.getConfig(req.guildId),
      ]);
      const info = await metadata(req, true),
        problems = [];
      if (!info)
        problems.push("Metadados Discord temporariamente indisponíveis.");
      else {
        if (
          info.botPermissions &&
          (saved.config.modules.tickets || saved.config.modules.tempVoice) &&
          !has(info.botPermissions, P.MANAGE_CHANNELS)
        )
          problems.push("Permissão ausente: ManageChannels");
        problems.push(
          ...info.permissions.missing.map((p) => `Permissão ausente: ${p}`),
        );
        problems.push(
          ...info.roles
            .filter((r) => !r.managed && !r.manageable && r.id !== req.guildId)
            .map((r) => `Cargo não gerenciável pelo bot: ${r.name}`),
        );
        try {
          validateConfigReferences(saved.config, info);
        } catch (error) {
          problems.push(error.message);
        }
        if (saved.config.modules.welcome && !saved.config.welcome.channelId)
          problems.push("Boas-vindas sem canal configurado.");
        if (
          saved.config.modules.tempVoice &&
          !saved.config.tempVoice.triggerChannelId
        )
          problems.push("Salas temporárias sem canal de entrada.");
      }
      res.json({
        bot: heartbeat.rows[0] || null,
        sync: sync.rows[0] || null,
        jobs: jobs.rows,
        problems,
      });
    }),
  );
  app.put(
    "/guilds/:guildId/config",
    asyncRoute(async (req, res) => {
      const body = z
        .object({ config: configSchema, version })
        .strict()
        .parse(req.body);
      const info = await metadata(req, true);
      if (info) validateConfigReferences(body.config, info);
      res.json(
        await store.saveConfig(
          req.guildId,
          body.config,
          req.auth.user_id,
          body.version,
        ),
      );
    }),
  );
  app.post(
    "/guilds/:guildId/onboarding",
    asyncRoute(async (req, res) => {
      z.object({ skipped: z.boolean() }).strict().parse(req.body);
      await pool.query(
        "UPDATE guild_settings SET onboarding_completed_at=COALESCE(onboarding_completed_at,NOW()) WHERE guild_id=$1",
        [req.guildId],
      );
      res.json({ completed: true });
    }),
  );
  app.get(
    "/guilds/:guildId/resources",
    asyncRoute(async (req, res) => {
      const kind =
        req.query.kind === undefined
          ? undefined
          : resourceKind.parse(req.query.kind);
      res.json({ resources: await store.listResources(req.guildId, kind) });
    }),
  );
  app.post(
    "/guilds/:guildId/resources",
    asyncRoute(async (req, res) => {
      const body = z
          .object({ kind: resourceKind, data: z.unknown() })
          .strict()
          .parse(req.body),
        data = parseResource(body.kind, body.data);
      const info = await metadata(req, true);
      if (info) validateResourceReferences(body.kind, data, info);
      await store.ensureGuild(req.guildId, req.discordGuild.name);
      res.status(201).json({
        resource: await store.saveResource(
          req.guildId,
          body.kind,
          data,
          req.auth.user_id,
        ),
      });
    }),
  );
  app.put(
    "/guilds/:guildId/resources/:resourceId",
    asyncRoute(async (req, res) => {
      const old = await resource(req),
        body = z
          .object({ data: z.unknown(), version })
          .strict()
          .parse(req.body),
        data = parseResource(old.kind, body.data);
      const info = await metadata(req, true);
      if (info) validateResourceReferences(old.kind, data, info);
      res.json({
        resource: await store.saveResource(
          req.guildId,
          old.kind,
          data,
          req.auth.user_id,
          old.id,
          body.version,
        ),
      });
    }),
  );
  app.delete(
    "/guilds/:guildId/resources/:resourceId",
    asyncRoute(async (req, res) => {
      const old = await resource(req);
      if (old.message_id || old.status === "published")
        throw new ApiError(
          409,
          "RESOURCE_PUBLISHED",
          "Despublique o recurso antes de excluir.",
        );
      await store.deleteResource(req.guildId, old.id, req.auth.user_id);
      res.status(204).end();
    }),
  );
  for (const [route, action] of [
    ["publish", "publish_resource"],
    ["unpublish", "unpublish_resource"],
    ["send", "send_embed"],
  ])
    app.post(
      `/guilds/:guildId/resources/:resourceId/${route}`,
      asyncRoute(async (req, res) => {
        const old = await resource(req);
        if (action === "send_embed" && old.kind !== "embed")
          throw new ApiError(
            422,
            "RESOURCE_KIND",
            "Este recurso não é um embed.",
          );
        if (action !== "unpublish_resource") {
          const data = parseResource(old.kind, old.data);
          validateResourceReferences(old.kind, data, await metadata(req), {
            publishing: true,
          });
          const { config } = await store.getConfig(req.guildId),
            module = MODULE_FOR_KIND[old.kind];
          if (module && !config.modules[module])
            throw new ApiError(
              409,
              "MODULE_DISABLED",
              "Ative o módulo antes de publicar.",
            );
        }
        res
          .status(202)
          .json({ job: await enqueue(req, action, { resourceId: old.id }) });
      }),
    );
  app.post(
    "/guilds/:guildId/resources/:resourceId/status",
    asyncRoute(async (req, res) => {
      const old = await resource(req);
      if (old.kind !== "suggestion")
        throw new ApiError(
          422,
          "RESOURCE_KIND",
          "Este recurso não é uma sugestão.",
        );
      const { status } = z
        .object({
          status: z.enum(["pending", "approved", "rejected", "implemented"]),
        })
        .strict()
        .parse(req.body);
      res.status(202).json({
        job: await enqueue(req, "suggestion_status", {
          resourceId: old.id,
          status,
        }),
      });
    }),
  );
  app.get(
    "/guilds/:guildId/jobs/:jobId",
    asyncRoute(async (req, res) => {
      uuid.parse(req.params.jobId);
      const { rows } = await pool.query(
        "SELECT id,action,status,result,error,created_at,updated_at FROM bot_jobs WHERE guild_id=$1 AND id=$2",
        [req.guildId, req.params.jobId],
      );
      if (!rows[0])
        throw new ApiError(
          404,
          "JOB_NOT_FOUND",
          "Operação não encontrada neste servidor.",
        );
      res.json({ job: rows[0] });
    }),
  );
  app.get(
    "/guilds/:guildId/audit",
    asyncRoute(async (req, res) => {
      const { rows } = await pool.query(
        "SELECT id,user_id,action,target,old_value,new_value,created_at FROM audit_logs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100",
        [req.guildId],
      );
      res.json({ entries: rows });
    }),
  );
  app.get(
    "/guilds/:guildId/analytics",
    asyncRoute(async (req, res) => {
      const days = z.enum(["1", "7", "30"]).default("7").parse(req.query.days);
      const [{ rows: series }, { rows: totals }, info] = await Promise.all([
        pool.query(
          'SELECT day::text,COALESCE(SUM(joins),0)::text AS joins,COALESCE(SUM(leaves),0)::text AS leaves,COALESCE(SUM(messages),0)::text AS messages,COALESCE(SUM(xp),0)::text AS xp,COALESCE(SUM(voice_seconds),0)::text AS "voiceSeconds",COUNT(DISTINCT user_id) FILTER(WHERE messages>0 OR voice_seconds>0)::text AS "activeMembers" FROM analytics_daily WHERE guild_id=$1 AND day>=CURRENT_DATE-($2::integer-1) GROUP BY day ORDER BY day',
          [req.guildId, Number(days)],
        ),
        pool.query(
          'SELECT COALESCE(SUM(joins),0)::text AS joins,COALESCE(SUM(leaves),0)::text AS leaves,COALESCE(SUM(messages),0)::text AS messages,COALESCE(SUM(xp),0)::text AS xp,COALESCE(SUM(voice_seconds),0)::text AS "voiceSeconds",COUNT(DISTINCT user_id) FILTER(WHERE messages>0 OR voice_seconds>0)::text AS "activeMembers" FROM analytics_daily WHERE guild_id=$1 AND day>=CURRENT_DATE-($2::integer-1)',
          [req.guildId, Number(days)],
        ),
        metadata(req, true),
      ]);
      res.json({
        days: Number(days),
        members: info?.guild.memberCount ?? null,
        totals: totals[0],
        series,
      });
    }),
  );
  app.get(
    "/guilds/:guildId/tickets",
    asyncRoute(async (req, res) => {
      const { rows } = await pool.query(
        "SELECT id,resource_id,channel_id,owner_id,claimed_by,status,transcript_count,created_at,closed_at,updated_at FROM tickets WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100",
        [req.guildId],
      );
      res.json({ tickets: rows });
    }),
  );
  app.get(
    "/guilds/:guildId/tickets/:ticketId/transcript",
    asyncRoute(async (req, res) => {
      uuid.parse(req.params.ticketId);
      const { rows } = await pool.query(
        "SELECT transcript FROM tickets WHERE guild_id=$1 AND id=$2",
        [req.guildId, req.params.ticketId],
      );
      if (!rows[0]?.transcript)
        throw new ApiError(
          404,
          "TRANSCRIPT_NOT_FOUND",
          "Transcript ainda não disponível.",
        );
      res.setHeader(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ticket-${req.params.ticketId}.html"`,
      );
      res.type("html").send(rows[0].transcript);
    }),
  );
  app.post(
    "/guilds/:guildId/tickets/:ticketId/action",
    asyncRoute(async (req, res) => {
      uuid.parse(req.params.ticketId);
      const { action } = z
        .object({ action: z.enum(["claim", "close", "reopen", "delete"]) })
        .strict()
        .parse(req.body);
      const { rows } = await pool.query(
        "SELECT id FROM tickets WHERE guild_id=$1 AND id=$2",
        [req.guildId, req.params.ticketId],
      );
      if (!rows[0])
        throw new ApiError(
          404,
          "TICKET_NOT_FOUND",
          "Ticket não encontrado neste servidor.",
        );
      res.status(202).json({
        job: await enqueue(req, "ticket_action", {
          ticketId: req.params.ticketId,
          action,
        }),
      });
    }),
  );
  app.get(
    "/guilds/:guildId/moderation",
    asyncRoute(async (req, res) => {
      const { rows } = await pool.query(
        "SELECT id,target_user,moderator,reason,action,metadata,created_at FROM moderation_cases WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100",
        [req.guildId],
      );
      res.json({ cases: rows });
    }),
  );
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return res.status(422).json({
        error: {
          code: "VALIDATION",
          message: "Verifique os campos informados.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    const status =
      error.type === "entity.too.large"
        ? 413
        : error instanceof SyntaxError && error.status === 400
          ? 400
          : Number.isInteger(error.status) &&
              error.status >= 400 &&
              error.status < 600
            ? error.status
            : 500;
    logger.error(
      {
        requestId: req.requestId,
        event: "api_request_failed",
        status,
        guild_id: req.guildId,
        operation: req.method,
        endpoint: error.endpoint || req.route?.path,
        retryAfter: error.retryAfter,
        code: error.code || "INTERNAL",
      },
      "Falha na requisição da API.",
    );
    if (error.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    const safe = error instanceof ApiError || [404, 409].includes(status);
    res.status(status).json({
      error: {
        code:
          error instanceof ApiError
            ? error.code
            : status === 413
              ? "PAYLOAD_TOO_LARGE"
              : status === 409
                ? "CONFLICT"
                : "REQUEST_FAILED",
        message: safe
          ? error.message
          : status === 413
            ? "Conteúdo maior que o limite permitido."
            : "Não foi possível concluir a solicitação.",
        retryAfter: error.retryAfter,
        endpoint: error.endpoint,
        requestId: req.requestId,
      },
    });
  });
  app.locals.auth = auth;
  app.locals.security = security;
  return app;
}
module.exports = { createApp };
