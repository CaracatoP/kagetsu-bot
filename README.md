# Kagetsu — plataforma Discord multi-servidor

Bot Discord, API segura e dashboard Next.js. Configurações são persistidas por `guild_id`; o mesmo Kagetsu pode atender comunidades completamente diferentes. A tabela `user_levels` e o XP anterior foram preservados. Os nomes e IDs do servidor original foram importados uma única vez para sua configuração, somente após conferir que os cargos pertencem àquela guild.

## O que está implementado

- OAuth2 Discord, seletor de servidores administráveis e instalação do bot sem Administrator obrigatório.
- Dashboard responsivo com módulos, configuração rápida, selects de cargos/canais reais, estados de erro, carregamento e confirmações.
- XP por chat/voz, bloqueios e multiplicadores, cooldowns persistentes, curvas linear/progressiva/customizada, cargos por nível/XP/cargo obrigatório, progressões independentes e grupos exclusivos.
- Rank, perfil e leaderboard em imagem; branding por servidor, cargos selecionados, badges e conquistas. Prefixo por guild; comandos slash existentes preservados.
- Role Panel Builder: botões, selects e reações; publicação automática; mensagem armazenada; edição no mesmo message_id; snapshot publicado separado do rascunho; exclusividade por grupo.
- Boas-vindas em texto/embed/card, saída e autoroles com atraso persistente.
- Embeds com templates/botões de link, comandos personalizados e mensagens agendadas com recorrência e timezone.
- Moderação, histórico, escalonamento por warns, AutoMod básico e canais de logs por evento.
- Tickets privados, claim/close/reopen/delete e transcript HTML; sugestões com votos/status; eventos com vagas; sorteios com resultado persistido e seleção criptográfica.
- Salas temporárias e comando `/sala`; temporadas separadas do XP global; prestígio sazonal opcional; conquistas e missões básicas; analytics agregados e auditoria.

Módulos adicionais ficam desligados por padrão. Ative-os e configure as permissões necessárias no dashboard. Publicar recursos como temporadas, missões e comandos ativa a configuração; recursos de mensagem são enviados ao Discord. Editar um rascunho não muda uma mensagem publicada até clicar em atualizar/publicar.

## Arquitetura

```text
apps/
  api/                  Express: OAuth, sessões, autorização, validação e API
  web/                  Next.js + React + TypeScript + Tailwind
packages/
  database/             Pool, migrations, store e importador legado
    migrations/         001_platform, 002_community, 003_auth, 004_integrity
  shared/               Defaults, Zod, matemática, permissões, i18n e Pino
src/                    Aplicação do bot (migração incremental)
  index.js              Composição e lifecycle
  handlers.js           Adaptação dos eventos Discord
  commands/             Comandos e cards compartilhados
  services/             XP, ranks, voz, configurações, métricas e conquistas
  platform/             Jobs, painéis, moderação, tickets, automação e interação
  cards/                Renderização local com fontes de sistema
scripts/                Migration e prévias de cards
 test/                  Testes unitários, API e integração PostgreSQL
```

O bot continua separado da API e do frontend. `src/` equivale a `apps/bot` sem mover desnecessariamente os módulos existentes. A API consulta metadados do Discord e grava jobs; somente o bot executa publicações e ações comunitárias. O PostgreSQL coordena a fila, locks, auditoria e invalidação de cache por `LISTEN/NOTIFY`, com TTL de segurança de 60 segundos.

Principais arquivos: `src/index.js`, `src/handlers.js`, `src/platform/index.js`, `src/services/guildConfigService.js`, `src/services/xpService.js`, `packages/database/store.js`, `packages/shared/validation.js`, `apps/api/app.js`, `apps/api/auth.js` e `apps/web/src/components/`.

## Banco e migrations

Rode `npm run migrate`. Bot e API também executam migrations automaticamente. O runner usa transação, lock PostgreSQL e a tabela `schema_migrations`. Não há DROP de tabela nem reset de XP.

