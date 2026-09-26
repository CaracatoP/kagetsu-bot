const { isDiscordEmoji } = require("./emoji");
const { z } = require("zod");

const snowflake = z.string().regex(/^\d{16,22}$/, "ID do Discord inválido.");
const optionalId = z.union([snowflake, z.literal("")]).default("");
const short = z.string().trim().max(100);
const stableId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const xp = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n, "XP acima do limite.");
const ids = z.array(snowflake).max(250);
const safeImageHosts = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "images.unsplash.com",
]);
function isSafeImageUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      safeImageHosts.has(u.hostname)
    );
  } catch {
    return false;
  }
}
const imageUrl = z
  .string()
  .max(2048)
  .refine(
    isSafeImageUrl,
    "Use uma imagem HTTPS do CDN do Discord ou images.unsplash.com.",
  )
  .default("");
const publicLink = z
  .string()
  .max(2048)
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  }, "O link deve usar HTTPS.");
const timestamp = z.string().datetime({ offset: true });
const integer = (min, max) => z.number().int().min(min).max(max);
const reward = z
  .object({
    id: stableId,
    name: short.min(1),
    level: integer(0, 1_000_000),
    roleId: snowflake,
    xp: xp.default("0"),
    requiredRoleId: optionalId,
  })
  .strict();
const action = z.enum([
  "delete",
  "warn",
  "timeout",
  "kick",
  "ban",
  "alert",
  "log",
]);
const { MODULES: moduleNames } = require("./modules");
const xpRange = {
  enabled: z.boolean(),
  min: integer(0, 100000),
  max: integer(0, 100000),
};
const welcomeDesign = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(2000).optional(),
    color: color.optional(),
    imageUrl,
    thumbnailUrl: imageUrl,
    backgroundUrl: imageUrl,
    footer: z.string().max(500).optional(),
    showAvatar: z.boolean().optional(),
    showName: z.boolean().optional(),
    overlay: z.number().min(0).max(1).optional(),
  })
  .strict();
