# Correção de rate limit — dashboard inteiro

## Diagnóstico

A autorização de **toda** rota `/guilds/:guildId/*` chamava `GET /users/@me/guilds`, sem cache. Isso incluía cada GET de bot_jobs a cada dois segundos, listagens, analytics, auditoria e tickets. Cada consulta de metadados disparava mais quatro GETs: `/guilds/:guildId?with_counts=true`, `/guilds/:guildId/roles`, `/guilds/:guildId/channels`, `/guilds/:guildId/members/:botId`. Salvar e publicar repetiam esse conjunto.

O transporte descartava o corpo e os headers de erro do Discord, perdendo Retry-After e o endpoint no log. Portanto, logs antigos com apenas DISCORD_ERROR não identificam qual das cinco rotas foi limitada em um incidente histórico. A rota de listagem de recursos consultava apenas PostgreSQL depois da autorização: um 429 proveniente do Discord nessa listagem vinha de `/users/@me/guilds` (ou da renovação OAuth se o access token tivesse expirado), nunca de cargos/canais nem da consulta SQL. Não foi provocado um limite no Discord real para produzir evidência artificial.

O log Railway fornecido pelo usuário confirma HTTP 429 em `GET /guilds/:guildId/jobs/:jobId` (requestId `REaBWtjBQ1Wr7clspHNmDw`): a falha foi no acompanhamento da operação. Essa rota não consulta cargos/canais/guild nem publica mensagens; consulta autorização e depois o job no PostgreSQL. O log de acesso isolado não distingue Discord 429 de um limite local do Express, nem informa o endpoint upstream. A mensagem de Discord relatada no incidente é compatível com a consulta `/users/@me/guilds` (ou refresh OAuth); não há evidência de 429 de publicação nesse registro. Os novos eventos `api_rate_limit` (source=kagetsu) e `discord_http_429` permitem distinguir as origens.

O frontend inicializava recursos com `[]`, capturava a falha e depois renderizava o contador e o estado vazio. Salvar/publicar/atualizar a lista compartilhavam um bloco de erro, confundindo falha de atualização com falha da operação já concluída. O recurso salvo só era incluído na lista local no ramo de salvar sem publicar. No bot, envio e reações estavam dentro da mesma transação SQL: um erro posterior ao envio podia desfazer o message_id; o nonce ainda dependia do job novo.

## Segundo defeito confirmado: publicação rejeitada

A consulta ao banco mostrou a sequência real: uma publicação concluída e duas publicações posteriores com status failed. O log local do bot para o job 918145e6-30a0-4690-9172-2f090628abcb registrou DiscordAPIError 50035: components[0].components[1].emoji.name / COMPONENT_INVALID_EMOJI. A segunda opção do painel Caminho do Jogador (Demon) contém o emoji de sangue seguido por um espaço. Isso é uma rejeição de conteúdo pelo Discord, distinta do 429 ao acompanhar jobs.

O código normaliza espaços de emojis ao gerar botões/selects/reações e na validação de entrada. Texto ou múltiplos emojis no mesmo campo são rejeitados antecipadamente. A forma <:nome:id> é aceita; disponibilidade/permissão do emoji personalizado continua sendo decidida pelo Discord. Erros 50035 agora têm orientação específica no job. Não foi alterado o recurso existente no banco para corrigir esse dado. Também foi removida a captura genérica em roles.fetch que escondia rate limits como cargo inexistente.

## Correções

- Listagens continuam vindo de `guild_resources`. Metadados Discord não são requisito para ler a tabela. A primeira carga malsucedida mostra indisponibilidade, nunca zero. Uma lista já carregada continua visível.
- Contexto do dashboard retorna configuração persistida mesmo sem metadados disponíveis, com `metadataStatus` e `warnings`. Analytics não perde os agregados SQL se a contagem de membros do Discord falhar.
- Rascunhos passam pela validação estrutural; se os metadados estiverem temporariamente indisponíveis, são salvos com aviso. Referências continuam validadas quando disponíveis e a publicação continua passando pela validação da API/bot. Não se autoriza uma escrita a partir de permissões antigas.
- Gravação atualiza imediatamente a lista local. Publicação concluída atualiza o estado local antes da consulta de atualização. Falhas dessa consulta aparecem como aviso secundário.
- Cache TTL em memória por processo API, credencial (hash interno) e rota/guild: metadados 60 segundos, último valor válido até 10 minutos durante 429/502/503. Os quatro endpoints são independentes; um erro em cargos não invalida os canais já obtidos.
- Autorização de leitura: 30 segundos, fallback limitado a 120 segundos para falha temporária. Escritas sempre consultam o Discord novamente, sem fallback de autorização. 401/403/404 invalidam o valor. Sem autorização válida anterior, a API falha de forma explícita: não retorna uma lista vazia nem libera dados indevidamente.
- Requisições simultâneas iguais compartilham uma promessa. O frontend também compartilha leituras e usa TTL de 15 segundos, separado por sessão e guild, invalidado em escrita/conclusão de job. Jobs não são cacheados no browser.
- Retry-After numérico/data HTTP, retry_after e Reset-After são interpretados conservadoramente. O cooldown por rota/credencial ou global impede novas chamadas até o prazo. Não há retry automático no transporte da API. Ausência de prazo utiliza 30 segundos. O frontend aguarda o prazo ao consultar jobs e oculta o botão de tentar novamente durante o cooldown.
- Bot preserva discord.js REST e bot_jobs. Jobs 429 explícitos voltam para pending com available_at futuro, mesmo ID e até 5 tentativas. O SDK continua gerenciando sua fila nativa. Pedidos idênticos de uma publicação já pendente/em execução reutilizam o job.
- Publicação usa lock por guild e checkpoints persistidos: nonce por entrega e message_id salvos antes das reações. Retomadas editam a mensagem existente. Snapshot publicado só é atualizado depois de concluir a publicação, usando os dados efetivamente enviados. Erros ambíguos de envio ficam bloqueados para reconciliação manual, sem reenvio automático.
- Migration 005 adiciona apenas delivery_state e delivery_nonce. Não remove recursos, não redefine configurações e não altera XP.

