# Plano e coordenação Moonastery

## Arquitetura acordada antes de editar a aplicação

Aplicação única TanStack Start. `/` e notícias são públicas; `/team` concentra autenticação e navegação interna. Supabase Auth identifica usuários; membership privada contém aprovação e papel. Visitantes acessam projeções públicas de jogadores e conteúdo publicado. Interface usa Query para cache/invalidação e serviço central de requisições. Backend valida Zod, status, papel e propriedade; RLS protege chamadas diretas. GameplayScouter é módulo independente da UI com provider intercambiável.

## Responsabilidade exclusiva

| Responsável | Arquivos/módulos | Dependência |
| --- | --- | --- |
| Backend | `src/lib/moonastery` contratos/auth/server/client, API Moonastery, migrations novas, testes SQL, scripts e docs de reset | Primeiro entrega tipos e ações |
| Frontend/design | homepage, notícias públicas, componentes públicos/cartas, styles.css, imagens oficiais | Consome contrato público, não altera banco |
| GameplayScouter | `src/lib/gameplay-scouter`, testes matemáticos e docs do algoritmo | Contrato backend e IDs de jogadores |
| Coordenador | `/team`, componentes internos, remoção legado, configuração e integração, package scripts, docs consolidados | Consome os três módulos |
| QA independente | Revisão, testes e relatório; correções retornam ao responsável | Rodada após integração, reutilizando slot livre |

Há quatro slots disponíveis incluindo o coordenador. Portanto até três especialistas trabalham simultaneamente; plataforma interna fica com o coordenador e QA ocorre em rodada posterior. Diretórios exclusivos evitam alterações simultâneas no mesmo arquivo. Sem reescrita de histórico git publicado e sem push automático. Mudanças locais preexistentes `.agents/` e `skills-lock.json` serão preservadas.

## Contratos de integração

- Papéis: `owner`, `editor`, `coach`, `player`; status `pending`, `approved`, `rejected`, `suspended`. Papel ausente no cadastro pendente; owner atribui após verificação.
- GET público e POST `{action,payload}` em `/api/moonastery`; token Supabase em Authorization. Erros retornam mensagem e status HTTP adequado. Tipos/ações definitivos em `docs/API_CONTRACT.md`, de responsabilidade backend.
- Sete atributos VEL/FIN/CRI/DEF/POS/BST/IMP de 0 a 99, nullable para ausência de evidência. Overall ponderado por arquétipo, também nullable quando insuficiente.
- SHA256 de replay único; identidade por provider plataforma/id; sessão/noite em America/Sao_Paulo. Estados de processamento explícitos; métricas imutáveis/versionadas. Reprocessamento substitui a revisão sem contagem adicional.
- Aprovação transacional consolida sessão e limita avanço a +1 por noite. Carta/ranking só leem histórico aprovado. Mudança de arquétipo recalcula composição, preservando métricas.
- Relatórios: números apenas do pipeline, coach escreve feedback qualitativo. Player lê apenas seus relatórios privados; cartas dos demais têm projeção autorizada.
- Editor escreve rascunho e solicita aprovação; somente owner publica. Parceiros/social/modalidades/organização são geridos por owner.

## Sequência

1. Auditoria integral e plano (estabelecidos).
2. Backend publica contratos e prepara modelo/migrations/RLS/reset seguro.
3. Após contratos, frontend e GameplayScouter implementam em paralelo; coordenador constrói plataforma interna.
4. Integração API/provider/aprovação/cartas e remoção de legado executável.
5. Typecheck, lint, testes matemáticos, segurança SQL e build; QA visual desktop/mobile e fluxos protegidos.
6. Correções, documentação de implantação e relatório com evidência e dependências externas.

## Direção visual

Preto #000000, superfície #101116, branco #F7F8FA, ciano #00B5F5, magenta #F70BA5 e texto secundário #A8AFBF. Logo horizontal oficial no header; isolada para favicon e carta. Mascote oficial como elemento memorável da hero. Tipografia esportiva condensada para títulos e sans legível para corpo, se houver fonte disponível/configurável; amplo espaço e formas contidas. Homepage com banner horizontal, jogadores, carrosséis de modalidades/notícias, faixa de parceiros e redes. Não há atletas, resultados ou notas fictícias. Ausência de dados exibe estado vazio. Mobile reorganiza navegação e grids; foco visível e reduced motion obrigatórios.

## Implantação e limites

Sem limpeza remota ou exclusão de contas Auth automática. Reset tem inventário, backup/restore e dry-run e requer confirmação explícita. Não inventar domínio. Testes remotos, aplicação da migration, SMTP, primeiro owner e token Ballchasing dependem do ambiente externo; registrar separadamente de testes locais.

## Local delivery validation (2026-10-13)

- Implemented the public site, news, role-based `/team` workspace, validated API, Supabase Auth, three new migrations, and GameplayScouter without fabricated ratings.
- TypeScript check (`tsc --noEmit`): passed.
- Node tests: 31 passed across Scouter/provider behavior and request/RBAC contracts.
- `scripts/database-verify.mjs`: 33 checks passed for migrations, RLS, roles, approvals, rating progression, history, and identity projections.
- Vite/Nitro production build: passed.
- ESLint passed for rebuilt routes, UI modules, backend, Scouter, tests, and reset script.
- Legacy reset dry run reviewed; no database connection or remote mutation was performed.
- Publishing, hosted Supabase migrations, SMTP/domain setup, first-owner provisioning, and authenticated provider testing still require external credentials/configuration. The public site loaded locally; populated data queries require Supabase configuration.
