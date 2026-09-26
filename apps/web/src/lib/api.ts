import type { Job } from "./types";

let csrfToken = "";
let generation = 0;
const reads = new Map<string, { until: number; value: any }>();
const flights = new Map<string, Promise<any>>();
let retryDeadline = 0;
let warning = "";
const listeners = new Set<() => void>();
export const subscribeDiscord = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getRetryDeadline = () => retryDeadline;
export const getDiscordWarning = () => warning;
export function clearDiscordWarning() {
  warning = "";
  listeners.forEach((fn) => fn());
}
function notice(warnings: any[]) {
  if (!warnings?.length) return;
  for (const item of warnings) if (item.retryAfter) retryDeadline = Math.max(retryDeadline, Date.now() + Number(item.retryAfter) * 1000);
  warning = warnings.map((item) => item.message).join(" ");
  listeners.forEach((fn) => fn());
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const get = !options.method || options.method === "GET";
  const epoch = generation;
  const key = csrfToken + ":" + epoch + ":" + path;
  const cached = reads.get(key);
  if (get && options.cache !== "reload" && cached && cached.until > Date.now()) return cached.value;
  if (!get) {
    generation++;
    const prefix = path.match(/^\/guilds\/[^/]+/)?.[0];
    for (const readKey of reads.keys())
      if (!prefix || readKey.includes(prefix)) reads.delete(readKey);
  }
  if (get && flights.has(key)) return flights.get(key)!;
  const request = requestApi<T>(path, options)
    .then((value) => {
      if (
        get &&
        epoch === generation &&
        !path.includes("/jobs/") &&
        !path.startsWith("/auth/")
      ) {
        if (reads.size >= 100) reads.delete(reads.keys().next().value!);
        reads.set(key, { value, until: Date.now() + 15000 });
      }
      return value;
    })
    .finally(() => flights.delete(key));
  if (get) flights.set(key, request);
  return request;
}
export function setCsrf(token: string) {
  if (csrfToken !== (token || "")) {
    generation++;
    reads.clear();
    flights.clear();
    clearDiscordWarning();
    retryDeadline = 0;
  }
  csrfToken = token || "";
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
async function requestApi<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.method && options.method !== "GET"
        ? { "x-csrf-token": csrfToken }
        : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => null);
  notice(body?.warnings);
  if (!response.ok) {
    const seconds = Math.max(
      Number(response.headers.get("Retry-After")) || 0,
      body?.error?.retryAfter || 0,
    );
    if (response.status === 429) {
      retryDeadline = Date.now() + Math.max(seconds, 1) * 1000;
      listeners.forEach((fn) => fn());
    }
    const validation = body?.error?.issues
      ?.map(
        (issue: { path: string; message: string }) =>
          `${issue.path}: ${issue.message}`,
      )
      .join(" · ");
    const message =
      validation ||
      (typeof body?.error === "string"
        ? body.error
        : body?.error?.message || body?.message);
    throw new ApiError(
      response.status,
      message ||
        (response.status === 401
          ? "Sua sessão expirou. Entre novamente com Discord."
          : response.status === 403
            ? "Você não tem permissão para realizar esta ação."
            : response.status === 409
              ? "Outra pessoa alterou estes dados. Recarregue antes de salvar."
              : "Não foi possível concluir. Tente novamente."),
      body?.details,
      seconds,
    );
  }
  return body;
}
export const write = <T = any>(path: string, method: string, body?: unknown) =>
  api<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
export async function waitJob(
  guildId: string,
  response: any,
  update?: (job: Job) => void,
): Promise<Job> {
  const id = response.job?.id || response.jobId || response.id;
  if (!id)
    throw new Error(
      "A API não retornou a operação do bot. Atualize a página antes de tentar novamente.",
    );
  for (let attempt = 0; attempt < 45; attempt++) {
    let result: { job: Job };
    try {
      result = await api<{ job: Job }>(`/guilds/${guildId}/jobs/${id}`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, error.retryAfter) * 1000),
      );
      continue;
    }
    const job = result.job;
    const remaining = Math.max(
      0,
      Math.ceil((Number(job.result?.retryAt || 0) - Date.now()) / 1000),
    );
    if (remaining > 0) {
      retryDeadline = Math.max(retryDeadline, Date.now() + remaining * 1000);
      notice([
        {
          message: `O Discord está limitando temporariamente as solicitações. Seus dados continuam salvos. Tente novamente em ${remaining} segundos.`,
        },
      ]);
    }
    update?.(job);
    if (job.status === "done") {
      for (const key of reads.keys())
        if (key.includes(`/guilds/${guildId}/`)) reads.delete(key);
      return job;
    }
    if (job.status === "failed")
      throw new ApiError(
        job.result?.retryAfter ? 429 : 502,
        job.error ||
          "O bot não conseguiu concluir esta operação. Confira suas permissões.",
        undefined,
        Number(job.result?.retryAfter || 0),
      );
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(2000, Number(job.result?.retryAt || 0) - Date.now()),
      ),
    );
  }
  throw new Error(
    "A operação continua na fila do bot. Atualize o painel para acompanhar; não publique novamente.",
  );
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
}
export function iconUrl(guild: { id: string; icon?: string }) {
  return guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
    : "";
}
export function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR");
}
export function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}
export function safeImage(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "cdn.discordapp.com",
        "media.discordapp.net",
        "images.unsplash.com",
      ].includes(url.hostname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}
