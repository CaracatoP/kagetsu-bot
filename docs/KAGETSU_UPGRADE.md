# Kagetsu — relatório da melhoria ampla (26/09/2026)

## Situação da entrega

Implementação no workspace, migrations incrementais aplicadas ao banco configurado e validações locais realizadas. **Código ainda não foi implantado no Railway/Vercel.** Uma instância antiga do bot permanece ativa e consumiu o novo job `sync_commands`, respondendo “Ação não suportada”. A instância local de teste foi encerrada para não concorrer com ela. Atualizar bot e API de forma coordenada é necessário para validar os novos jobs no ambiente real.

Banco antes/depois: **3 recursos, 2 membros, soma de XP 1616**, sem alteração. O teste de onboarding marcou sua conclusão sem mudar configurações; o texto usado para testar a prévia foi descartado. O navegador continuou exibindo os **2 painéis de cargos persistidos**.

## Causas identificadas

1. **429 e falso erro:** autorizações OAuth repetidas no polling/navegação, metadados buscados em excesso, erro de refresh tratado como falha da gravação e estados de listagem que confundiam falha com vazio. O log fornecido confirma HTTP 429 em `GET /guilds/:guildId/jobs/:jobId`. Essa rota consulta autorização OAuth e PostgreSQL; não publica mensagens. Sem o log upstream histórico não é possível afirmar se esse 429 veio de `/users/@me/guilds`, renovação OAuth ou do limitador local. Agora há logs distintos para cada origem/rota.
2. **Publicação interrompida:** outro erro confirmado foi Discord 50035, `COMPONENT_INVALID_EMOJI`: a opção Demon tinha `🩸 ` com espaço no final. Normalização e validação corrigidas sem editar silenciosamente os registros existentes.
3. **Módulos:** leitura antiga em andamento podia repopular o cache após NOTIFY. O cache de recursos tinha corrida equivalente. Prestige também era bloqueado indevidamente por `levels` nos handlers. Registro de slash commands enviava todos os comandos sem filtrar módulos.
4. **Cards:** o código não incluía fontes e usava somente famílias do sistema. Isso explica a dependência do Windows e é compatível com textos ausentes no Linux. Fontes Noto Sans regular/bold e Noto Emoji foram incluídas com licenças OFL, registradas por caminho baseado em `__dirname`, uma vez por processo. Há teste real de pixels e erro explícito no startup se assets estiverem ausentes.
5. **Tickets:** criação do canal dentro de uma transação SQL longa podia deixar banco e Discord divergentes após rollback. Agora há reserva persistida e checkpoints independentes para cargo/canal, protegidos por advisory lock por guild.
6. **Transcript:** o código encontrado já enviava AttachmentBuilder, não HTML no conteúdo da mensagem. O documento foi enriquecido e testes garantem attachment + resumo. A prévia nativa de anexos exibida pelo cliente Discord não é controlada por esse conteúdo; não foi possível reproduzir o preview relatado no ambiente real nesta validação.

## Cache, rate limit e persistência

- Metadados Discord: TTL 60s, último valor válido por até 10min em falha transitória, por credencial/rota/guild; coalescing de requests simultâneos.
- Autorização de leitura: TTL 30s e stale limitado a 120s. Escritas continuam exigindo autorização atual, sem stale. Revogação 401/403/404 invalida cache.
- Frontend: GETs por 15s, isolamento por sessão, invalidação após mutations; polling de jobs fora desse cache.
- Configuração do bot: TTL 60s + LISTEN/NOTIFY, leituras antigas descartadas após invalidação. Recursos: TTL 30s + invalidação/coalescing.
- Retry-After: respeita header, `retry_after`, reset-after e limite global; nenhum retry imediato da aplicação. Job 429 é reagendado para o prazo, com tentativas limitadas. discord.js mantém sua fila REST.
- Logs: guild_id, operação, rota lógica, status, retryAfter, tentativa e cache; sem tokens.
- `guild_resources` é a fonte da listagem. Erro não vira `[]`; dados anteriores permanecem; gravação bem-sucedida é separada de avisos de metadata/refresh.
- Publicação continua no bot via bot_jobs, com message_id persistido antes de reações, edição da mensagem existente, deduplicação de jobs e snapshot publicado separado do draft. Envio com resultado ambíguo é bloqueado para reconciliação, evitando reenvio cego.