- **001_platform:** configurações, recursos, jobs, histórico, métricas, temporadas, conquistas e função de cálculo de níveis.
- **002_community:** snapshots publicados, moderação, tickets, participações, agendamentos, autoroles e salas temporárias.
- **003_auth:** sessões e estados OAuth de uso único.
- **004_integrity:** vínculos adicionais entre XP/guild e tickets/recursos.

Tabelas novas: `guilds`, `guild_settings`, `guild_resources`, `audit_logs`, `bot_jobs`, `bot_status`, `member_profiles`, `analytics_daily`, `member_season_xp`, `member_achievements`, `mission_claims`, `moderation_cases`, `tickets`, `community_members`, `community_schedules`, `autorole_jobs`, `temp_voice_channels`, `channel_lock_snapshots`, `sessions`, `oauth_states` e `schema_migrations`.

A configuração JSON validada em `guild_settings` representa módulos/canais/recompensas/progressões/boas-vindas/logs. `guild_resources` representa painéis, embeds, eventos, temporadas, comandos e outros recursos. Isso evita dezenas de tabelas de configuração sem perder isolamento. Os estados transacionais usam tabelas próprias com chaves compostas e foreign keys.

**Curvas:** o XP total nunca muda ao trocar a curva. Os níveis armazenados da guild são recalculados atomicamente; cargos convergem na próxima alteração de XP ou cargo relevante. Customizada recebe totais acumulados positivos dos níveis 1 em diante, estritamente crescentes; o último nível é o teto dessa curva. Progressiva mantém, por padrão, `50 × nível × (nível + 1)`. Recompensas por cargo respeitam a hierarquia e rejeitam permissões perigosas.

**Temporadas:** apenas temporadas publicadas contam; não podem sobrepor períodos publicados. XP obtido por atividade/missões também soma na temporada ativa. `/prestige` exige os módulos temporadas/prestígio e nível sazonal configurado; reinicia apenas XP sazonal, mantendo XP global e lifetime sazonal. Edições administrativas de XP global não concedem XP sazonal.

**Migração anterior:** as variáveis legadas permanecem apenas no importador em `packages/database/legacy*`. Elas não são usadas pelo núcleo em tempo de execução. Configurações novas são feitas pelo dashboard; não é preciso copiar IDs. A versão anterior deste repositório não continha implementação de reaction roles, portanto não havia registros legados identificados desse recurso para converter.

## Ambiente e OAuth Discord

Use `.env.example` para bot/API. Nunca envie `.env` ao Git.

| Variável | Uso |
|---|---|
| `DISCORD_TOKEN` | Bot e API, somente servidor |
| `DATABASE_URL` | PostgreSQL compartilhado entre bot e API |
| `DISCORD_CLIENT_ID` | Application ID da aplicação Discord |
| `DISCORD_CLIENT_SECRET` | Segredo OAuth, somente API |
| `SESSION_SECRET` | Chave aleatória com pelo menos 32 caracteres; igual nas réplicas da API |
| `WEB_URL` | Origem pública do dashboard, sem barra final |
| `API_PORT` / `PORT` | Porta da API; padrão local 3001 |
| `DATABASE_SSL` | `auto`, `true` ou `false` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Mantém `false` para compatibilidade anterior; prefira `true` com certificados confiáveis |
| `LOG_LEVEL` | `info`, `warn`, `error`, `debug` |
| `TRUST_PROXY_HOPS` | Quantidade real de proxies confiáveis, nunca um valor amplo arbitrário |
| `TEST_DATABASE_URL` | Opcional: conexão para integração em schema isolado |
| `API_ORIGIN` | Somente no serviço web: URL da API usada pelo rewrite `/api/*` |

No Discord Developer Portal, selecione a aplicação atual. Em OAuth2, registre exatamente:

- Local: `http://localhost:3000/api/auth/callback`
- Produção: `https://SEU-DOMINIO/api/auth/callback`

