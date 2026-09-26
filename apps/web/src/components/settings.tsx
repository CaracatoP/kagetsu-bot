"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Layers3,
  Moon,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { totalXpForLevel } from "../../../../packages/shared/levels";
import { errorText, safeImage } from "@/lib/api";
import { moduleNames, type Data, type GuildContext } from "@/lib/types";
import {
  AddButton,
  ChannelSelect,
  Confirm,
  ErrorBox,
  Field,
  MultiSelect,
  Panel,
  RoleSelect,
  Toggle,
} from "./ui";
import { Records } from "./overview";
import { WelcomeBuilder } from "./welcome-builder";
import { ModuleDetails } from "./module-details";
import { EscalationEditor } from "./escalation-editor";

const newReward = () => ({
  id: crypto.randomUUID(),
  name: "",
  level: 5,
  roleId: "",
  xp: "0",
  requiredRoleId: "",
});
function getPath(source: Data, path: string): any {
  return path.split(".").reduce<any>((value, key) => value?.[key], source);
}
function updatePath(source: Data, path: string, value: any) {
  const next = structuredClone(source);
  const keys = path.split(".");
  let pointer = next;
  for (const key of keys.slice(0, -1)) pointer = pointer[key] ??= {};
  pointer[keys[keys.length - 1]] = value;
  return next;
}