Medição controlada API → Discord, dentro do TTL, token válido e uma página de guilds:

| Fluxo | Antes | Depois |
|---|---:|---:|
| Contexto + lista, frio | 6 | 5 |
| Contexto + lista, quente | 6 | 0 |
| Salvar draft | 5 | 1 (autorização atual) |
| Solicitar publicação | 5 | 1 (autorização atual) |
| 45 polls + navegação + salvar/publicar, cenário de teste | 62 | 7 |

Em 90s reais há renovação do TTL de autorização (aproximadamente 9–10 chamadas nesse fluxo), não zero indefinidamente. Cache da API é por processo, não compartilhado entre réplicas.

## Tickets e transcript

Cargo `ticket-<UUID>` com permissões globais zero, não mencionável e abaixo do bot. Reserva no banco precede criação; nome único permite reconciliar criação cujo checkpoint falhou. Apenas opener recebe o cargo; everyone perde ViewChannel; staff configurado mantém acesso. Close nega SendMessages no cargo e no membro, inclusive se outro cargo desse membro permitir envio; reopen restaura acesso. Exclusão remove cargo do membro, cargo e canal; ticket histórico é preservado.

Reconciliação periódica (5min), incluindo após restart: restaura cargo ausente; remove cargo de canal removido manualmente; retira reservas incompletas antigas sem canal; recupera IDs por marcador UUID. Cargos que foram alterados manualmente para permissões perigosas não são apagados automaticamente. Não há varredura destrutiva por prefixo genérico. Exclusão manual da linha no PostgreSQL, fora do produto, requer revisão manual do cargo, pois remove a prova de propriedade.

Transcript HTML tem tema escuro, avatar seguro, autor/bot, horário, texto escapado, embeds, links HTTPS, anexos somente como links, dados do ticket/guild/canal/atendente. CSP bloqueia scripts. Mantido teto de 10.000 mensagens. Mensagem contém apenas resumo e arquivo `ticket-<id>.html`.

## Módulos, comandos e onboarding

IDs existentes preservados; defaults e validação usam catálogo compartilhado. Ativação salva config + agenda job na mesma transação. Debounce de 3s e reutilização do job pendente. Bot calcula o conjunto da guild, compara hash persistido e faz uma única operação batch se mudou. Sem chamadas para conjunto idêntico. Checks de prefixo/slash permanecem em runtime. /help lista apenas comandos ativos e compatíveis com permissões do usuário.

Sidebar oculta módulos inativos e URL direta mostra orientação para ativação, preservando dados. Gerenciar módulos mantém todos os módulos, descrição, dependências e permissões. Onboarding: boas-vindas, módulos, permissões, essenciais, conclusão; skip exige confirmação e mantém config; timestamp por guild impede repetição.

Comandos adicionados: `/ping`, `/uptime`, `/avatar`, `/userinfo`, `/serverinfo`, `/roleinfo`, `/channelinfo`, `/botinfo`, `/poll`, `/announce`, `/embed`, `/remind`, `/choose`, `/untimeout`, `/clearwarnings`, `/unban`, `/purge`, `/nick`, `/level`, `/module`, `/config`, `/sync`, `/status`; `/ticket close|reopen|add|remove|claim|rename`. `/level` reutiliza rank e `/purge` reutiliza exclusão em lote. Existentes preservados. Arquivar advertências mantém histórico. Ações administrativas verificam permissões atuais; moderação verifica hierarquia e permissões do bot; purge/clearwarnings têm confirmação explícita. Lembretes usam bot_jobs e bloqueiam reenvio em resultado ambíguo.

## Welcome/leave e autonomia