Configure `WEB_URL` para a origem correspondente. O login usa `identify guilds`, authorization code e state de uso único. A instalação usa `bot applications.commands`. São fluxos distintos; instalar o bot não cria uma sessão do dashboard.

A API armazena apenas o hash do cookie de sessão; access/refresh tokens são criptografados com AES-GCM. Cookie HttpOnly, SameSite=Lax e Secure em HTTPS. Mutations exigem Origin válido, CSRF e uma consulta nova às permissões do usuário no Discord. O browser nunca decide acesso à guild.

## Rodar localmente

Node.js >=22.12 e PostgreSQL:

```sh
npm ci
npm --prefix apps/web ci
npm run migrate
```

Em terminais separados:

```sh
npm run start:bot
npm run start:api
npm run dev:web
```

Abra `http://localhost:3000`. O frontend encaminha `/api/*` para `http://localhost:3001`. Para produção local: `npm run build` e `npm run start:web`. `npm start` continua iniciando o bot.

Verificação:

```sh
npm run lint
npm test
npm run test:database
npm --prefix apps/web run lint
npm run build
npm run preview:cards
```

A integração cria um schema UUID temporário e o remove ao terminar, sem alterar tabelas da aplicação. Requer `CREATE SCHEMA`; prefira banco próprio no CI. O teste cobre concorrência, rollback, migração, autorização, duas guilds independentes, mudança de curva preservando XP e atualização de painel no mesmo message_id com Discord simulado.

## Deploy

### PostgreSQL / Railway

Use um banco persistente; habilite backups. Compartilhe a conexão com bot e API. O usuário do banco precisa executar migrations (`CREATE TABLE`, `ALTER`, índices e função). Execute uma migration de release antes de escalar os serviços. Não mantenha o bot antigo escrevendo ao mesmo tempo que esta versão.

### Bot / Railway

Raiz do repositório. Build `npm ci`; start `npm run start:bot`. Configure `DISCORD_TOKEN`, `DATABASE_URL` e TLS/logging. Na primeira execução após upgrade, preserve as variáveis legadas necessárias para importar a configuração antiga; depois a configuração está no banco. Não escale várias conexões idênticas ao gateway indiscriminadamente: sharding não está habilitado ainda.

### API / Railway

Segundo serviço na mesma raiz. Build `npm ci`; start `npm run start:api`. Configure todos os segredos OAuth/sessão, banco e bot token, `WEB_URL=https://SEU-DASHBOARD`, `NODE_ENV=production`. Use a `PORT` fornecida pelo Railway, sem `API_PORT` local sobrescrevendo. Exponha HTTPS e `/health`. Configure os hops de proxy conforme a topologia efetiva. A API tem rate limits; não use `trust proxy=true` indiscriminadamente.

### Dashboard / Vercel

Importe o mesmo repositório, **Root Directory `apps/web`**, framework Next.js, install `npm ci`, build `npm run build`. Configure somente `API_ORIGIN=https://SUA-API.up.railway.app`. Tokens, senha do banco e SESSION_SECRET não pertencem à Vercel/front-end. O rewrite mantém os cookies no domínio do dashboard e evita dependência de cookies de terceiros. Após trocar o domínio, atualize `WEB_URL` na API e a URL de callback no Discord. Não use URLs de preview aleatórias como callback de produção.

Nenhum deploy remoto é realizado automaticamente por estes scripts.

## Permissões e intents

Base: ViewChannel, SendMessages, EmbedLinks, AttachFiles, ReadMessageHistory. Para cargos: ManageRoles e cargo do bot acima dos cargos atribuídos. Reações: AddReactions e ManageMessages para limpar/sincronizar reações. Tickets/salas: ManageChannels; mover/desconectar usuários exige MoveMembers; gerenciar overwrites pode exigir ManageRoles. Moderação: conceda apenas BanMembers, KickMembers, ModerateMembers, ManageMessages e ManageChannels conforme os comandos utilizados. Administrator não é obrigatório.