export function Settings({
  section,
  context,
  save,
  guildId,
}: {
  section: string;
  context: GuildContext;
  save: (config: Data) => Promise<void>;
  guildId: string;
}) {
  const [draft, setDraft] = useState<Data>(() =>
    structuredClone(context.config),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [curveConfirm, setCurveConfirm] = useState(false);
  const [step, setStep] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(context.config);
  const set = (path: string, value: any) =>
    setDraft((previous) => updatePath(previous, path, value));
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function persist() {
    setCurveConfirm(false);
    setBusy(true);
    setError("");
    try {
      await save(draft);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      JSON.stringify(draft.levels.curve) !==
      JSON.stringify(context.config.levels.curve)
    )
      setCurveConfirm(true);
    else void persist();
  }
  const field = (
    path: string,
    label: string,
    options: {
      type?: string;
      min?: number;
      max?: number;
      hint?: string;
      maxLength?: number;
      required?: boolean;
    } = {},
  ) => (
    <Field label={label} hint={options.hint}>
      <input
        type={options.type || "text"}
        value={getPath(draft, path) ?? ""}
        min={options.min}
        max={options.max}
        maxLength={options.maxLength}
        required={options.required !== false}
        onChange={(e) =>
          set(
            path,
            options.type === "number" ? Number(e.target.value) : e.target.value,
          )
        }
      />
    </Field>
  );
  const number = (path: string, label: string, min = 0, max = 100000) =>
    field(path, label, { type: "number", min, max });
  const select = (
    path: string,
    label: string,
    options: [string, string][],
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      <select
        value={getPath(draft, path) || ""}
        onChange={(e) => set(path, e.target.value)}
      >
        {options.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
  const channel = (path: string, label: string, types?: number[]) => (
    <ChannelSelect
      label={label}
      channels={context.channels}
      value={getPath(draft, path)}
      onChange={(v) => set(path, v)}
      types={types}
    />
  );
  const roleMulti = (path: string, label: string, safe = false) => (
    <MultiSelect
      label={label}
      values={getPath(draft, path) || []}
      onChange={(v) => set(path, v)}
      items={context.roles.map((role) => ({
        id: role.id,
        name: `@${role.name}`,
        disabled: safe && (!role.manageable || role.dangerous),
      }))}
    />
  );
  const channelMulti = (path: string, label: string) => (
    <MultiSelect
      label={label}
      values={getPath(draft, path) || []}
      onChange={(v) => set(path, v)}
      items={context.channels
        .filter((c) => [0, 2, 5, 13].includes(c.type))
        .map((c) => ({ id: c.id, name: `# ${c.name}` }))}
    />
  );
  const general = (
    <Panel
      title="O básico da sua comunidade"
      description="Cada servidor tem suas próprias preferências."
    >
      <div className="form-grid">
        {field("general.prefix", "Prefixo dos comandos", { maxLength: 10 })}
        {select("general.locale", "Idioma", [
          ["pt-BR", "Português (Brasil)"],
          ["en-US", "English (US)"],
        ])}
      </div>
      <Field
        label="Fuso horário"
        hint="Usado nas recorrências e nos períodos diários e semanais."
      >
        <input
          list="timezones"
          value={draft.general.timezone}
          required
          onChange={(e) => set("general.timezone", e.target.value)}
        />
        <datalist id="timezones">
          {Intl.supportedValuesOf("timeZone").map((zone) => (
            <option key={zone} value={zone} />
          ))}
          <option value="UTC" />
        </datalist>
      </Field>
    </Panel>
  );
  const xpChat = (
    <Panel title="XP por mensagens" description="Uma conversa de cada vez.">
      <Toggle
        label="Recompensar mensagens"
        description="Aplica o cooldown individual para evitar farm."
        value={draft.levels.chat.enabled}
        onChange={(v) => set("levels.chat.enabled", v)}
      />
      <div className="form-grid three">
        {number("levels.chat.min", "XP mínimo")}
        {number("levels.chat.max", "XP máximo")}
        {number("levels.chat.cooldownSeconds", "Cooldown (segundos)", 5, 86400)}
      </div>
    </Panel>
  );
  const welcome = (
    <Panel
      title="Uma boa primeira impressão"
      description="Variáveis: {user}, {username}, {server}, {memberCount}."
    >
      {channel("welcome.channelId", "Canal de boas-vindas")}
      {select("welcome.type", "Formato", [
        ["text", "Texto"],
        ["embed", "Embed"],
        ["card", "Card em imagem"],
      ])}
      <Field label="Mensagem de boas-vindas">
        <textarea
          value={draft.welcome.message}
          maxLength={2000}
          rows={4}
          onChange={(e) => set("welcome.message", e.target.value)}
        />
      </Field>
    </Panel>
  );
  return (
    <>
      <form onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        {section === "modules" && (
          <>
            <div className="notice">
              <Layers3 size={21} />
              <div>
                <strong>Apenas o que faz sentido para você</strong>
                <p>
                  Ative as ferramentas que sua comunidade precisa. Suas
                  configurações permanecem salvas quando um módulo é desativado.
                </p>
              </div>
            </div>
            <div className="module-grid">
              {Object.entries(moduleNames).map(([key, name]) => (
                <div
                  className={`module-card ${draft.modules[key] ? "enabled" : ""}`}
                  key={key}
                >
                  <span className="feature-icon purple">
                    {key === "levels" ? (
                      <Sparkles size={22} />
                    ) : key === "roles" ? (
                      <Layers3 size={22} />
                    ) : (
                      <Moon size={22} />
                    )}
                  </span>
                  <Toggle
                    label={name}
                    description={
                      draft.modules[key]
                        ? "Ativado neste servidor"
                        : "Desativado"
                    }
                    value={draft.modules[key]}
                    onChange={(value) => set(`modules.${key}`, value)}
                  />
                  <ModuleDetails id={key} />
                </div>
              ))}
            </div>
          </>
        )}
        {section === "general" && general}
        {section === "levels" && (
          <>
            <div className="two-columns">
              {xpChat}
              <Panel
                title="XP por voz"
                description="Valorize quem participa das conversas."
              >
                <Toggle
                  label="Recompensar participação em voz"
                  description="Exclui bots, canais AFK, membros sozinhos e ensurdecidos."
                  value={draft.levels.voice.enabled}
                  onChange={(v) => set("levels.voice.enabled", v)}
                />
                <div className="form-grid three">
                  {number("levels.voice.min", "XP mínimo")}
                  {number("levels.voice.max", "XP máximo")}
                  {number(
                    "levels.voice.intervalMinutes",
                    "Intervalo (minutos)",
                    1,
                    1440,
                  )}
                </div>
              </Panel>
            </div>
            <Panel title="Level-up e condições">
              <div className="form-grid">
                {channel("levels.levelUpChannelId", "Canal de level-up")}
                <Toggle
                  label="Exigir uma progressão"
                  description="O membro precisa de um cargo base para receber XP."
                  value={draft.levels.requireProgression}
                  onChange={(v) => set("levels.requireProgression", v)}
                />
              </div>
            </Panel>
            <Panel
              title="Curva de experiência"
              description="A quantidade total de XP necessária para chegar a cada nível."
            >
              <div className="form-grid three">
                {select("levels.curve.type", "Tipo de curva", [
                  ["progressive", "Progressiva"],
                  ["linear", "Linear"],
                  ["custom", "Customizada"],
                ])}
                {draft.levels.curve.type === "linear"
                  ? number("levels.curve.base", "XP por nível", 1, 1000000)
                  : draft.levels.curve.type === "progressive"
                    ? number(
                        "levels.curve.coefficient",
                        "Coeficiente",
                        1,
                        1000000,
                      )
                    : null}
              </div>
              {draft.levels.curve.type === "custom" && (
                <Field
                  label="XP total por nível"
                  hint="Informe o XP total do nível 1 em diante, em ordem crescente. Separe por vírgulas. Ex.: 100, 300, 600."
                >
                  <textarea
                    value={(draft.levels.curve.thresholds || []).join(", ")}
                    onChange={(e) =>
                      set(
                        "levels.curve.thresholds",
                        e.target.value.split(",").map((value) => value.trim()),
                      )
                    }
                    required
                    rows={3}
                  />
                </Field>
              )}
              <div className="curve-preview">
                {[1, 10, 25, 50, 100].map((level) => {
                  let xp = "—";
                  try {
                    const value = totalXpForLevel(level, draft.levels.curve);
                    xp =
                      value > 9223372036854775807n
                        ? "Não configurado"
                        : `${value.toLocaleString("pt-BR")} XP`;
                  } catch {}
                  return (
                    <div key={level}>
                      <span>Nível {level}</span>
                      <strong>{xp}</strong>
                    </div>
                  );
                })}
              </div>
              <div className="inline-note">
                Alterar a curva preserva o XP acumulado e recalcula os níveis. A
                mudança pede confirmação antes de salvar.
              </div>
            </Panel>
            <div className="two-columns">
              <Panel title="Canais sem XP">
                {channelMulti("levels.blockedChannelIds", "Canais bloqueados")}
              </Panel>
              <Panel title="Cargos sem XP">
                {roleMulti("levels.blockedRoleIds", "Cargos bloqueados")}
              </Panel>
            </div>
            <div className="two-columns">
              <Multipliers
                kind="channel"
                values={draft.levels.channelMultipliers}
                context={context}
                onChange={(values) => set("levels.channelMultipliers", values)}
              />
              <Multipliers
                kind="role"
                values={draft.levels.roleMultipliers}
                context={context}
                onChange={(values) => set("levels.roleMultipliers", values)}
              />
            </div>
          </>
        )}
        {section === "rewards" && (
          <Panel
            title="Cargos por nível"
            description="Recompense marcos reais da comunidade."
            action={
              <AddButton
                onClick={() => set("rewards", [...draft.rewards, newReward()])}
              >
                Nova recompensa
              </AddButton>
            }
          >
            {select("levels.rewardMode", "Como entregar as recompensas", [
              ["highest", "Manter somente o maior cargo"],
              ["stack", "Acumular cargos conquistados"],
            ])}
            <RewardRows
              rows={draft.rewards}
              onChange={(rows) => set("rewards", rows)}
              context={context}
            />
            {!draft.rewards.length && (
              <div className="inline-empty">
                Crie uma recompensa e escolha um cargo do Discord para começar.
              </div>
            )}
          </Panel>
        )}
        {section === "progressions" && (
          <>
            <div className="section-toolbar">
              <p className="muted">
                Caminhos independentes, com cargos e condições próprios.
              </p>
              <AddButton
                onClick={() =>
                  set("progressions", [
                    ...draft.progressions,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      emoji: "",
                      baseRoleId: "",
                      exclusiveGroup: "",
                      mode: "highest",
                      ranks: [],
                    },
                  ])
                }
              >
                Nova progressão
              </AddButton>
            </div>
            {draft.progressions.map((progression: Data, index: number) => {
              const change = (key: string, value: any) =>
                set(
                  "progressions",
                  draft.progressions.map((p: Data, i: number) =>
                    i === index ? { ...p, [key]: value } : p,
                  ),
                );
              return (
                <Panel
                  key={progression.id}
                  title={`${progression.emoji || "◇"} ${progression.name || "Nova progressão"}`}
                  action={
                    <button
                      type="button"
                      className="icon-button destructive"
                      aria-label="Remover progressão"
                      onClick={() =>
                        set(
                          "progressions",
                          draft.progressions.filter(
                            (_: Data, i: number) => i !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  }
                >
                  <div className="form-grid">
                    <Field label="Nome">
                      <input
                        required
                        maxLength={100}
                        value={progression.name}
                        onChange={(e) => change("name", e.target.value)}
                      />
                    </Field>
                    <Field label="Emoji">
                      <input
                        value={progression.emoji}
                        maxLength={100}
                        onChange={(e) => change("emoji", e.target.value)}
                      />
                    </Field>
                    <RoleSelect
                      roles={context.roles}
                      safe={false}
                      value={progression.baseRoleId}
                      onChange={(v) => change("baseRoleId", v)}
                      label="Cargo base"
                      required
                    />
                    <Field label="Modo">
                      <select
                        value={progression.mode}
                        onChange={(e) => change("mode", e.target.value)}
                      >
                        <option value="highest">Somente o maior rank</option>
                        <option value="stack">Acumular ranks</option>
                      </select>
                    </Field>
                    <Field label="Grupo exclusivo (opcional)">
                      <input
                        value={progression.exclusiveGroup}
                        maxLength={100}
                        onChange={(e) =>
                          change("exclusiveGroup", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <div className="subsection-heading">
                    <h3>Ranks da progressão</h3>
                    <AddButton
                      onClick={() =>
                        change("ranks", [...progression.ranks, newReward()])
                      }
                    >
                      Adicionar rank
                    </AddButton>
                  </div>
                  <RewardRows
                    rows={progression.ranks}
                    onChange={(rows) => change("ranks", rows)}
                    context={context}
                  />
                </Panel>
              );
            })}
            {!draft.progressions.length && (
              <div className="inline-empty">
                Crie sua primeira progressão. Cada caminho tem um cargo base e
                seus próprios ranks.
              </div>
            )}
          </>
        )}
        {section === "welcome" && (
          <>
            <WelcomeBuilder
              value={draft.welcome}
              context={context}
              onChange={(value) => set("welcome", value)}
            />
            <Panel
              title="Cargos de entrada"
              description="O primeiro passo de cada novo membro."
            >
              {roleMulti("welcome.autoroleIds", "Cargos automáticos", true)}
              {number(
                "welcome.delayMinutes",
                "Aguardar antes de atribuir (minutos)",
                0,
                10080,
              )}
              <div className="inline-note">
                Use 0 para atribuir imediatamente. O cargo do Kagetsu precisa
                estar acima dos cargos selecionados.
              </div>
            </Panel>
          </>
        )}
        {section === "profile" && (
          <>
            <Panel
              title="Cargos no perfil"
              description="Escolha quais cargos aparecem nos cards."
            >
              {roleMulti("profile.roleIds", "Cargos em destaque")}
            </Panel>
            <Panel
              title="Rótulos personalizados"
              action={
                <AddButton
                  onClick={() =>
                    set("profile.labels", [
                      ...draft.profile.labels,
                      { name: "", roleId: "" },
                    ])
                  }
                >
                  Adicionar rótulo
                </AddButton>
              }
            >
              {draft.profile.labels.map((label: Data, index: number) => (
                <div className="repeat-row" key={index}>
                  <Field label="Nome exibido">
                    <input
                      required
                      value={label.name}
                      maxLength={100}
                      onChange={(e) =>
                        set(
                          "profile.labels",
                          draft.profile.labels.map((v: Data, i: number) =>
                            i === index ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  <RoleSelect
                    roles={context.roles}
                    safe={false}
                    required
                    value={label.roleId}
                    onChange={(roleId) =>
                      set(
                        "profile.labels",
                        draft.profile.labels.map((v: Data, i: number) =>
                          i === index ? { ...v, roleId } : v,
                        ),
                      )
                    }
                  />
                  <button
                    className="icon-button destructive"
                    type="button"
                    aria-label="Remover rótulo"
                    onClick={() =>
                      set(
                        "profile.labels",
                        draft.profile.labels.filter(
                          (_: Data, i: number) => i !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </Panel>
            <Panel
              title="Badges por cargo"
              action={
                <AddButton
                  onClick={() =>
                    set("profile.badges", [
                      ...draft.profile.badges,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        emoji: "🏅",
                        roleId: "",
                      },
                    ])
                  }
                >
                  Adicionar badge
                </AddButton>
              }
            >
              {draft.profile.badges.map((badge: Data, index: number) => {
                const change = (key: string, value: string) =>
                  set(
                    "profile.badges",
                    draft.profile.badges.map((b: Data, i: number) =>
                      i === index ? { ...b, [key]: value } : b,
                    ),
                  );
                return (
                  <div className="option-row" key={badge.id}>
                    <div className="form-grid three">
                      <Field label="Nome">
                        <input
                          required
                          value={badge.name}
                          onChange={(e) => change("name", e.target.value)}
                          maxLength={100}
                        />
                      </Field>
                      <Field label="Emoji">
                        <input
                          value={badge.emoji || ""}
                          onChange={(e) => change("emoji", e.target.value)}
                          maxLength={100}
                        />
                      </Field>
                      <RoleSelect
                        roles={context.roles}
                        safe={false}
                        value={badge.roleId}
                        onChange={(v) => change("roleId", v)}
                      />
                    </div>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() =>
                        set(
                          "profile.badges",
                          draft.profile.badges.filter(
                            (_: Data, i: number) => i !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      Remover
                    </button>
                  </div>
                );
              })}
            </Panel>
          </>
        )}
        {section === "appearance" && (
          <div className="studio-grid">
            <div>
              <Panel
                title="Identidade dos cards"
                description="Personalize rank e perfil com a identidade da comunidade."
              >
                {field("appearance.name", "Nome exibido", { maxLength: 100 })}
                <div className="form-grid three">
                  {[
                    ["primary", "Cor principal"],
                    ["secondary", "Cor secundária"],
                    ["background", "Fundo"],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <div className="color-field">
                        <input
                          type="color"
                          value={draft.appearance[key]}
                          onChange={(e) =>
                            set(`appearance.${key}`, e.target.value)
                          }
                        />
                        <input
                          aria-label={`${label} hexadecimal`}
                          value={draft.appearance[key]}
                          pattern="#[a-fA-F0-9]{6}"
                          onChange={(e) =>
                            set(`appearance.${key}`, e.target.value)
                          }
                        />
                      </div>
                    </Field>
                  ))}
                </div>
                {select("appearance.barStyle", "Estilo da barra de progresso", [
                  ["rounded", "Arredondada"],
                  ["square", "Reta"],
                  ["segments", "Segmentada"],
                ])}
                {field("appearance.logoUrl", "Logo (URL)", {
                  type: "url",
                  required: false,
                  hint: "Imagens HTTPS do CDN do Discord ou Unsplash.",
                })}
                {field("appearance.backgroundUrl", "Imagem de fundo (URL)", {
                  type: "url",
                  required: false,
                })}
              </Panel>
            </div>
            <div>
              <div className="preview-title">
                <Sparkles size={16} />
                Preview de estilo <span className="badge">Ilustrativo</span>
              </div>
              <div
                className="rank-preview"
                style={{
                  backgroundColor: draft.appearance.background,
                  backgroundImage: safeImage(draft.appearance.backgroundUrl)
                    ? `linear-gradient(90deg,${draft.appearance.background}dd,${draft.appearance.background}99),url("${safeImage(draft.appearance.backgroundUrl)}")`
                    : undefined,
                }}
              >
                <div className="rank-preview-top">
                  <span style={{ color: draft.appearance.primary }}>
                    {draft.appearance.name}
                  </span>
                  <span>RANK CARD</span>
                </div>
                <div className="rank-preview-body">
                  <div
                    className="rank-avatar"
                    style={{ color: draft.appearance.primary }}
                  >
                    {safeImage(draft.appearance.logoUrl) ? (
                      <img
                        src={safeImage(draft.appearance.logoUrl)}
                        alt="Logo"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Moon size={34} />
                    )}
                  </div>
                  <div>
                    <span className="muted">PRÉVIA</span>
                    <h3>Membro da comunidade</h3>
                    <span style={{ color: draft.appearance.secondary }}>
                      Nível 12 · Explorador
                    </span>
                  </div>
                </div>
                <div className={`rank-bar ${draft.appearance.barStyle}`}>
                  <span
                    style={{
                      background: `linear-gradient(90deg,${draft.appearance.primary},${draft.appearance.secondary})`,
                    }}
                  />
                </div>
                <div className="rank-labels">
                  <span>Progresso de exemplo</span>
                  <strong>68%</strong>
                </div>
              </div>
              <p className="preview-note">
                Prévia visual de estilo. Os cards do bot usam os dados reais de
                cada membro.
              </p>
            </div>
          </div>
        )}
        {section === "logs" && (
          <Panel
            title="Um canal para cada registro"
            description="Deixe sem canal os eventos que não quer acompanhar."
          >
            <div className="form-grid">
              {Object.entries({
                join: "Entrada de membros",
                leave: "Saída de membros",
                messageDelete: "Mensagens apagadas",
                messageUpdate: "Mensagens editadas",
                roles: "Alterações de cargos",
                moderation: "Moderação",
                tickets: "Tickets",
                xp: "XP administrativo",
                rolePanel: "Painéis de cargos",
                configuration: "Configurações",
              }).map(([key, label]) => (
                <div key={key}>{channel(`logs.channels.${key}`, label)}</div>
              ))}
            </div>
            <div className="form-grid">
              {channel("tickets.logChannelId", "Transcripts e logs de tickets")}
              {channel(
                "suggestions.channelId",
                "Canal de sugestões (/sugerir)",
              )}
            </div>
          </Panel>
        )}
        {section === "tempVoice" && (
          <Panel
            title="Entre para criar uma sala"
            description="O bot cria a sala quando alguém entra no canal e remove quando ela fica vazia."
          >
            <div className="form-grid">
              {channel("tempVoice.triggerChannelId", "Canal de entrada", [2])}
              {channel("tempVoice.categoryId", "Categoria das salas", [4])}
            </div>
            <div className="inline-note">
              O dono pode administrar sua sala usando os comandos de voz do
              Kagetsu no Discord.
            </div>
          </Panel>
        )}
        {section === "prestige" && (
          <Panel
            title="Um novo começo"
            description="Prestígio é opcional e usa o progresso sazonal."
          >
            {number(
              "prestige.maxLevel",
              "Nível necessário para prestígio",
              1,
              1000000,
            )}
            <div className="inline-note">
              O XP global é preservado. Ative o módulo de prestígio e uma
              temporada para usar este sistema.
            </div>
          </Panel>
        )}
        {section === "moderation" && (
          <>
            <Panel
              title="Respostas automáticas a advertências"
              description="Nenhuma punição é ativada até você criar e salvar uma regra."
              action={
                <AddButton
                  onClick={() =>
                    set("moderation.warnRules", [
                      ...draft.moderation.warnRules,
                      { count: 3, action: "timeout", durationMinutes: 60 },
                    ])
                  }
                >
                  Adicionar regra
                </AddButton>
              }
            >
              {draft.moderation.warnRules.map((rule: Data, index: number) => {
                const change = (key: string, value: any) =>
                  set(
                    "moderation.warnRules",
                    draft.moderation.warnRules.map((r: Data, i: number) =>
                      i === index ? { ...r, [key]: value } : r,
                    ),
                  );
                return (
                  <div className="repeat-row" key={index}>
                    <Field label="Advertências">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={rule.count}
                        onChange={(e) =>
                          change("count", Number(e.target.value))
                        }
                      />
                    </Field>
                    <Field label="Ação">
                      <select
                        value={rule.action}
                        onChange={(e) => change("action", e.target.value)}
                      >
                        <option value="timeout">Timeout</option>
                        <option value="ban">Banir</option>
                      </select>
                    </Field>
                    {rule.action === "timeout" && (
                      <Field label="Minutos">
                        <input
                          type="number"
                          min={1}
                          max={40320}
                          value={rule.durationMinutes || 60}
                          onChange={(e) =>
                            change("durationMinutes", Number(e.target.value))
                          }
                        />
                      </Field>
                    )}
                    <button
                      className="icon-button destructive"
                      type="button"
                      aria-label="Excluir regra"
                      onClick={() =>
                        set(
                          "moderation.warnRules",
                          draft.moderation.warnRules.filter(
                            (_: Data, i: number) => i !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {!draft.moderation.warnRules.length && (
                <div className="inline-empty">
                  Nenhuma regra automática. A moderação continua disponível
                  pelos comandos do Discord.
                </div>
              )}
            </Panel>
            <Records guildId={guildId} kind="moderation" />
          </>
        )}
        {section === "automod" && (
          <>
            <Panel
              title="Regras de proteção"
              description="Configure a intensidade e a resposta de cada regra."
              action={
                <AddButton
                  onClick={() =>
                    set("automod.rules", [
                      ...draft.automod.rules,
                      {
                        id: crypto.randomUUID(),
                        type: "spam",
                        enabled: false,
                        action: "delete",
                        threshold: 5,
                        windowSeconds: 5,
                        durationMinutes: 10,
                        words: [],
                      },
                    ])
                  }
                >
                  Nova regra
                </AddButton>
              }
            >
              {draft.automod.rules.map((rule: Data, index: number) => {
                const change = (key: string, value: any) =>
                  set(
                    "automod.rules",
                    draft.automod.rules.map((r: Data, i: number) =>
                      i === index ? { ...r, [key]: value } : r,
                    ),
                  );
                return (
                  <div className="option-row" key={rule.id}>
                    <Toggle
                      label={`Regra ${index + 1}`}
                      value={rule.enabled}
                      onChange={(v) => change("enabled", v)}
                    />
                    <div className="form-grid">
                      <Field label="Detectar">
                        <select
                          value={rule.type}
                          onChange={(e) => change("type", e.target.value)}
                        >
                          <option value="spam">Spam</option>
                          <option value="flood">Flood</option>
                          <option value="invite">Convites do Discord</option>
                          <option value="mentions">Menções em massa</option>
                          <option value="words">Palavras bloqueadas</option>
                          <option value="links">Links</option>
                          <option value="caps">
                            Maiúsculas excessivas (%)
                          </option>
                          <option value="emojis">Emojis excessivos</option>
                          <option value="newAccount">Conta nova (dias)</option>
                          <option value="joinBurst">Entradas em massa</option>
                        </select>
                      </Field>
                      <Field label="Ação">
                        <select
                          value={rule.action}
                          onChange={(e) => change("action", e.target.value)}
                        >
                          <option value="delete">Apagar mensagem</option>
                          <option value="warn">Advertir</option>
                          <option value="timeout">Timeout</option>
                          <option value="kick">Expulsar</option>
                          <option value="ban">Banir</option>
                          <option value="alert">
                            Enviar alerta no canal de logs
                          </option>
                          <option value="log">Registrar no log</option>
                        </select>
                      </Field>
                      {[
                        "spam",
                        "flood",
                        "mentions",
                        "caps",
                        "emojis",
                        "newAccount",
                        "joinBurst",
                      ].includes(rule.type) && (
                        <Field label="Limite">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={rule.threshold || 5}
                            onChange={(e) =>
                              change("threshold", Number(e.target.value))
                            }
                          />
                        </Field>
                      )}
                      {["spam", "flood", "joinBurst"].includes(rule.type) && (
                        <Field label="Janela (segundos)">
                          <input
                            type="number"
                            min={1}
                            max={300}
                            value={rule.windowSeconds || 5}
                            onChange={(e) =>
                              change("windowSeconds", Number(e.target.value))
                            }
                          />
                        </Field>
                      )}
                      {rule.action === "timeout" && (
                        <Field label="Timeout (minutos)">
                          <input
                            type="number"
                            min={1}
                            max={40320}
                            value={rule.durationMinutes || 10}
                            onChange={(e) =>
                              change("durationMinutes", Number(e.target.value))
                            }
                          />
                        </Field>
                      )}
                    </div>
                    {rule.type === "words" && (
                      <Field
                        label="Palavras bloqueadas"
                        hint="Uma palavra ou expressão por linha."
                      >
                        <textarea
                          rows={4}
                          value={(rule.words || []).join("\n")}
                          onChange={(e) =>
                            change("words", e.target.value.split("\n"))
                          }
                        />
                      </Field>
                    )}
                    <EscalationEditor
                      value={rule.escalation}
                      onChange={(value) => change("escalation", value)}
                    />
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() =>
                        set(
                          "automod.rules",
                          draft.automod.rules.filter(
                            (_: Data, i: number) => i !== index,
                          ),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      Remover regra
                    </button>
                  </div>
                );
              })}
              {!draft.automod.rules.length && (
                <div className="inline-empty">
                  Adicione uma regra para começar. Nada será filtrado
                  automaticamente sem sua configuração.
                </div>
              )}
            </Panel>
            <div className="two-columns">
              <Panel title="Cargos liberados">
                {roleMulti("automod.whitelistRoleIds", "Ignorar estes cargos")}
              </Panel>
              <Panel title="Canais liberados">
                {channelMulti(
                  "automod.whitelistChannelIds",
                  "Ignorar estes canais",
                )}
              </Panel>
            </div>
          </>
        )}
        {section === "setup" && (
          <div className="setup-layout">
            <div className="setup-steps">
              {[
                "Seu servidor",
                "Experiência",
                "Level-up",
                "Boas-vindas",
                "Cargos",
              ].map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={
                    step === index ? "active" : step > index ? "done" : ""
                  }
                  onClick={() => setStep(index)}
                >
                  <span>{step > index ? <Check size={15} /> : index + 1}</span>
                  {label}
                </button>
              ))}
            </div>
            <div>
              {step === 0 && general}
              {step === 1 && (
                <>
                  <Panel>
                    <Toggle
                      label="Ativar XP & Níveis"
                      value={draft.modules.levels}
                      onChange={(v) => set("modules.levels", v)}
                    />
                  </Panel>
                  {xpChat}
                </>
              )}
              {step === 2 && (
                <Panel
                  title="Celebre cada nível"
                  description="Escolha onde o Kagetsu vai anunciar as conquistas."
                >
                  {channel("levels.levelUpChannelId", "Canal de level-up")}
                </Panel>
              )}
              {step === 3 && (
                <>
                  <Panel>
                    <Toggle
                      label="Ativar boas-vindas"
                      value={draft.modules.welcome}
                      onChange={(v) => set("modules.welcome", v)}
                    />
                  </Panel>
                  {welcome}
                </>
              )}
              {step === 4 && (
                <Panel
                  title="Tudo pronto para o próximo passo"
                  description="Salve suas preferências e crie seu primeiro painel de cargos."
                >
                  <Toggle
                    label="Ativar cargos e progressões"
                    value={draft.modules.roles}
                    onChange={(v) => set("modules.roles", v)}
                  />
                  <p className="muted">
                    No criador de painéis, escolha um template, conecte os
                    cargos reais do servidor e publique automaticamente no
                    Discord.
                  </p>
                  <Link
                    className="button secondary"
                    href={`/guilds/${guildId}/role-panels`}
                  >
                    Abrir criador de painéis <ArrowRight size={16} />
                  </Link>
                </Panel>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={step === 0}
                  onClick={() => setStep((v) => v - 1)}
                >
                  Anterior
                </button>
                {step < 4 && (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => setStep((v) => v + 1)}
                  >
                    Continuar <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="save-bar">
          <span>
            {busy
              ? "Salvando…"
              : dirty
                ? "Você tem alterações não salvas"
                : "Configurações sincronizadas"}
          </span>
          <div className="actions">
            <button
              type="button"
              className="button secondary"
              disabled={!dirty || busy}
              onClick={() => setDraft(structuredClone(context.config))}
            >
              Descartar
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!dirty || busy}
            >
              <Save size={16} />
              Salvar alterações
            </button>
          </div>
        </div>
      </form>
      {curveConfirm && (
        <Confirm
          title="Aplicar a nova curva de XP?"
          description="O XP acumulado será preservado, mas os níveis serão recalculados de acordo com a nova curva. Isso pode mudar os cargos conquistados pelos membros."
          confirm="Aplicar e salvar"
          onConfirm={() => void persist()}
          onClose={() => setCurveConfirm(false)}
        />
      )}
    </>
  );
}

function RewardRows({
  rows,
  onChange,
  context,
}: {
  rows: Data[];
  onChange: (rows: Data[]) => void;
  context: GuildContext;
}) {
  return (
    <>
      {rows.map((reward, index) => {
        const set = (key: string, value: any) =>
          onChange(
            rows.map((row, i) =>
              i === index ? { ...row, [key]: value } : row,
            ),
          );
        return (
          <div className="option-row" key={reward.id}>
            <div className="option-heading">
              <span className="option-number">
                <Trophy size={15} />
              </span>
              <strong>{reward.name || "Nova recompensa"}</strong>
              <button
                type="button"
                className="icon-button destructive"
                aria-label="Remover recompensa"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="form-grid three">
              <Field label="Nome">
                <input
                  required
                  maxLength={100}
                  value={reward.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Nível necessário">
                <input
                  type="number"
                  required
                  min={0}
                  max={1000000}
                  value={reward.level}
                  onChange={(e) => set("level", Number(e.target.value))}
                />
              </Field>
              <RoleSelect
                roles={context.roles}
                required
                value={reward.roleId}
                onChange={(v) => set("roleId", v)}
              />
              <Field label="XP total necessário">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{1,19}"
                  required
                  value={reward.xp || "0"}
                  onChange={(e) => set("xp", e.target.value)}
                />
              </Field>
              <RoleSelect
                roles={context.roles}
                safe={false}
                label="Cargo obrigatório (opcional)"
                value={reward.requiredRoleId}
                onChange={(v) => set("requiredRoleId", v)}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}

function Multipliers({
  kind,
  values,
  context,
  onChange,
}: {
  kind: "channel" | "role";
  values: Record<string, number>;
  context: GuildContext;
  onChange: (values: Record<string, number>) => void;
}) {
  const [selected, setSelected] = useState("");
  const items =
    kind === "channel"
      ? context.channels.filter((c) => [0, 2, 5, 13].includes(c.type))
      : context.roles;
  return (
    <Panel
      title={`Multiplicadores por ${kind === "channel" ? "canal" : "cargo"}`}
      description="De 0× (sem XP) a 10×."
    >
      {Object.entries(values || {}).map(([id, multiplier]) => (
        <div className="multiplier-row" key={id}>
          <span>
            {kind === "channel" ? "#" : "@"}{" "}
            {items.find((item) => item.id === id)?.name ||
              "⚠ Removido no Discord"}
          </span>
          <input
            aria-label="Multiplicador"
            type="number"
            step="0.05"
            min={0}
            max={10}
            value={multiplier}
            onChange={(e) =>
              onChange({ ...values, [id]: Number(e.target.value) })
            }
          />
          <span>×</span>
          <button
            type="button"
            className="icon-button destructive"
            aria-label="Remover multiplicador"
            onClick={() => {
              const copy = { ...values };
              delete copy[id];
              onChange(copy);
            }}
          >
            <XIcon />
          </button>
        </div>
      ))}
      <div className="repeat-row">
        <Field
          label={kind === "channel" ? "Adicionar canal" : "Adicionar cargo"}
        >
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecione…</option>
            {items
              .filter((item) => values?.[item.id] === undefined)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <button
          type="button"
          className="button secondary small"
          disabled={!selected}
          onClick={() => {
            onChange({ ...values, [selected]: 1 });
            setSelected("");
          }}
        >
          <Plus size={16} />
        </button>
      </div>
    </Panel>
  );
}
function XIcon() {
  return <Trash2 size={14} />;
}