const configSchema = z
  .object({
    general: z
      .object({
        prefix: z
          .string()
          .trim()
          .min(1)
          .max(10)
          .refine((v) => !/\s/.test(v), "O prefixo não pode conter espaços."),
        locale: z.enum(["pt-BR", "en-US"]),
        timezone: z
          .string()
          .max(80)
          .refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }, "Timezone inválido."),
      })
      .strict(),
    modules: z
      .object(
        Object.fromEntries(moduleNames.map((name) => [name, z.boolean()])),
      )
      .strict(),
    levels: z
      .object({
        chat: z
          .object({ ...xpRange, cooldownSeconds: integer(5, 86400) })
          .strict()
          .refine(
            (v) => v.max >= v.min,
            "XP máximo deve ser maior ou igual ao mínimo.",
          ),
        voice: z
          .object({ ...xpRange, intervalMinutes: z.number().min(1).max(1440) })
          .strict()
          .refine(
            (v) => v.max >= v.min,
            "XP máximo deve ser maior ou igual ao mínimo.",
          ),
        blockedChannelIds: ids,
        blockedRoleIds: ids,
        channelMultipliers: z.record(snowflake, z.number().min(0).max(10)),
        roleMultipliers: z.record(snowflake, z.number().min(0).max(10)),
        levelUpChannelId: optionalId,
        curve: z
          .object({
            type: z.enum(["linear", "progressive", "custom"]),
            base: integer(1, 1000000),
            coefficient: integer(1, 1000000),
            thresholds: z
              .array(z.union([xp, integer(1, Number.MAX_SAFE_INTEGER)]))
              .max(10000),
          })
          .strict()
          .superRefine((v, ctx) => {
            if (
              v.type === "custom" &&
              (v.thresholds.length < 1 ||
                BigInt(v.thresholds[0]) <= 0n ||
                v.thresholds.some(
                  (x, i) => i > 0 && BigInt(x) <= BigInt(v.thresholds[i - 1]),
                ))
            )
              ctx.addIssue({
                code: "custom",
                message:
                  "Informe os totais de XP positivos e crescentes dos níveis 1 em diante.",
              });
          }),
        requireProgression: z.boolean(),
        rewardMode: z.enum(["highest", "stack"]),
      })
      .strict(),
    rewards: z.array(reward).max(250),
    progressions: z
      .array(
        z
          .object({
            id: stableId,
            name: short.min(1),
            emoji: z
              .string()
              .trim()
              .max(100)
              .refine(isDiscordEmoji, "Use um único emoji ou <:nome:id>."),
            baseRoleId: snowflake,
            exclusiveGroup: short,
            mode: z.enum(["highest", "stack"]),
            ranks: z.array(reward).max(250),
          })
          .strict(),
      )
      .max(100),
    appearance: z
      .object({
        name: short.min(1),
        primary: color,
        secondary: color,
        background: color,
        backgroundUrl: imageUrl,
        logoUrl: imageUrl,
        barStyle: z.enum(["rounded", "square", "segments"]),
      })
      .strict(),
    profile: z
      .object({
        roleIds: ids,
        labels: z
          .array(z.object({ name: short.min(1), roleId: snowflake }).strict())
          .max(50),
        badges: z
          .array(
            z
              .object({
                id: stableId,
                name: short.min(1),
                emoji: z
                  .string()
                  .trim()
                  .max(100)
                  .refine(isDiscordEmoji, "Use um único emoji ou <:nome:id>.")
                  .optional(),
                roleId: optionalId,
              })
              .strict(),
          )
          .max(50),
      })
      .strict(),
    welcome: z
      .object({
        channelId: optionalId,
        message: z.string().max(2000),
        type: z.enum(["text", "embed", "card", "mixed"]),
        leaveType: z.enum(["text", "embed", "card", "mixed"]).optional(),
        design: welcomeDesign.optional(),
        leaveDesign: welcomeDesign.optional(),
        dmMessage: z.string().max(2000).optional(),
        leaveChannelId: optionalId,
        leaveMessage: z.string().max(2000),
        autoroleIds: ids,
        delayMinutes: integer(0, 10080),
      })
      .strict(),
    logs: z
      .object({
        channels: z.record(
          z.enum([
            "join",
            "leave",
            "messageDelete",
            "messageUpdate",
            "roles",
            "moderation",
            "tickets",
            "xp",
            "rolePanel",
            "configuration",
          ]),
          optionalId,
        ),
      })
      .strict(),
    moderation: z
      .object({
        warnRules: z
          .array(
            z
              .object({
                count: integer(1, 100),
                action: z.enum(["timeout", "ban"]),
                durationMinutes: integer(1, 40320).optional(),
              })
              .strict(),
          )
          .max(20),
      })
      .strict(),
    automod: z
      .object({
        whitelistRoleIds: ids,
        whitelistChannelIds: ids,
        rules: z
          .array(
            z
              .object({
                id: stableId,
                type: z.enum([
                  "spam",
                  "flood",
                  "invite",
                  "mentions",
                  "words",
                  "links",
                  "caps",
                  "emojis",
                  "newAccount",
                  "joinBurst",
                ]),
                enabled: z.boolean(),
                action,
                threshold: integer(1, 100).optional(),
                windowSeconds: integer(1, 300).optional(),
                durationMinutes: integer(1, 40320).optional(),
                words: z.array(z.string().min(1).max(80)).max(200).optional(),
                escalation: z
                  .array(
                    z
                      .object({
                        count: integer(1, 100),
                        action,
                        durationMinutes: integer(1, 40320).optional(),
                      })
                      .strict(),
                  )
                  .max(10)
                  .optional(),
              })
              .strict(),
          )
          .max(30),
      })
      .strict(),
    tickets: z.object({ logChannelId: optionalId }).strict(),
    suggestions: z.object({ channelId: optionalId }).strict(),
    tempVoice: z
      .object({ triggerChannelId: optionalId, categoryId: optionalId })
      .strict(),
    prestige: z.object({ maxLevel: integer(1, 1000000) }).strict(),
  })
  .strict();

