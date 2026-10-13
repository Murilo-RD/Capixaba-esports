# Moonastery API

Contrato de integração: `src/lib/moonastery/types.ts` e `schemas.ts`. Dados usam snake_case. GET `/api/moonastery?resource=home` retorna `PublicHome`; GET com `resource=news&slug=...` retorna `PublicNews`. Erros JSON `{error,code}` e status HTTP adequado. Nenhuma nota é fabricada: `card`, `overall` e atributos indisponíveis são null.

POST `/api/moonastery`: `{action,payload}` com `Authorization: Bearer <Supabase Auth access_token>`. `moonRequest<T>(action,payload)` adiciona sessão automaticamente. Cadastro/login/reset via Supabase Auth nativo. Trigger cria membership pending sem role; `membership.me` retorna Membership e pode ser usada por pending. `dashboard.get` retorna DashboardData, autorizado somente approved. Leituras são filtradas por papel e paginadas em 100 registros (`offset`); jogadores internos só recebem seus reports e instruções destinadas a eles.

Schemas listam campos permitidos de todas ações. users.update aprova/recusa/suspende/atribui role sem autoalteração; users.create envia convite Auth. reports.feedback altera somente feedback qualitativo. Arquétipos possuem sete pesos somando 1. news.save cria draft; news.submit envia para análise; news.review exclusivo owner. Publicação expõe só notícias published com published_at. `media.upload` recebe base64 apenas em trânsito (5MB), grava Storage e retorna `{url,path}`.

GameplayScouter usa moon_replays, moon_jobs, moon_job_players e moon_reports. O processador grava attributes/raw_metrics/confidence/config_snapshot por jogador identificado e move job para awaiting_review; RPC moon_approve_job consolida a sessão e aplica limite +1 por atributo/noite, com locks por jogador. Replay SHA256 único, relatórios de sessão únicos e histórico append-only. RPC moon_change_archetype recalcula overall atual sem alterar métricas originais. RPCs de mutação têm EXECUTE apenas service_role e conferem approved/role do ator informado pelo servidor após auth.getUser.

Ranking: overall decrescente, IMP decrescente, nick lexicográfico, UUID; null por último. PublicPlayer nunca contém email, plataforma externa ou feedback privado.
