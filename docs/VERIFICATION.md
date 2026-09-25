# Verificação local — 25/09/2026

## Evidências concluídas

- `npm test`: 16 testes aprovados, incluindo autorização renovada por guild, CSRF, isolamento entre servidores, níveis BIGINT, cooldowns, voz, progressões e renderização de cards.
- `npm run test:database`: integração PostgreSQL aprovada em schema temporário, incluindo concorrência, rollback, preservação de XP, configurações independentes e atualização de painel no mesmo message_id com Discord simulado.
- `npm run lint`: aprovado para bot, API e pacotes.
- `npm --prefix apps/web run lint`: aprovado sem avisos após correções de estado de rascunho e dependências dos efeitos.
- `npm run build`: build de produção Next.js e TypeScript aprovados.
- `npm run preview:cards`: imagens geradas.
- Migrations reais aplicadas; quantidade de registros e soma do XP conferidas e preservadas.
- Bot iniciado com sucesso; comandos registrados. API `/health`: banco conectado e bot online.
- Página inicial carregada no navegador. Redirecionamento OAuth real chegou à tela de consentimento após cadastrar o callback no Discord.

- OAuth real concluído: sessão criada, seletor autenticado exibiu servidores administráveis e identificou o servidor com Kagetsu instalado.
- Dashboard autenticado conferido: status online, canais/cargos reais, configuração de XP e editor de painéis. Layout do editor conferido a 390 px. Nenhum painel de teste foi salvo ou publicado nessa conferência.

## Validações que dependem de interação real

- Publicações, cargos, tickets, moderação e sorteios devem ser testados em canais de teste antes de uso geral. Os testes automatizados usam Discord simulado para evitar ações externas destrutivas.
- Segundo servidor real: roteiro no README; isolamento automatizado já testado.
- Deploy Railway/Vercel: documentado, não executado.

## Serviços locais

Dashboard: http://localhost:3000
API: http://localhost:3001
Bot: processo separado; `npm run start:bot`.

Os processos locais precisam permanecer ativos. Reiniciar a máquina exige iniciá-los novamente. A implementação e as limitações funcionais estão detalhadas no README.