Editor local com prévia, texto/embed/card/combinação, título, descrição, cor, thumbnail, imagem, footer, avatar/nome, background/overlay e DM opcional. Mesmos placeholders no frontend e bot: user, username, displayName, server, memberCount, userId. Imagens limitadas ao allowlist HTTPS existente; GIF direto em embed; cards gerados são PNG. Digitação não chama Discord. Prévia de card é uma simulação de conteúdo/cores, não reprodução pixel a pixel do PNG.

AutoMod acrescenta links, caps, emojis, contas novas e entradas em massa aos detectores anteriores. Regras começam desligadas; ações delete/warn/timeout/kick/ban/alert/log e escalonamento por contagem são explícitos. Histórico fica por guild/membro/regra. Detecção de rajada de entrada é básica e sua janela em memória reinicia com o processo; não é um serviço distribuído de proteção contra ataques.

Status do Kagetsu: heartbeat/online, latência, banco/API, último sync, jobs com erro, permissões e referências inválidas. Verificação reaproveita o cache de metadata.

## Migrations e ambiente

- 005_delivery_checkpoint.sql (correção anterior de publicação).
- 006_ticket_roles.sql: cargo temporário, estado de provisionamento, canal nullable enquanto provisiona.
- 007_command_sync.sql: hash/contagem/data do sync por guild.
- 008_onboarding.sql: conclusão do onboarding.
- 009_bot_latency.sql: latência na heartbeat.

Aplicadas incrementalmente. Nenhum DROP/reset de dados de produção. **Nenhuma variável de ambiente nova obrigatória.** `DISABLE_SYSTEM_FONTS_LOAD=1` é usado somente na validação de fontes. Incluir `assets/fonts` no deploy.

Linux: `docker build -f scripts/cards.Dockerfile -t kagetsu-cards .` e `docker run --rm -v "$PWD/artifacts:/app/artifacts" kagetsu-cards`. Host atual sem Docker/WSL: Linux real ainda não executado; teste headless sem fontes do sistema e cwd alternativo passou no Windows.

## Validação

- npm run lint: passou.
- npm test: 36 testes passaram (última suíte completa; ajustes adicionais de permissão do ticket também passaram nos 3 testes relacionados).
- npm run test:database: passou; PostgreSQL em schema isolado, migrations 001–009, isolamento, checkpoints/retry, dedup de sync e onboarding.
- npm --prefix apps/web run lint: passou.
- npm run build: passou.
- npm run preview:cards: passou; rank inspecionado visualmente.
- npm run start:api: API inicializou, banco conectado.
- npm run start:bot: bot chegou a online; encerrado após detectar concorrência com instância antiga.
- Navegador: onboarding/skip, dois painéis persistidos, welcome preview ao digitar e descarte, larguras 390 e 768 sem overflow horizontal no editor.

Ainda requer implantação coordenada e validação de ponta a ponta no Discord real (sync, ticket com cargos e todos os novos comandos). Não foram publicados anúncios, aplicadas punições ou alterados módulos da guild para testes.

## Arquivos principais

API: apps/api/app.js, discord.js, discordTransport.js.
Bot: src/index.js, handlers.js; src/services/guildConfigService.js, commandSyncService.js; src/platform/index.js, common.js, discordReliability.js, roles.js, tickets.js, ticketRoles.js, moderation.js, automation.js, welcome.js, utility.js; src/commands/index.js; src/cards/shared.js, fonts.js.
Compartilhados: packages/database/store.js e migrations 005–009; packages/shared/emoji.js, modules.js, moduleInfo.js, welcome.js, validation.js.
Frontend: apps/web/src/lib/api.ts, types.ts; components/ui.tsx, dashboard.tsx, overview.tsx, resource-studio.tsx, settings.tsx, onboarding.tsx, welcome-builder.tsx, module-details.tsx, escalation-editor.tsx, diagnostics.tsx; app/page.tsx.
Assets/scripts: assets/fonts/* e licenças; scripts/cards.Dockerfile.
Testes: test/discord-rate-limit.test.js, database.integration.js, modules.test.js, cards.test.js, core.test.js, tickets.test.js, welcome.test.js, community.test.js.
Relatórios: docs/RATE_LIMIT_FIX.md, docs/KAGETSU_UPGRADE.md, docs/IMPLEMENTATION_PROGRESS.md.