const common = {
  name: short.optional(),
  title: z.string().max(256).optional(),
  description: z.string().max(4000).optional(),
  channelId: optionalId,
  color: color.optional(),
  imageUrl,
  thumbnailUrl: imageUrl,
  footer: z.string().max(2048).optional(),
};
const resourceSchemas = {
  role_panel: z
    .object({
      ...common,
      title: z.string().min(1).max(256),
      type: z.enum(["buttons", "select", "reactions"]),
      mode: z.enum(["single", "multiple", "fair"]),
      group: short.optional(),
      options: z
        .array(
          z
            .object({
              id: stableId,
              label: z.string().min(1).max(80),
              emoji: z
                .string()
                .trim()
                .max(100)
                .refine(isDiscordEmoji, "Use um único emoji ou <:nome:id>.")
                .optional(),
              roleId: snowflake,
            })
            .strict(),
        )
        .min(1)
        .max(25),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (
        new Set(v.options.map((o) => o.id)).size !== v.options.length ||
        new Set(v.options.map((o) => o.roleId)).size !== v.options.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Opções e cargos devem ser únicos.",
        });
      if (
        v.type === "reactions" &&
        (v.options.some((o) => !o.emoji) ||
          new Set(v.options.map((o) => o.emoji)).size !== v.options.length)
      )
        ctx.addIssue({
          code: "custom",
          message: "Reações exigem emojis únicos.",
        });
      if (v.mode === "fair" && v.type === "reactions")
        ctx.addIssue({
          code: "custom",
          message:
            "Escolha justa está disponível apenas em botões ou menu de seleção.",
        });
    }),
  embed: z
    .object({
      ...common,
      name: short.min(1),
      buttons: z
        .array(
          z
            .object({ label: z.string().min(1).max(80), url: publicLink })
            .strict(),
        )
        .max(5)
        .default([]),
    })
    .strict()
    .refine(
      (v) => v.title || v.description || v.imageUrl,
      "Preencha ao menos título, descrição ou imagem.",
    ),
  custom_command: z
    .object({
      name: z.string().regex(/^[\p{L}\p{N}_-]{1,32}$/u),
      response: z.string().min(1).max(2000),
    })
    .strict(),
  scheduled_message: z
    .object({
      name: short.optional(),
      content: z.string().min(1).max(2000),
      channelId: snowflake,
      runAt: timestamp,
      recurrence: z.enum(["none", "daily", "weekly"]),
      daysOfWeek: z.array(integer(0, 6)).max(7).default([]),
    })
    .strict(),
  ticket_panel: z
    .object({
      ...common,
      title: z.string().min(1).max(256),
      categoryId: snowflake,
      supportRoleIds: ids,
      categories: z
        .array(
          z.object({ id: stableId, label: z.string().min(1).max(80) }).strict(),
        )
        .min(1)
        .max(25),
    })
    .strict(),
  suggestion: z
    .object({
      ...common,
      title: z.string().max(256).optional(),
      description: z.string().min(1).max(4000),
      status: z
        .enum(["pending", "approved", "rejected", "implemented"])
        .optional(),
    })
    .strict(),
  event: z
    .object({
      ...common,
      name: short.min(1),
      startsAt: timestamp,
      maxParticipants: integer(0, 100000),
    })
    .strict(),
  giveaway: z
    .object({
      ...common,
      title: z.string().min(1).max(256),
      endsAt: timestamp,
      winners: integer(1, 100),
      requiredRoleId: optionalId,
    })
    .strict(),
  season: z
    .object({ name: short.min(1), startsAt: timestamp, endsAt: timestamp })
    .strict()
    .refine(
      (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
      "O fim deve ser posterior ao início.",
    ),
  achievement: z
    .object({
      name: short.min(1),
      description: z.string().max(1000),
      emoji: z
        .string()
        .trim()
        .max(100)
        .refine(isDiscordEmoji, "Use um único emoji ou <:nome:id>."),
      condition: z.enum(["level", "messages", "voiceMinutes"]),
      value: integer(1, 100000000),
    })
    .strict(),
  mission: z
    .object({
      name: short.min(1),
      period: z.enum(["daily", "weekly"]),
      condition: z.enum(["messages", "voiceMinutes"]),
      value: integer(1, 100000000),
      rewardXp: integer(1, 100000),
    })
    .strict(),
};
const resourceKind = z.enum(Object.keys(resourceSchemas));
function parseResource(kind, data) {
  return resourceSchemas[resourceKind.parse(kind)].parse(data);
}
module.exports = {
  configSchema,
  resourceSchemas,
  resourceKind,
  parseResource,
  snowflake,
  optionalId,
  isSafeImageUrl,
  moduleNames,
};