Intents: Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates e GuildMessageReactions. Habilite **Server Members Intent** e **Message Content Intent** no Developer Portal. Partials permitem tratar reações de mensagens anteriores ao restart.

## Checklist de um segundo servidor

1. Entrar no site com uma conta com ManageGuild/Administrator no servidor B.
2. Usar “Adicionar Kagetsu”, configurar as permissões e voltar ao seletor.
3. Abrir B, definir prefixo diferente e desativar XP; confirmar que A continua com sua configuração e XP.
4. Ativar XP em B, selecionar canal real e criar recompensa com cargo seguro abaixo do bot.
5. Criar painel de cargos em B, publicar e testar escolhas/exclusividade. Editar o título e atualizar: a mensagem deve continuar com o mesmo ID.
6. Tentar acessar recursos de A pela URL de B: a API deve negar/não encontrar.
7. Remover ManageGuild da conta e tentar salvar: a API deve negar imediatamente.
8. Testar chat/voz, cooldowns, restart, mensagens sem XP e multiplicadores em cada servidor.
9. Habilitar um módulo de cada vez; testar logs, ticket privado/transcript, sugestão/votos, evento e sorteio em canais de teste.
10. Remover um cargo/canal selecionado: o dashboard deve avisar e permitir substituição.

## Limites operacionais e extensões

- Sharding e Redis estão preparados pela separação dos processos/contratos, mas não ativados.
- Leaderboards diário/semanal/mensal e slash customizados ficam para extensão; atuais: global e temporada, custom commands prefixados.
- Condições de rank: nível, XP e cargo. Novas condições podem ser adicionadas ao avaliador compartilhado.
- i18n já tem locale por guild e catálogo pt-BR/en-US para mensagens/labels comuns; textos detalhados de módulos e dashboard ainda predominam em português.
- Imagens: URLs HTTPS allowlisted (CDN Discord ou Unsplash); uploads próprios/storage não implementados. Fontes opcionais de emoji dependem do host.
- Analytics são buffers agregados a cada minuto; um encerramento abrupto pode perder o último minuto de contadores analíticos, nunca o XP confirmado. Tempo de voz conta intervalos elegíveis completos.
- Transcript limita-se às últimas 10.000 mensagens e registra a limitação no arquivo. Não baixe anexos privados automaticamente. Defina retenção/backup de transcripts e auditoria conforme o servidor.
- Discord e PostgreSQL não formam uma transação distribuída. Nonces e IDs persistidos reduzem duplicação; jobs interrompidos em execução são marcados como falha após 10 minutos, sem reenvio automático ambíguo. Confira o Discord antes de repetir uma publicação interrompida. Agendamentos recorrentes usam horário local e retomam sem enviar todo o backlog.
- Cargos que se tornam perigosos ou sobem acima do bot deixam de ser atribuídos. Corrija permissões/hierarquia e repita a ação. O XP confirmado não é revertido por falhas de cargo.
- Mudanças de recompensas/curvas não disparam fetch de todos os membros: a sincronização ocorre na próxima atividade ou em `xp set` com o mesmo total.
- A verificação automatizada não substitui testes no Discord real de ações destrutivas, hierarquia, tickets e consentimento OAuth com uma conta administradora.

Referências oficiais: [OAuth Discord](https://discord.com/developers/docs/topics/oauth2), [comandos e permissões](https://docs.discord.com/developers/docs/interactions/slash-commands) e [Next.js](https://nextjs.org/docs/app/getting-started/installation).

## Correção de rate limit do dashboard

Veja [diagnóstico, cache, Retry-After, contagens e testes](docs/RATE_LIMIT_FIX.md). A migration `005_delivery_checkpoint` preserva recursos/XP e adiciona checkpoints de publicação. Reinicie bot, API e web após atualizar. Leituras de permissões usam cache curto; mutações continuam verificando permissões atuais no Discord. Metadados têm TTL de 60 segundos e fallback temporário; a listagem de recursos permanece no PostgreSQL.
