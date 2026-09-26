"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Layers3,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { api, errorText, iconUrl } from "@/lib/api";
import type { Guild } from "@/lib/types";
import { Brand, Empty, ErrorBox, Spinner, useSession } from "@/components/ui";

export default function Home() {
  const { user, loading, error, refresh, logout } = useSession();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [pending, setPending] = useState(false);
  const [guildError, setGuildError] = useState("");
  const [search, setSearch] = useState("");
  async function loadGuilds() {
    setPending(true);
    setGuildError("");
    try {
      const result = await api("/guilds");
      setGuilds(result.guilds || []);
    } catch (err) {
      setGuildError(errorText(err));
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (user) void loadGuilds();
  }, [user]);
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <div className="header-links">
          <span className="desktop-only">Feito para a sua comunidade</span>
          {user ? (
            <button className="button secondary small" onClick={logout}>
              <LogOut size={15} />
              Sair
            </button>
          ) : (
            <a className="button secondary small" href="/api/auth/login">
              Entrar com Discord <ArrowUpRight size={15} />
            </a>
          )}
        </div>
      </header>
      {loading ? (
        <main className="public-main">
          <Spinner label="Conectando ao Kagetsu…" />
        </main>
      ) : user ? (
        <main className="public-main">
          <div className="eyebrow">
            <span className="live-dot" /> SEU ESPAÇO DE CONTROLE
          </div>
          <div className="page-heading">
            <div>
              <h1>
                Olá, {user.global_name || user.username}
                <span className="accent">.</span>
              </h1>
              <p>Escolha uma comunidade. Deixe o resto com o Kagetsu.</p>
            </div>
            <button
              className="button secondary small"
              onClick={loadGuilds}
              disabled={pending}
            >
              <RefreshCw size={15} />
              Atualizar
            </button>
          </div>
          <div className="guild-toolbar">
            <h2>
              Meus servidores{" "}
              <span className="count">
                {guildError && !guilds.length ? "—" : guilds.length}
              </span>
            </h2>
            <input
              aria-label="Buscar servidor"
              placeholder="Buscar um servidor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {guildError && <ErrorBox message={guildError} retry={loadGuilds} />}
          {pending ? (
            <Spinner label="Buscando seus servidores no Discord…" />
          ) : (
            <div className="guild-grid">
              {guilds
                .filter((guild) =>
                  guild.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((guild) => (
                  <article className="guild-card" key={guild.id}>
                    <div className="guild-art">
                      <span className="guild-avatar">
                        {guild.icon ? (
                          <img src={iconUrl(guild)} alt="" />
                        ) : (
                          guild.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span
                        className={`badge ${guild.installed ? "green" : ""}`}
                      >
                        {guild.installed ? (
                          <>
                            <span className="live-dot" />
                            Kagetsu instalado
                          </>
                        ) : (
                          "Pronto para começar"
                        )}
                      </span>
                    </div>
                    <h3>{guild.name}</h3>
                    <p>
                      {guild.installed
                        ? "Seu próximo passo começa aqui."
                        : "Um novo espaço, infinitas possibilidades."}
                    </p>
                    {guild.installed ? (
                      <Link
                        className="button primary full"
                        href={`/guilds/${guild.id}/overview`}
                      >
                        Abrir dashboard <ArrowRight size={16} />
                      </Link>
                    ) : guild.inviteUrl ? (
                      <a
                        className="button secondary full"
                        href={guild.inviteUrl}
                      >
                        Adicionar Kagetsu <ExternalLink size={16} />
                      </a>
                    ) : (
                      <p className="muted">
                        Instalação indisponível. Verifique a configuração OAuth
                        da API.
                      </p>
                    )}
                  </article>
                ))}
            </div>
          )}
          {!pending && !guildError && !guilds.length && (
            <Empty
              icon={<Users />}
              title="Seu próximo servidor começa aqui"
              description="Os servidores em que você tem Administrador ou Gerenciar Servidor aparecem nesta tela. Verifique suas permissões no Discord e atualize."
              action={
                <button className="button secondary" onClick={loadGuilds}>
                  <RefreshCw size={16} />
                  Atualizar servidores
                </button>
              }
            />
          )}
          <p className="subtle-note">
            <ShieldCheck size={15} />
            Exibimos apenas servidores que você pode administrar.
          </p>
        </main>
      ) : (
        <main className="landing">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> UMA NOVA FASE PARA SUA COMUNIDADE
            </div>
            <h1>
              Seu servidor.
              <br />
              Seu universo.
              <br />
              <span className="gradient-text">Do seu jeito.</span>
            </h1>
            <p>
              Uma central para dar vida à sua comunidade. Cargos, níveis,
              boas-vindas e automações — com a sua identidade.
            </p>
            <a className="button primary large" href="/api/auth/login">
              Entrar com Discord <ArrowRight size={19} />
            </a>
            <span className="hero-note">
              <ShieldCheck size={15} />
              Conexão oficial e segura com o Discord
            </span>
            {error && <ErrorBox message={error} retry={refresh} />}
          </div>
          <div className="orbital" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="hero-moon">
              <Moon size={116} strokeWidth={1.2} fill="currentColor" />
            </div>
            <div className="float-card float-one">
              <span className="feature-icon purple">
                <Layers3 size={21} />
              </span>
              <div>
                <strong>Uma comunidade única</strong>
                <small>Cargos que conectam pessoas</small>
              </div>
              <Check size={17} className="accent" />
            </div>
            <div className="float-card float-two">
              <span className="feature-icon blue">
                <Sparkles size={21} />
              </span>
              <div>
                <strong>Cresça junto</strong>
                <small>Cada participação conta</small>
              </div>
            </div>
            <div className="orbital-label">KAGETSU / COMMUNITY OS</div>
            <span className="star star-one">✧</span>
            <span className="star star-two">✦</span>
            <span className="star star-three">✧</span>
          </div>
          <div className="landing-features">
            {[
              [
                Layers3,
                "Escolhas que conectam",
                "Painéis de cargos criados visualmente e publicados direto no Discord.",
              ],
              [
                Sparkles,
                "Progresso que inspira",
                "Níveis, recompensas e progressões com a cara do seu servidor.",
              ],
              [
                ShieldCheck,
                "Cuidado em cada detalhe",
                "Permissões, moderação e registros para uma comunidade bem cuidada.",
              ],
            ].map(([Icon, title, description]: any) => (
              <div key={title}>
                <Icon size={23} />
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </main>
      )}
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} Kagetsu</span>
        <nav className="legal-links" aria-label="Documentos legais">
          <Link href="/termos-de-servico">Termos de Serviço</Link>
          <Link href="/politica-de-privacidade">Política de Privacidade</Link>
        </nav>
        <span>Comunidades grandes começam com boas conexões.</span>
        <span className="footer-moon">
          <Moon size={14} /> Feito para Discord
        </span>
      </footer>
    </div>
  );
}
