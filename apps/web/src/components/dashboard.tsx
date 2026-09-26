"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gift,
  Layers3,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  PanelTop,
  ScrollText,
  Settings2,
  Shield,
  Sparkles,
  Terminal,
  Trophy,
  Users,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { api, errorText, iconUrl, write } from "@/lib/api";
import { sections, type GuildContext } from "@/lib/types";
import { Brand, ErrorBox, Spinner, useSession, useRetrySeconds } from "./ui";
import { Overview, Records } from "./overview";
import { Settings } from "./settings";
import { ResourceStudio } from "./resource-studio";
import { Onboarding } from "./onboarding";
import { Diagnostics } from "./diagnostics";

const icons: Record<string, any> = {
  status: Shield,
  overview: LayoutDashboard,
  levels: Sparkles,
  rewards: Trophy,
  progressions: Layers3,
  welcome: Users,
  profile: Users,
  "role-panels": PanelTop,
  embeds: MessageSquare,
  scheduler: CalendarDays,
  commands: Terminal,
  moderation: Shield,
  automod: Shield,
  logs: ScrollText,
  tickets: MessageSquare,
  suggestions: MessageSquare,
  events: CalendarDays,
  giveaways: Gift,
  tempVoice: Volume2,
  seasons: CalendarDays,
  achievements: Trophy,
  missions: ListChecks,
  prestige: Trophy,
  modules: Layers3,
  appearance: Palette,
  general: Settings2,
  audit: BookOpen,
  setup: Wand2,
};
export function Dashboard({
  guildId,
  sectionId,
}: {
  guildId: string;
  sectionId: string;
}) {
  const session = useSession();
  const retrySeconds = useRetrySeconds();
  const [data, setData] = useState<GuildContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        setData(
          await api(`/guilds/${guildId}`, force ? { cache: "reload" } : {}),
        );
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [guildId],
  );
  useEffect(() => {
    if (session.user) void load();
    else if (!session.loading) setLoading(false);
  }, [load, session.user, session.loading]);
  useEffect(() => {
    setMobile(false);
  }, [sectionId]);
  const section = sections.find((item) => item.id === sectionId);
  const Icon = icons[sectionId] || LayoutDashboard;
  async function saveConfig(config: Record<string, any>) {
    if (!data) return;
    const result = await write(`/guilds/${guildId}/config`, "PUT", {
      config,
      version: data.version,
    });
    setData((previous) =>
      previous
        ? { ...previous, config: result.config, version: result.version }
        : previous,
    );
    session.notify(
      "Configurações salvas. O Kagetsu já está recebendo a atualização.",
    );
  }
  if (session.loading || loading)
    return (
      <div className="full-screen">
        <Brand />
        <Spinner label="Preparando seu espaço…" />
      </div>
    );
  if (!session.user)
    return (
      <div className="full-screen">
        <Brand />
        <div className="login-required">
          <h1>Vamos conectar sua comunidade?</h1>
          <p>Entre com Discord para administrar este servidor.</p>
          <a className="button primary" href="/api/auth/login">
            Entrar com Discord <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    );
  if (!data)
    return (
      <main className="public-main">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />
          Meus servidores
        </Link>
        <ErrorBox message={error} retry={load} />
      </main>
    );
  if (data.onboarding_completed_at === null)
    return (
      <Onboarding
        context={data}
        guildId={guildId}
        save={saveConfig}
        done={() =>
          setData(
            (previous) =>
              previous && {
                ...previous,
                onboarding_completed_at: new Date().toISOString(),
              },
          )
        }
      />
    );
  let group = "";
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-only icon-button"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <Link href="/" className="server-switcher">
          <span className="server-mini">
            {data.guild.icon ? (
              <img src={iconUrl(data.guild)} alt="" />
            ) : (
              data.guild.name.slice(0, 2)
            )}
          </span>
          <span>
            <small>SEU SERVIDOR</small>
            <strong>{data.guild.name}</strong>
          </span>
          <ChevronDown size={15} />
        </Link>
        <nav className="sidebar-nav" aria-label="Menu principal">
          {sections
            .filter(
              (item) =>
                !item.module || data.config.modules?.[item.module] === true,
            )
            .map((item) => {
              const heading = group !== item.group;
              group = item.group;
              const ItemIcon = icons[item.id];
              const disabled =
                item.module && !data.config.modules?.[item.module];
              return (
                <div key={item.id}>
                  {heading && item.group && (
                    <div className="nav-group">{item.group}</div>
                  )}
                  <Link
                    className={`nav-item ${sectionId === item.id ? "active" : ""} ${disabled ? "module-off" : ""}`}
                    href={`/guilds/${guildId}/${item.id}`}
                    aria-current={sectionId === item.id ? "page" : undefined}
                  >
                    <ItemIcon size={17} />
                    <span>{item.name}</span>
                    {disabled && (
                      <span className="off-dot" title="Módulo desativado" />
                    )}
                  </Link>
                </div>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-avatar">
            {(session.user.global_name || session.user.username).slice(0, 1)}
          </div>
          <div>
            <strong>{session.user.global_name || session.user.username}</strong>
            <button onClick={session.logout}>Sair da conta</button>
          </div>
          <Shield size={16} />
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="desktop-only">{data.guild.name}</span>
            <ChevronRight size={13} className="desktop-only muted" />
            <span>{section?.name || "Página não encontrada"}</span>
          </div>
          <span
            className={`status-pill ${data.status?.bot === "online" || data.status?.bot === true ? "online" : ""}`}
          >
            <span className="status-dot" />
            Kagetsu{" "}
            {data.status?.bot === "online" || data.status?.bot === true
              ? "online"
              : data.status?.bot === "offline" || data.status?.bot === false
                ? "offline"
                : "· status pendente"}
          </span>
        </header>
        <main className="dashboard-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <Icon size={13} />
                {(section?.group || "SEU DASHBOARD").toUpperCase()}
              </div>
              <h1>{section?.name || "Página não encontrada"}</h1>
              <p>
                {section?.description ||
                  "Escolha uma seção no menu para continuar."}
              </p>
            </div>
            {sectionId === "overview" && (
              <Link
                href={`/guilds/${guildId}/setup`}
                className="button secondary"
              >
                <Wand2 size={16} />
                Configuração rápida
              </Link>
            )}
          </div>
          {data.permissions?.missing?.length > 0 && (
            <div className="notice warning">
              <Shield size={20} />
              <div>
                <strong>O Kagetsu precisa de algumas permissões</strong>
                <p>
                  {data.permissions.missing.join(", ")}. Ajuste as permissões e
                  a posição do cargo do bot no Discord.
                </p>
                {data.guild.inviteUrl && (
                  <a href={data.guild.inviteUrl}>
                    Revisar permissões <ArrowUpRight size={13} />
                  </a>
                )}
              </div>
            </div>
          )}
          {section?.module && !data.config.modules?.[section.module] && (
            <div className="notice">
              <Moon size={20} />
              <div>
                <strong>Este módulo está desativado</strong>
                <p>
                  Seus dados continuam salvos. Ative o módulo em Gerenciar
                  módulos para acessar esta página.
                </p>
                <Link href={`/guilds/${guildId}/modules`}>
                  Gerenciar módulos <ChevronRight size={13} />
                </Link>
              </div>
            </div>
          )}
          {data.metadataStatus && data.metadataStatus !== "fresh" && (
            <div className="notice" role="status">
              <div>
                <strong>Dados do Discord temporariamente desatualizados</strong>
                <p>Configurações e recursos salvos continuam disponíveis.</p>
                {retrySeconds > 0 ? (
                  <p>Atualize em {retrySeconds} segundos.</p>
                ) : (
                  <button
                    className="button secondary small"
                    onClick={() => void load(true)}
                  >
                    Atualizar dados do Discord
                  </button>
                )}
              </div>
            </div>
          )}
          {section?.module &&
          !data.config.modules?.[section.module] ? null : sectionId ===
            "overview" ? (
            <Overview guildId={guildId} data={data} />
          ) : sectionId === "status" ? (
            <Diagnostics guildId={guildId} />
          ) : sectionId === "audit" ? (
            <Records guildId={guildId} kind="audit" />
          ) : section?.kind ? (
            <ResourceStudio
              key={sectionId}
              guildId={guildId}
              context={data}
              kind={section.kind}
            />
          ) : section ? (
            <Settings
              key={`${sectionId}:${data.version}`}
              section={sectionId}
              context={data}
              save={saveConfig}
              guildId={guildId}
            />
          ) : (
            <Link
              href={`/guilds/${guildId}/overview`}
              className="button primary"
            >
              Ir para visão geral
            </Link>
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            <Moon size={13} /> Kagetsu Dashboard
          </span>
          <nav className="legal-links" aria-label="Documentos legais">
            <Link href="/termos-de-servico">Termos de Serviço</Link>
            <Link href="/politica-de-privacidade">Política de Privacidade</Link>
          </nav>
          <span>Um espaço para sua comunidade crescer.</span>
        </footer>
      </div>
    </div>
  );
}
