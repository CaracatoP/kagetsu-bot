import type { Job } from "./types";

let csrfToken = "";
export function setCsrf(token: string) {
  csrfToken = token || "";
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function api<T = any>(
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
  if (!response.ok) {
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
    const result = await api<{ job: Job }>(`/guilds/${guildId}/jobs/${id}`);
    const job = result.job;
    update?.(job);
    if (job.status === "done") return job;
    if (job.status === "failed")
      throw new Error(
        job.error ||
          "O bot não conseguiu concluir esta operação. Confira suas permissões.",
      );
    await new Promise((resolve) => setTimeout(resolve, 2000));
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