## Contagem de chamadas

Contagens abaixo referem-se à **API → Discord**, com uma página de até 200 guilds e access token válido. Chamadas do SDK para efetivar a mensagem continuam separadas.

| Operação | Antes | Depois |
|---|---:|---:|
| Abrir contexto + listar recursos, cache frio | 6 | 5 |
| Mesmo fluxo com cache quente | 6 | 0 |
| Salvar rascunho com metadados quentes | 5 | 1 (autorização fresca) |
| Enfileirar publicação com metadados quentes | 5 | 1 (autorização fresca) |
| Cada consulta de status dentro do TTL de autorização | 1 | 0 |
| Atualizar lista após publicação dentro do TTL | 1 | 0 |

Teste instrumentado de abrir, listar, 45 consultas dentro do TTL, salvar e enfileirar publicação: **62 → 7** chamadas. Com as 45 consultas distribuídas por aproximadamente 90 segundos, há normalmente mais 2–3 revalidações de autorização: **9–10** chamadas no mesmo fluxo, sem outras navegações/expirações. Não é promessa de zero chamadas por tempo indefinido. No bot, os testes verificam uma única criação bem-sucedida de mensagem e edição do ID persistido na retomada.

## Observabilidade

API registra `guild_id`, `operation`, `endpoint`, `status`, `retryAfter`, `cache` (`hit`, `miss`, `refresh`, `stale`). Evento `discord_http_429` identifica uma resposta HTTP real; `discord_cache_fallback` identifica reutilização do cache. Bot registra eventos `discord_429` e `discord_rate_wait`, mais contexto de guild/job em execuções da fila. URLs OAuth com query, corpo, headers de autorização e tokens não são registrados.

## Arquivos alterados

- `apps/api/discordTransport.js` (novo), `apps/api/discord.js`, `apps/api/app.js`.
- `src/platform/discordReliability.js` (novo), `src/platform/index.js`, `src/platform/roles.js`, `src/index.js`.
- `packages/shared/emoji.js` (novo), `packages/shared/validation.js`.
- `packages/database/store.js`, `packages/database/migrations/005_delivery_checkpoint.sql` (nova).
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/types.ts`.
- `apps/web/src/components/ui.tsx`, `resource-studio.tsx`, `overview.tsx`, `apps/web/src/app/page.tsx`.
- `test/discord-rate-limit.test.js` (novo), `test/database.integration.js`.
- Este relatório e README.

## Verificações

- 24 testes unitários/API aprovados, incluindo 429 em cada endpoint de metadados, cache por guild, autorização revogada, autorização fresca de escrita, lista persistida durante 429, salvar com metadados indisponíveis, fallback sem transformar falha em [], Retry-After e contagem de chamadas, normalização de emojis e propagação de 429 na busca de cargos.
- Integração PostgreSQL aprovada em schema temporário: deduplicação de jobs, 429 antes do envio e depois do envio/nas reações, cooldown persistido, retomada sem segunda mensagem e isolamento por guild.
- Lint do bot/API e frontend, TypeScript e build de produção verificados.

## Limites de implantação

Caches/cooldowns da API são locais a cada processo e reiniciam junto dele; múltiplas réplicas não compartilham esse cache. Locks e checkpoints de publicação são PostgreSQL e compartilhados. Uma implantação com muitas réplicas deve mover o cache/cooldown do transporte para armazenamento compartilhado. Esta correção não pressupõe autorização antiga indefinida: após expirar o limite de leitura, uma falha de autorização remota aparece explicitamente.

Referência: [documentação oficial de rate limits do Discord](https://github.com/discord/discord-api-docs/blob/main/developers/topics/rate-limits.mdx).

Conferência local final: bot online, API/banco conectados e navegador autenticado exibindo os dois painéis persistidos (um rascunho e um publicado). Logs reais mostraram cache hit de autorização e dos quatro metadados na navegação/analytics. A migration 005 foi aplicada com conferência de contagem e soma de XP preservadas. Os serviços locais foram reiniciados; o deploy dos processos remotos Railway/Vercel não foi realizado nesta tarefa.
