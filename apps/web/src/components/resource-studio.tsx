"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Eye,
  Hash,
  Layers3,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorText, safeImage, waitJob, write } from "@/lib/api";
import type { Data, GuildContext, Resource } from "@/lib/types";
import {
  AddButton,
  ChannelSelect,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  MultiSelect,
  Panel,
  RoleSelect,
  Spinner,
  useSession,
} from "./ui";
import { Operations } from "./overview";

const labels: Record<string, [string, string]> = {
  role_panel: ["painel de cargos", "painéis de cargos"],
  embed: ["embed", "embeds"],
  custom_command: ["comando", "comandos"],
  scheduled_message: ["mensagem", "mensagens"],
  ticket_panel: ["painel de tickets", "painéis de tickets"],
  suggestion: ["sugestão", "sugestões"],
  event: ["evento", "eventos"],
  giveaway: ["sorteio", "sorteios"],
  season: ["temporada", "temporadas"],
  achievement: ["conquista", "conquistas"],
  mission: ["missão", "missões"],
};
const templates = [
  {
    name: "Interesses",
    icon: "💫",
    description: "Encontre pessoas com os mesmos interesses.",
    mode: "multiple",
    options: [
      ["🎮", "Jogos"],
      ["🎵", "Música"],
      ["💻", "Programação"],
    ],
  },
  {
    name: "Notificações",
    icon: "🔔",
    description: "Escolha quais novidades quer receber.",
    mode: "multiple",
    options: [
      ["📢", "Anúncios"],
      ["🎉", "Eventos"],
      ["🎁", "Sorteios"],
    ],
  },
  {
    name: "Região",
    icon: "🌎",
    description: "De qual região você participa?",
    mode: "single",
    options: [
      ["🌎", "América"],
      ["🌍", "Europa"],
      ["🌏", "Ásia"],
    ],
  },
  {
    name: "Plataforma",
    icon: "🕹️",
    description: "Onde você joga? Escolha suas plataformas.",
    mode: "multiple",
    options: [
      ["🖥️", "PC"],
      ["🎮", "Console"],
      ["📱", "Mobile"],
    ],
  },
  {
    name: "Estilo de jogo",
    icon: "⚔️",
    description: "Escolha o estilo que combina com você.",
    mode: "single",
    options: [
      ["⚔️", "Competitivo"],
      ["🛡️", "Cooperativo"],
      ["🎲", "Casual"],
    ],
  },
];
function initial(kind: string): Data {
  const common = {
    name: "",
    title: "",
    description: "",
    channelId: "",
    color: "#b49aff",
    imageUrl: "",
    thumbnailUrl: "",
    footer: "",
  };
  const extra: Record<string, Data> = {
    role_panel: { type: "buttons", mode: "multiple", group: "", options: [] },
    embed: { buttons: [] },
    custom_command: { response: "" },
    scheduled_message: {
      content: "",
      runAt: "",
      recurrence: "none",
      daysOfWeek: [],
    },
    ticket_panel: {
      categoryId: "",
      supportRoleIds: [],
      categories: [{ id: crypto.randomUUID(), label: "Suporte" }],
    },
    event: { startsAt: "", maxParticipants: 100 },
    giveaway: { endsAt: "", winners: 1, requiredRoleId: "" },
    season: { startsAt: "", endsAt: "" },
    achievement: { emoji: "🏆", condition: "level", value: 10 },
    mission: {
      period: "daily",
      condition: "messages",
      value: 20,
      rewardXp: 100,
    },
  };
  const minimal = [
    "custom_command",
    "scheduled_message",
    "season",
    "achievement",
    "mission",
  ].includes(kind);
  return {
    ...(minimal
      ? {
          name: "",
          ...(kind === "achievement" ? { description: "" } : {}),
          ...(kind === "scheduled_message" ? { channelId: "" } : {}),
        }
      : common),
    ...extra[kind],
  };
}
const publishable = new Set([
  "role_panel",
  "ticket_panel",
  "event",
  "giveaway",
  "suggestion",
  "scheduled_message",
  "custom_command",
  "season",
  "achievement",
  "mission",
]);
const visibleEmbed = new Set([
  "role_panel",
  "embed",
  "ticket_panel",
  "event",
  "giveaway",
  "suggestion",
]);
function dateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function ResourceStudio({
  guildId,
  context,
  kind,
}: {
  guildId: string;
  context: GuildContext;
  kind: string;
}) {
  const { notify } = useSession();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const [draft, setDraft] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<
    "delete" | "unpublish" | "leave" | null
  >(null);
  const [baseline, setBaseline] = useState("");
  const [tab, setTab] = useState("panels");
  const [singular, plural] = labels[kind];
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResources(
        (await api(`/guilds/${guildId}/resources?kind=${kind}`)).resources ||
          [],
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, kind]);
  useEffect(() => {
    void load();
  }, [load]);
  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const set = (key: string, value: any) =>
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
  function edit(resource?: Resource, template?: (typeof templates)[number]) {
    let data = resource ? structuredClone(resource.data) : initial(kind);
    if (template)
      data = {
        ...data,
        name: template.name,
        title: `${template.icon} Escolha seus ${template.name.toLowerCase()}`,
        description: template.description,
        group: template.name,
        mode: template.mode,
        options: template.options.map(([emoji, label]) => ({
          id: crypto.randomUUID(),
          emoji,
          label,
          roleId: "",
        })),
      };
    setSelected(resource || null);
    setDraft(data);
    setBaseline(JSON.stringify(data));
    setError("");
  }
  function close() {
    setDraft(null);
    setSelected(null);
    setError("");
    setConfirm(null);
  }
  async function save(): Promise<Resource> {
    const result = selected
      ? await write(`/guilds/${guildId}/resources/${selected.id}`, "PUT", {
          data: draft,
          version: selected.version,
        })
      : await write(`/guilds/${guildId}/resources`, "POST", {
          kind,
          data: draft,
        });
    const resource = result.resource || result;
    setSelected(resource);
    setBaseline(JSON.stringify(draft));
    return resource;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const intent =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)
        ?.dataset.intent || "save";
    setBusy("Salvando…");
    setError("");
    try {
      const resource = await save();
      if (intent !== "save") {
        setBusy("Aguardando o Kagetsu…");
        const action = kind === "embed" ? "send" : "publish";
        await waitJob(
          guildId,
          await write(
            `/guilds/${guildId}/resources/${resource.id}/${action}`,
            "POST",
          ),
          (job) =>
            setBusy(
              job.status === "running"
                ? "Aplicando no Discord…"
                : "Aguardando o Kagetsu…",
            ),
        );
        const result = await api(`/guilds/${guildId}/resources?kind=${kind}`);
        setResources(result.resources);
        const updated = result.resources.find(
          (item: Resource) => item.id === resource.id,
        );
        if (updated) setSelected(updated);
        notify(
          kind === "embed"
            ? "Embed enviado ao Discord."
            : "Publicado. Sua comunidade já pode participar.",
        );
      } else {
        notify("Alterações salvas.");
        setResources((previous) => [
          resource,
          ...previous.filter((item) => item.id !== resource.id),
        ]);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }
  async function destructive(action: "delete" | "unpublish") {
    if (!selected) return;
    setConfirm(null);
    setBusy(action === "delete" ? "Excluindo…" : "Despublicando…");
    setError("");
    try {
      if (action === "delete") {
        await write(`/guilds/${guildId}/resources/${selected.id}`, "DELETE");
        close();
        await load();
        notify("Excluído.");
      } else {
        await waitJob(
          guildId,
          await write(
            `/guilds/${guildId}/resources/${selected.id}/unpublish`,
            "POST",
          ),
        );
        const result = await api(`/guilds/${guildId}/resources?kind=${kind}`);
        setResources(result.resources);
        setSelected(
          result.resources.find((item: Resource) => item.id === selected.id),
        );
        notify("Despublicado com sucesso.");
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }
  if (loading && !draft) return <Spinner label={`Carregando ${plural}…`} />;
  const options = draft?.options || [];
  return (
    <>
      {kind === "tickets" || kind === "ticket_panel" ? (
        <div className="tabs">
          <button
            className={tab === "panels" ? "active" : ""}
            onClick={() => setTab("panels")}
          >
            Painéis
          </button>
          <button
            className={tab === "tickets" ? "active" : ""}
            onClick={() => setTab("tickets")}
          >
            Atendimentos
          </button>
        </div>
      ) : null}
      {tab === "tickets" ? (
        <Operations guildId={guildId} kind="tickets" />
      ) : !draft ? (
        <>
          {error && <ErrorBox message={error} retry={load} />}
          <div className="section-toolbar">
            <span className="muted">
              {resources.length} {resources.length === 1 ? singular : plural}
            </span>
            <button className="button primary" onClick={() => edit()}>
              <Plus size={17} />
              Novo {singular}
            </button>
          </div>
          {kind === "role_panel" && (
            <div className="template-section">
              <div className="section-label">
                <Sparkles size={15} />
                Comece com uma ideia <span>ou crie do zero</span>
              </div>
              <div className="template-grid">
                {templates.map((template) => (
                  <button
                    key={template.name}
                    className="template-card"
                    onClick={() => edit(undefined, template)}
                  >
                    <span>{template.icon}</span>
                    <strong>{template.name}</strong>
                    <Plus size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {resources.length ? (
            <div className="resource-grid">
              {resources.map((resource) => (
                <article key={resource.id} className="resource-card">
                  <div className="resource-card-top">
                    <span className="feature-icon purple">
                      <Layers3 size={21} />
                    </span>
                    <span
                      className={`badge ${resource.status === "published" ? "green" : ""}`}
                    >
                      {resource.status === "published"
                        ? "Publicado"
                        : resource.status === "closed"
                          ? "Encerrado"
                          : "Rascunho"}
                    </span>
                  </div>
                  <h3>
                    {resource.data.name || resource.data.title || singular}
                  </h3>
                  <p>
                    {resource.data.description ||
                      resource.data.content ||
                      resource.data.response ||
                      "Pronto para receber sua configuração."}
                  </p>
                  <div className="resource-meta">
                    <span>
                      <Hash size={14} />
                      {context.channels.find(
                        (channel) =>
                          channel.id ===
                          (resource.channel_id || resource.data.channelId),
                      )?.name || "Sem canal"}
                    </span>
                    {kind === "role_panel" && (
                      <span>
                        {resource.data.options?.length || 0} cargos ·{" "}
                        {resource.data.mode === "single"
                          ? "exclusivo"
                          : "múltiplos"}
                      </span>
                    )}
                  </div>
                  <div className="resource-card-actions">
                    <button
                      className="button secondary small"
                      onClick={() => edit(resource)}
                    >
                      Editar {singular}
                    </button>
                    {resource.message_id && resource.channel_id && (
                      <a
                        href={`https://discord.com/channels/${guildId}/${resource.channel_id}/${resource.message_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="icon-button"
                        aria-label="Ver mensagem no Discord"
                      >
                        <ArrowUpRight size={17} />
                      </a>
                    )}
                  </div>
                  {kind === "suggestion" && (
                    <SuggestionStatus
                      guildId={guildId}
                      resource={resource}
                      reload={load}
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Layers3 size={28} />}
              title={`Seu primeiro ${singular} começa aqui`}
              description={
                kind === "role_panel"
                  ? "Escolha um template, conecte os cargos do servidor e publique. O Kagetsu cuida da mensagem no Discord."
                  : `Crie e configure ${plural} para sua comunidade. Tudo fica salvo neste servidor.`
              }
              action={
                <button className="button primary" onClick={() => edit()}>
                  <Plus size={16} />
                  Criar {singular}
                </button>
              }
            />
          )}
          {kind === "suggestion" && (
            <p className="subtle-note">
              Sugestões enviadas pelo comando /sugerir também aparecem aqui para
              avaliação.
            </p>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="editor-toolbar">
            <button
              type="button"
              className="back-link"
              onClick={() => (dirty ? setConfirm("leave") : close())}
            >
              <ArrowLeft size={17} />
              Todos os {plural}
            </button>
            <span
              className={`badge ${selected?.status === "published" ? "green" : ""}`}
            >
              {selected?.status === "published" ? "Publicado" : "Rascunho"}
              {dirty ? " · alterações não salvas" : ""}
            </span>
          </div>
          {error && <ErrorBox message={error} />}
          <div
            className={visibleEmbed.has(kind) ? "studio-grid" : "single-form"}
          >
            <div className="studio-fields">
              <Panel
                title="Identidade"
                description="Organize este conteúdo no dashboard."
              >
                <Field label="Nome interno">
                  <input
                    value={draft.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    required
                    maxLength={100}
                    placeholder={
                      kind === "role_panel"
                        ? "Ex.: Interesses da comunidade"
                        : `Nome do ${singular}`
                    }
                  />
                </Field>
                {visibleEmbed.has(kind) && (
                  <>
                    <div className="form-grid">
                      <ChannelSelect
                        channels={context.channels}
                        value={draft.channelId}
                        onChange={(value) => set("channelId", value)}
                        required
                      />
                      <Field label="Cor de destaque">
                        <div className="color-field">
                          <input
                            type="color"
                            value={draft.color || "#b49aff"}
                            onChange={(e) => set("color", e.target.value)}
                          />
                          <input
                            aria-label="Cor hexadecimal"
                            pattern="#[a-fA-F0-9]{6}"
                            value={draft.color || "#b49aff"}
                            onChange={(e) => set("color", e.target.value)}
                          />
                        </div>
                      </Field>
                    </div>
                    <Field label="Título">
                      <input
                        value={draft.title || ""}
                        onChange={(e) => set("title", e.target.value)}
                        required
                        maxLength={256}
                        placeholder="Uma mensagem que conecta"
                      />
                    </Field>
                    <Field
                      label="Descrição"
                      hint="O Discord aceita formatação Markdown."
                    >
                      <textarea
                        rows={4}
                        value={draft.description || ""}
                        onChange={(e) => set("description", e.target.value)}
                        maxLength={4000}
                        placeholder="Conte à comunidade como participar…"
                      />
                    </Field>
                  </>
                )}
              </Panel>
              {kind === "role_panel" && (
                <>
                  <Panel
                    title="Como os cargos funcionam"
                    description="Uma escolha simples para quem participa."
                  >
                    <div className="form-grid">
                      <Field label="Tipo de painel">
                        <select
                          value={draft.type}
                          onChange={(e) => set("type", e.target.value)}
                        >
                          <option value="buttons">Botões</option>
                          <option value="select">Menu de seleção</option>
                          <option value="reactions">Reações</option>
                        </select>
                      </Field>
                      <Field label="Seleção de cargos">
                        <select
                          value={draft.mode}
                          onChange={(e) => set("mode", e.target.value)}
                        >
                          <option value="multiple">
                            Permitir vários cargos
                          </option>
                          <option value="single">Apenas um cargo</option>
                        </select>
                      </Field>
                    </div>
                    <Field
                      label="Grupo"
                      hint="Painéis com o mesmo grupo exclusivo compartilham a exclusividade."
                    >
                      <input
                        value={draft.group || ""}
                        onChange={(e) => set("group", e.target.value)}
                        maxLength={100}
                        placeholder="Ex.: Interesses"
                      />
                    </Field>
                    {draft.mode === "single" && (
                      <div className="inline-note">
                        Ao escolher um novo cargo, o anterior neste grupo é
                        removido automaticamente.
                      </div>
                    )}
                  </Panel>
                  <Panel
                    title="Opções de cargos"
                    description={`${options.length}/25 opções. Selecione cargos reais do seu servidor.`}
                    action={
                      <AddButton
                        disabled={options.length >= 25}
                        onClick={() =>
                          set("options", [
                            ...options,
                            {
                              id: crypto.randomUUID(),
                              emoji: "",
                              label: "",
                              roleId: "",
                            },
                          ])
                        }
                      >
                        Adicionar
                      </AddButton>
                    }
                  >
                    {!options.length && (
                      <div className="inline-empty">
                        Adicione a primeira opção para começar seu painel.
                      </div>
                    )}
                    {options.map((option: Data, index: number) => (
                      <div className="option-row" key={option.id || index}>
                        <div className="option-heading">
                          <span className="option-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <strong>{option.label || "Nova opção"}</strong>
                          <div>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Mover opção para cima"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...options];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                set("options", next);
                              }}
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Mover opção para baixo"
                              disabled={index === options.length - 1}
                              onClick={() => {
                                const next = [...options];
                                [next[index + 1], next[index]] = [
                                  next[index],
                                  next[index + 1],
                                ];
                                set("options", next);
                              }}
                            >
                              <ArrowDown size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button destructive"
                              aria-label="Remover opção"
                              onClick={() =>
                                set(
                                  "options",
                                  options.filter(
                                    (_: unknown, i: number) => i !== index,
                                  ),
                                )
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="option-fields">
                          <Field label="Emoji">
                            <input
                              value={option.emoji || ""}
                              placeholder="✨"
                              maxLength={100}
                              required={draft.type === "reactions"}
                              onChange={(e) =>
                                set(
                                  "options",
                                  options.map((item: Data, i: number) =>
                                    i === index
                                      ? { ...item, emoji: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label="Nome no botão">
                            <input
                              value={option.label || ""}
                              placeholder="Nome da opção"
                              required
                              maxLength={80}
                              onChange={(e) =>
                                set(
                                  "options",
                                  options.map((item: Data, i: number) =>
                                    i === index
                                      ? { ...item, label: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </Field>
                        </div>
                        <RoleSelect
                          roles={context.roles}
                          value={option.roleId}
                          required
                          onChange={(roleId) =>
                            set(
                              "options",
                              options.map((item: Data, i: number) =>
                                i === index ? { ...item, roleId } : item,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </Panel>
                </>
              )}
              <ResourceFields
                kind={kind}
                draft={draft}
                set={set}
                context={context}
              />
              {visibleEmbed.has(kind) && (
                <Panel
                  title="Detalhes visuais"
                  description="Opcional. Imagens HTTPS do Discord ou Unsplash."
                >
                  <Field
                    label="Imagem"
                    hint="cdn.discordapp.com, media.discordapp.net ou images.unsplash.com"
                  >
                    <input
                      type="url"
                      value={draft.imageUrl || ""}
                      onChange={(e) => set("imageUrl", e.target.value)}
                      placeholder="https://…"
                    />
                  </Field>
                  <Field label="Thumbnail">
                    <input
                      type="url"
                      value={draft.thumbnailUrl || ""}
                      onChange={(e) => set("thumbnailUrl", e.target.value)}
                      placeholder="https://…"
                    />
                  </Field>
                  <Field label="Rodapé">
                    <input
                      value={draft.footer || ""}
                      maxLength={2048}
                      onChange={(e) => set("footer", e.target.value)}
                      placeholder="Uma última observação…"
                    />
                  </Field>
                </Panel>
              )}
              {selected && (
                <div className="danger-zone">
                  <div>
                    <strong>Gerenciar {singular}</strong>
                    <p>
                      {selected.status === "published"
                        ? "Despublique antes de excluir."
                        : "A exclusão deste registro é permanente."}
                    </p>
                  </div>
                  {selected.status === "published" ? (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setConfirm("unpublish")}
                      disabled={!!busy}
                    >
                      Despublicar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button danger-button small"
                      onClick={() => setConfirm("delete")}
                      disabled={!!busy}
                    >
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  )}
                </div>
              )}
            </div>
            {visibleEmbed.has(kind) && (
              <aside className="preview-column">
                <div className="preview-title">
                  <Eye size={16} />
                  Preview ao vivo<span className="badge">Discord</span>
                </div>
                <DiscordPreview data={draft} kind={kind} />
                <p className="preview-note">
                  Prévia aproximada. O Discord pode adaptar o layout em
                  diferentes telas.
                </p>
                {kind === "role_panel" && (
                  <div className="preview-tip">
                    <Sparkles size={19} />
                    <div>
                      <strong>Feito para conectar</strong>
                      <p>
                        {draft.mode === "single"
                          ? "Cada membro escolhe um cargo deste grupo."
                          : "Os membros podem combinar seus cargos favoritos."}
                      </p>
                    </div>
                  </div>
                )}
                {selected?.message_id && (
                  <a
                    className="button secondary full"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://discord.com/channels/${guildId}/${selected.channel_id}/${selected.message_id}`}
                  >
                    Ver no Discord <ArrowUpRight size={16} />
                  </a>
                )}
              </aside>
            )}
          </div>
          <div className="save-bar">
            <span>
              {busy ? (
                <>
                  <span className="mini-spinner" />
                  {busy}
                </>
              ) : dirty ? (
                "Você tem alterações não salvas"
              ) : (
                "Tudo organizado, do seu jeito"
              )}
            </span>
            <div className="actions">
              <button
                type="submit"
                data-intent="save"
                className="button secondary"
                disabled={!!busy || (kind === "role_panel" && !options.length)}
              >
                <Save size={16} />
                Salvar{kind === "embed" ? " template" : ""}
              </button>
              {(publishable.has(kind) || kind === "embed") && (
                <button
                  type="submit"
                  data-intent="publish"
                  className="button primary"
                  disabled={
                    !!busy || (kind === "role_panel" && !options.length)
                  }
                >
                  <Send size={16} />
                  {kind === "embed"
                    ? "Enviar ao Discord"
                    : selected?.status === "published"
                      ? "Atualizar publicação"
                      : "Publicar"}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
      {confirm && (
        <Confirm
          title={
            confirm === "leave"
              ? "Descartar as alterações?"
              : confirm === "delete"
                ? `Excluir ${singular}?`
                : `Despublicar ${singular}?`
          }
          description={
            confirm === "leave"
              ? "As alterações que ainda não foram salvas serão perdidas."
              : confirm === "delete"
                ? "Este registro será excluído permanentemente deste servidor."
                : "O bot removerá a publicação do Discord. A configuração continuará salva para você editar."
          }
          confirm={
            confirm === "leave"
              ? "Descartar"
              : confirm === "delete"
                ? "Excluir"
                : "Despublicar"
          }
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() =>
            confirm === "leave" ? close() : void destructive(confirm)
          }
        />
      )}
    </>
  );
}

function ResourceFields({
  kind,
  draft,
  set,
  context,
}: {
  kind: string;
  draft: Data;
  set: (k: string, v: any) => void;
  context: GuildContext;
}) {
  const number = (key: string, label: string, min = 1) => (
    <Field label={label}>
      <input
        type="number"
        min={min}
        required
        value={draft[key] ?? min}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </Field>
  );
  const date = (key: string, label: string) => (
    <Field
      label={label}
      hint={`Horário exibido no seu dispositivo (${Intl.DateTimeFormat().resolvedOptions().timeZone}). O agendamento usa ${context.config.general?.timezone || "America/Sao_Paulo"}.`}
    >
      <input
        type="datetime-local"
        required
        value={dateInput(draft[key])}
        onChange={(e) =>
          set(key, e.target.value ? new Date(e.target.value).toISOString() : "")
        }
      />
    </Field>
  );
  if (kind === "role_panel" || kind === "suggestion") return null;
  return (
    <Panel title={kind === "embed" ? "Botões com links" : "Configuração"}>
      {kind === "embed" && (
        <>
          {(draft.buttons || []).map((button: Data, index: number) => (
            <div className="repeat-row" key={index}>
              <Field label="Texto">
                <input
                  value={button.label}
                  required
                  maxLength={80}
                  onChange={(e) =>
                    set(
                      "buttons",
                      draft.buttons.map((item: Data, i: number) =>
                        i === index ? { ...item, label: e.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Link">
                <input
                  type="url"
                  value={button.url}
                  required
                  onChange={(e) =>
                    set(
                      "buttons",
                      draft.buttons.map((item: Data, i: number) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <button
                type="button"
                className="icon-button destructive"
                aria-label="Remover botão"
                onClick={() =>
                  set(
                    "buttons",
                    draft.buttons.filter(
                      (_: unknown, i: number) => i !== index,
                    ),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <AddButton
            disabled={(draft.buttons || []).length >= 5}
            onClick={() =>
              set("buttons", [...(draft.buttons || []), { label: "", url: "" }])
            }
          >
            Adicionar botão
          </AddButton>
        </>
      )}
      {kind === "custom_command" && (
        <>
          <Field
            label="Resposta"
            hint="Variáveis: {user}, {server}, {channel}. O nome interno acima é o nome do comando, sem prefixo."
          >
            <textarea
              required
              maxLength={2000}
              rows={5}
              value={draft.response || ""}
              onChange={(e) => set("response", e.target.value)}
            />
          </Field>
          <div className="inline-note">
            Exemplo de uso: {context.config.general?.prefix || "!"}
            {draft.name || "regras"}
          </div>
        </>
      )}
      {kind === "scheduled_message" && (
        <>
          <ChannelSelect
            channels={context.channels}
            value={draft.channelId}
            onChange={(v) => set("channelId", v)}
            required
          />
          <Field label="Mensagem">
            <textarea
              rows={5}
              required
              maxLength={2000}
              value={draft.content || ""}
              onChange={(e) => set("content", e.target.value)}
            />
          </Field>
          {date("runAt", "Primeiro envio")}
          <Field label="Recorrência">
            <select
              value={draft.recurrence}
              onChange={(e) => set("recurrence", e.target.value)}
            >
              <option value="none">Apenas uma vez</option>
              <option value="daily">Diariamente</option>
              <option value="weekly">Semanalmente / dias específicos</option>
            </select>
          </Field>
          {draft.recurrence === "weekly" && (
            <div className="weekdays">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                (day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={draft.daysOfWeek?.includes(index)}
                      onChange={(e) =>
                        set(
                          "daysOfWeek",
                          e.target.checked
                            ? [...(draft.daysOfWeek || []), index]
                            : draft.daysOfWeek.filter(
                                (v: number) => v !== index,
                              ),
                        )
                      }
                    />
                    <span>{day}</span>
                  </label>
                ),
              )}
            </div>
          )}
        </>
      )}
      {kind === "ticket_panel" && (
        <>
          <ChannelSelect
            channels={context.channels}
            value={draft.categoryId}
            onChange={(v) => set("categoryId", v)}
            types={[4]}
            label="Categoria dos tickets"
            required
          />
          <MultiSelect
            label="Equipe de suporte"
            items={context.roles.map((role) => ({
              id: role.id,
              name: `@${role.name}`,
            }))}
            values={draft.supportRoleIds || []}
            onChange={(v) => set("supportRoleIds", v)}
          />
          {(draft.categories || []).map((category: Data, index: number) => (
            <div className="repeat-row" key={category.id}>
              <Field label={`Categoria de atendimento ${index + 1}`}>
                <input
                  required
                  value={category.label}
                  maxLength={80}
                  onChange={(e) =>
                    set(
                      "categories",
                      draft.categories.map((item: Data, i: number) =>
                        i === index ? { ...item, label: e.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <button
                type="button"
                className="icon-button destructive"
                aria-label="Remover categoria"
                onClick={() =>
                  set(
                    "categories",
                    draft.categories.filter(
                      (_: unknown, i: number) => i !== index,
                    ),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <AddButton
            disabled={draft.categories?.length >= 5}
            onClick={() =>
              set("categories", [
                ...(draft.categories || []),
                { id: crypto.randomUUID(), label: "" },
              ])
            }
          >
            Adicionar categoria
          </AddButton>
        </>
      )}
      {kind === "event" && (
        <>
          {date("startsAt", "Início do evento")}
          {number("maxParticipants", "Limite de participantes")}
        </>
      )}
      {kind === "giveaway" && (
        <>
          {date("endsAt", "Encerramento")}
          {number("winners", "Quantidade de vencedores")}
          <RoleSelect
            roles={context.roles}
            safe={false}
            value={draft.requiredRoleId}
            onChange={(v) => set("requiredRoleId", v)}
            label="Cargo obrigatório (opcional)"
          />
        </>
      )}
      {kind === "season" && (
        <>
          {date("startsAt", "Início")}
          {date("endsAt", "Fim")}
          <div className="inline-note">
            As temporadas acompanham XP separado. O XP global e o histórico
            permanecem preservados.
          </div>
        </>
      )}
      {kind === "achievement" && (
        <>
          <Field label="Descrição">
            <textarea
              value={draft.description || ""}
              onChange={(e) => set("description", e.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field label="Emoji">
            <input
              value={draft.emoji || ""}
              onChange={(e) => set("emoji", e.target.value)}
              maxLength={50}
            />
          </Field>
        </>
      )}
      {(kind === "achievement" || kind === "mission") && (
        <>
          {kind === "mission" && (
            <Field label="Período">
              <select
                value={draft.period}
                onChange={(e) => set("period", e.target.value)}
              >
                <option value="daily">Diário</option>
                <option value="weekly">Semanal</option>
              </select>
            </Field>
          )}
          <Field label="Condição">
            <select
              value={draft.condition}
              onChange={(e) => set("condition", e.target.value)}
            >
              {kind === "achievement" && (
                <option value="level">Atingir nível</option>
              )}
              <option value="messages">Mensagens enviadas</option>
              <option value="voiceMinutes">Minutos em voz</option>
            </select>
          </Field>
          {number("value", "Meta")}
          {kind === "mission" && number("rewardXp", "XP de recompensa", 0)}
        </>
      )}
    </Panel>
  );
}

export function DiscordPreview({ data, kind }: { data: Data; kind: string }) {
  return (
    <div className="discord-preview">
      <div className="discord-avatar">☾</div>
      <div className="discord-message">
        <div className="discord-author">
          Kagetsu <span>APP</span>
          <small>Hoje às 12:00</small>
        </div>
        <div
          className="discord-embed"
          style={{
            borderLeftColor: /^#[0-9a-f]{6}$/i.test(data.color || "")
              ? data.color
              : "#b49aff",
          }}
        >
          {safeImage(data.thumbnailUrl) && (
            <img
              className="embed-thumbnail"
              src={safeImage(data.thumbnailUrl)}
              alt="Thumbnail do preview"
              referrerPolicy="no-referrer"
            />
          )}
          <h3>{data.title || "Seu título aparece aqui"}</h3>
          <p>
            {data.description ||
              "Sua mensagem ganha vida aqui. Configure os campos ao lado para acompanhar o resultado."}
          </p>
          {safeImage(data.imageUrl) && (
            <img
              className="embed-image"
              src={safeImage(data.imageUrl)}
              alt="Imagem do preview"
              referrerPolicy="no-referrer"
            />
          )}
          {data.footer && <small className="embed-footer">{data.footer}</small>}
        </div>
        {kind === "role_panel" &&
          (data.type === "select" ? (
            <div className="discord-select">
              <span>
                Selecione {data.mode === "single" ? "um cargo" : "seus cargos"}
              </span>
              <ChevronDown size={17} />
            </div>
          ) : (
            <div className="discord-buttons">
              {(data.options || []).map((option: Data, index: number) => (
                <span
                  className={
                    data.type === "reactions"
                      ? "discord-reaction"
                      : "discord-button"
                  }
                  key={option.id || index}
                >
                  {option.emoji || "◇"}{" "}
                  {data.type !== "reactions"
                    ? option.label || "Nova opção"
                    : "1"}
                </span>
              ))}
            </div>
          ))}
        {kind === "embed" && (
          <div className="discord-buttons">
            {(data.buttons || []).map((button: Data, i: number) => (
              <span key={i} className="discord-button">
                {button.label || "Abrir link"}
                <ArrowUpRight size={13} />
              </span>
            ))}
          </div>
        )}
        {kind === "ticket_panel" && (
          <div className="discord-buttons">
            {(data.categories || []).map((item: Data) => (
              <span key={item.id} className="discord-button">
                🎫 {item.label || "Abrir ticket"}
              </span>
            ))}
          </div>
        )}
        {kind === "event" && (
          <div className="discord-buttons">
            <span className="discord-button">Participar</span>
            <span className="discord-button">Sair</span>
          </div>
        )}
        {kind === "giveaway" && (
          <div className="discord-buttons">
            <span className="discord-button">🎉 Participar</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionStatus({
  guildId,
  resource,
  reload,
}: {
  guildId: string;
  resource: Resource;
  reload: () => Promise<void>;
}) {
  const { notify } = useSession();
  const [busy, setBusy] = useState(false);
  async function change(status: string) {
    setBusy(true);
    try {
      await waitJob(
        guildId,
        await write(
          `/guilds/${guildId}/resources/${resource.id}/status`,
          "POST",
          { status },
        ),
      );
      notify("Status da sugestão atualizado.");
      await reload();
    } catch (err) {
      notify(errorText(err), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field label="Avaliação">
      <select
        value={resource.data.status || "pending"}
        disabled={busy}
        onChange={(e) => void change(e.target.value)}
      >
        <option value="pending">Em análise</option>
        <option value="approved">Aprovada</option>
        <option value="rejected">Recusada</option>
        <option value="implemented">Implementada</option>
      </select>
    </Field>
  );
}
