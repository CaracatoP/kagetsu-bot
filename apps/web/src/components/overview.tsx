"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Database,
  Download,
  Layers3,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserPlus,
  Users,
  Volume2,
} from "lucide-react";
import {
  api,
  errorText,
  formatDate,
  formatNumber,
  waitJob,
  write,
} from "@/lib/api";
import { moduleNames, type Data, type GuildContext } from "@/lib/types";
import { Confirm, Empty, ErrorBox, Panel, Spinner, useSession } from "./ui";

export function Overview({
  guildId,
  data,
}: {
  guildId: string;
  data: GuildContext;
}) {
  const [days, setDays] = useState("7");
  const [analytics, setAnalytics] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState("messages");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAnalytics(await api(`/guilds/${guildId}/analytics?days=${days}`));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, days]);
  useEffect(() => {
    void load();
  }, [load]);
  const totals = analytics?.totals || {};
  const activeModules = Object.entries(data.config.modules || {}).filter(
    ([, enabled]) => enabled,
  );
  const stats = [
    {
      icon: Users,
      name: "Membros",
      value: analytics?.members,
      foot: "na sua comunidade",
      color: "purple",
    },
    {
      icon: MessageSquare,
      name: "Mensagens",
      value: totals.messages,
      foot: "conversas que conectam",
      color: "blue",
    },
    {
      icon: Sparkles,
      name: "XP conquistado",
      value: totals.xp,
      foot: "progresso compartilhado",
      color: "pink",
    },
    {
      icon: Volume2,
      name: "Horas em voz",
      value: (Number(totals.voiceSeconds || 0) / 3600).toFixed(1),
      foot: "tempo de conexão",
      color: "green",
    },
  ];
  const series: Data[] = analytics?.series || [];
  const max = Math.max(1, ...series.map((row) => Number(row[metric] || 0)));
  const total = series.reduce((sum, row) => sum + Number(row[metric] || 0), 0);
  return (
    <>
      <div className="overview-banner">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} />
            SEU PRÓXIMO CAPÍTULO
          </span>
          <h2>Uma comunidade com a sua identidade.</h2>
          <p>Pequenas configurações. Grandes conexões.</p>
          <Link
            href={`/guilds/${guildId}/role-panels`}
            className="button primary small"
          >
            Criar um painel de cargos <ArrowRight size={15} />
          </Link>
        </div>
        <div className="banner-decoration" aria-hidden="true">
          <Layers3 size={73} strokeWidth={1} />
          <span>✧</span>
        </div>
      </div>
      <div className="section-toolbar">
        <h2>O pulso da comunidade</h2>
        <div className="segmented">
          {[
            ["1", "24 horas"],
            ["7", "7 dias"],
            ["30", "30 dias"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={days === value ? "active" : ""}
              onClick={() => setDays(value)}
              disabled={loading}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox message={error} retry={load} />}
      <div className="stat-grid">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.name}>
            <div className="stat-label">
              <span>{stat.name}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={17} />
              </span>
            </div>
            <strong>
              {loading ? (
                <span className="skeleton-number" />
              ) : stat.value === undefined ? (
                "—"
              ) : stat.name === "Horas em voz" ? (
                String(stat.value).replace(".", ",")
              ) : (
                formatNumber(stat.value)
              )}
            </strong>
            <span className="stat-foot">{stat.foot}</span>
          </div>
        ))}
      </div>
      <div className="analytics-grid">
        <Panel
          title="Atividade ao longo do tempo"
          description={
            days === "1"
              ? "Agregação do dia atual · UTC"
              : `Últimos ${days} dias · agregação diária UTC`
          }
          action={
            <select
              className="compact-select"
              aria-label="Métrica do gráfico"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              <option value="messages">Mensagens</option>
              <option value="xp">XP ganho</option>
              <option value="activeMembers">Membros ativos</option>
              <option value="voiceSeconds">Segundos em voz</option>
            </select>
          }
        >
          {loading ? (
            <Spinner label="Reunindo os números…" />
          ) : series.length ? (
            <>
              <div className="chart-summary">
                <strong>{formatNumber(total)}</strong>
                <span>
                  {metric === "xp"
                    ? "XP no período"
                    : metric === "voiceSeconds"
                      ? "segundos no período"
                      : metric === "activeMembers"
                        ? "participações diárias (não únicas)"
                        : "mensagens no período"}
                </span>
              </div>
              <div
                className="bar-chart"
                role="img"
                aria-label={`${metric}: ${series.map((row) => `${row.day} ${row[metric]}`).join("; ")}`}
              >
                <div className="chart-grid">
                  <span />
                  <span />
                  <span />
                </div>
                {series.map((row, index) => (
                  <div className="chart-column" key={row.day}>
                    <div className="bar-track">
                      <div
                        className="chart-bar"
                        style={{
                          height: `${Math.max(Number(row[metric] || 0) ? 2 : 0, (Number(row[metric] || 0) / max) * 100)}%`,
                        }}
                      >
                        <span className="chart-tooltip">
                          {row.day}
                          <br />
                          {formatNumber(row[metric])}
                        </span>
                      </div>
                    </div>
                    <small>
                      {series.length <= 10 ||
                      index % Math.ceil(series.length / 7) === 0
                        ? new Date(`${row.day}T12:00:00Z`).toLocaleDateString(
                            "pt-BR",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              timeZone: "UTC",
                            },
                          )
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty
              icon={<Activity size={26} />}
              title="Cada conexão vai aparecer aqui"
              description="Quando sua comunidade começar a participar, os dados reais de atividade serão exibidos neste espaço."
            />
          )}
        </Panel>
        <Panel title="Sua comunidade" description="Movimento neste período">
          <div className="community-metric">
            <span className="metric-symbol green">
              <UserPlus size={18} />
            </span>
            <span>Novos membros</span>
            <strong>{loading ? "—" : formatNumber(totals.joins)}</strong>
          </div>
          <div className="community-metric">
            <span className="metric-symbol red">
              <ArrowDownLeft size={18} />
            </span>
            <span>Saídas</span>
            <strong>{loading ? "—" : formatNumber(totals.leaves)}</strong>
          </div>
          <div className="community-metric">
            <span className="metric-symbol purple">
              <Activity size={18} />
            </span>
            <span>Membros ativos</span>
            <strong>
              {loading ? "—" : formatNumber(totals.activeMembers)}
            </strong>
          </div>
          <div className="health-list">
            <h3>Tudo em seu lugar</h3>
            <div>
              <span>
                <Activity size={14} />
                Bot
              </span>
              <span
                className={`badge ${data.status?.bot === "online" ? "green" : ""}`}
              >
                {data.status?.bot === "online" ? "Online" : "Offline"}
              </span>
            </div>
            <div>
              <span>
                <Database size={14} />
                Banco de dados
              </span>
              <span
                className={`badge ${data.status?.database === "connected" ? "green" : ""}`}
              >
                {data.status?.database === "connected"
                  ? "Conectado"
                  : "Indisponível"}
              </span>
            </div>
            <div>
              <span>
                <ShieldCheck size={14} />
                Permissões
              </span>
              <span
                className={`badge ${!data.permissions?.missing?.length ? "green" : ""}`}
              >
                {data.permissions?.missing?.length
                  ? `${data.permissions.missing.length} pendências`
                  : "Verificadas"}
              </span>
            </div>
          </div>
        </Panel>
      </div>
      <div className="two-columns">
        <Panel
          title="Seu próximo passo"
          description="Deixe o Kagetsu com a cara do servidor."
        >
          {[
            ["levels", "Configure XP e níveis", Sparkles],
            ["welcome", "Prepare as boas-vindas", Users],
            ["role-panels", "Publique um painel de cargos", Layers3],
            ["logs", "Escolha os canais de logs", ShieldCheck],
          ].map(([path, title, Icon]: any, index) => (
            <Link
              href={`/guilds/${guildId}/${path}`}
              key={path}
              className="quick-link"
            >
              <span className="step-index">0{index + 1}</span>
              <Icon size={17} />
              <strong>{title}</strong>
              <ArrowRight size={16} />
            </Link>
          ))}
        </Panel>
        <Panel
          title="Seu Kagetsu, à sua maneira"
          description={`${activeModules.length} módulos ativos neste servidor`}
          action={
            <Link className="text-link" href={`/guilds/${guildId}/modules`}>
              Gerenciar <ArrowUpRight size={14} />
            </Link>
          }
        >
          <div className="module-chips">
            {activeModules.map(([key]) => (
              <Link href={`/guilds/${guildId}/modules`} key={key}>
                <span className="live-dot" />
                {moduleNames[key] || key}
              </Link>
            ))}
          </div>
          {!activeModules.length && (
            <p className="muted">
              Nenhum módulo ativo. Ative as ferramentas que sua comunidade
              precisa.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

export function Records({
  guildId,
  kind,
}: {
  guildId: string;
  kind: "audit" | "moderation";
}) {
  const [rows, setRows] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api(`/guilds/${guildId}/${kind}`);
      setRows(result.entries || result.cases || []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, kind]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Panel
      title={
        kind === "audit" ? "Histórico de alterações" : "Histórico de moderação"
      }
      description="Últimos 100 registros deste servidor."
      action={
        <button
          type="button"
          className="icon-button"
          aria-label="Atualizar registros"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={16} />
        </button>
      }
    >
      {error && <ErrorBox message={error} retry={load} />}
      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty
          icon={<ShieldCheck size={27} />}
          title="Tudo começa com uma boa base"
          description={
            kind === "audit"
              ? "As alterações feitas pelo dashboard serão registradas aqui, com autor, data e detalhes."
              : "Nenhum caso de moderação registrado neste servidor."
          }
        />
      ) : (
        <div className="records-list">
          {rows.map((row) => (
            <div key={row.id} className="record">
              <div className="record-main">
                <span className="feature-icon purple">
                  {kind === "audit" ? (
                    <Activity size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                </span>
                <div>
                  <strong>{row.action}</strong>
                  <p>
                    {kind === "audit"
                      ? `Autor: ${row.user_id}`
                      : `Membro: ${row.target_user} · Moderador: ${row.moderator}`}
                  </p>
                  {row.reason && <p>{row.reason}</p>}
                </div>
                <time>{formatDate(row.created_at)}</time>
                {kind === "audit" && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() =>
                      setExpanded(expanded === row.id ? null : row.id)
                    }
                  >
                    {expanded === row.id ? "Fechar" : "Detalhes"}
                  </button>
                )}
              </div>
              {expanded === row.id && (
                <div className="audit-diff">
                  <div>
                    <small>ANTES</small>
                    <pre>{JSON.stringify(row.old_value, null, 2) || "—"}</pre>
                  </div>
                  <div>
                    <small>DEPOIS</small>
                    <pre>{JSON.stringify(row.new_value, null, 2) || "—"}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function Operations({
  guildId,
  kind,
}: {
  guildId: string;
  kind: "tickets";
}) {
  const { notify } = useSession();
  const [rows, setRows] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ row: Data; action: string } | null>(
    null,
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await api(`/guilds/${guildId}/${kind}`)).tickets || []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, kind]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(row: Data, action: string) {
    setConfirm(null);
    setBusy(row.id);
    setError("");
    try {
      await waitJob(
        guildId,
        await write(`/guilds/${guildId}/tickets/${row.id}/action`, "POST", {
          action,
        }),
      );
      notify("Atendimento atualizado.");
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Panel
        title="Atendimentos"
        description="Acompanhe os tickets abertos pela comunidade."
        action={
          <button
            type="button"
            className="icon-button"
            onClick={load}
            disabled={loading || !!busy}
            aria-label="Atualizar tickets"
          >
            <RefreshCw size={16} />
          </button>
        }
      >
        {error && <ErrorBox message={error} retry={load} />}
        {loading ? (
          <Spinner />
        ) : !rows.length ? (
          <Empty
            icon={<Ticket size={28} />}
            title="Um espaço para ouvir"
            description="Os atendimentos aparecerão aqui quando alguém abrir um ticket pelo painel do Discord."
          />
        ) : (
          <div className="records-list">
            {rows.map((row) => (
              <div className="record" key={row.id}>
                <div className="record-main">
                  <span className="feature-icon purple">
                    <Ticket size={19} />
                  </span>
                  <div>
                    <strong>Atendimento de {row.owner_id}</strong>
                    <p>
                      {formatDate(row.created_at)}
                      {row.claimed_by
                        ? ` · Responsável: ${row.claimed_by}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`badge ${row.status === "open" ? "green" : ""}`}
                  >
                    {row.status === "open"
                      ? "Aberto"
                      : row.status === "closed"
                        ? "Fechado"
                        : row.status}
                  </span>
                </div>
                <div className="ticket-actions">
                  {row.channel_id && row.status !== "deleted" && (
                    <a
                      className="button secondary small"
                      href={`https://discord.com/channels/${guildId}/${row.channel_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir canal <ArrowUpRight size={14} />
                    </a>
                  )}
                  {row.status === "open" && (
                    <>
                      <button
                        className="button secondary small"
                        disabled={!!busy}
                        onClick={() => void action(row, "claim")}
                      >
                        Assumir
                      </button>
                      <button
                        className="button secondary small"
                        disabled={!!busy}
                        onClick={() => setConfirm({ row, action: "close" })}
                      >
                        Fechar
                      </button>
                    </>
                  )}
                  {row.status === "closed" && (
                    <>
                      <button
                        className="button secondary small"
                        disabled={!!busy}
                        onClick={() => void action(row, "reopen")}
                      >
                        Reabrir
                      </button>
                      <button
                        className="button danger-button small"
                        disabled={!!busy}
                        onClick={() => setConfirm({ row, action: "delete" })}
                      >
                        Excluir canal
                      </button>
                    </>
                  )}
                  {Number(row.transcript_count) > 0 && (
                    <a
                      className="button secondary small"
                      href={`/api/guilds/${guildId}/tickets/${row.id}/transcript`}
                    >
                      <Download size={14} />
                      Transcript
                    </a>
                  )}
                  {busy === row.id && (
                    <span className="muted">Aguardando o bot…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {confirm && (
        <Confirm
          title={
            confirm.action === "delete"
              ? "Excluir este canal de atendimento?"
              : "Fechar este atendimento?"
          }
          description={
            confirm.action === "delete"
              ? "O canal será removido do Discord. O histórico armazenado permanece disponível."
              : "O bot gerará o transcript e fechará o atendimento."
          }
          danger={confirm.action === "delete"}
          confirm={
            confirm.action === "delete" ? "Excluir canal" : "Fechar atendimento"
          }
          onClose={() => setConfirm(null)}
          onConfirm={() => void action(confirm.row, confirm.action)}
        />
      )}
    </>
  );
}
