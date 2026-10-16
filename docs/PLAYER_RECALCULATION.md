# Recálculo por jogador

No Scouter, abra **Recalcular por jogador**, selecione o nick e use **Recalcular métricas do jogador**.
A mesma opção aparece em **Jogadores**, nos detalhes da cartinha. Apenas donos e coaches aprovados podem executá-la.

O recálculo considera todos os replays analisados vinculados ao jogador, em qualquer modo, nos estados
aprovado ou aguardando validação. Consulta novamente os dados originais no Ballchasing, identifica a
conta por plataforma e ID e aplica a configuração atual, incluindo baselines por modo e o parâmetro
genérico quando configurado. Replays pendentes, com erro ou descartados continuam no fluxo normal de análise.

Só os replays aprovados atualizam carta, ranking e relatórios. A evolução é reconstruída em ordem de data,
com o limite de crescimento aplicado uma vez por noite. Repetir a operação com as mesmas configurações
e evidências não produz ganho adicional. Os IDs dos relatórios e o feedback do coach são preservados;
noites aprovadas sem relatório são reconstruídas a partir dos replays.

Os dados são calculados antes da gravação e publicados em uma única transação. Falhas de consulta,
mudança da conta, alteração de configuração ou mudança dos replays impedem o salvamento parcial.
O histórico original de processamento permanece intacto e o estado anterior fica registrado na auditoria.
Como o serviço consulta os replays sequencialmente, jogadores com muitos replays podem demorar mais;
falhas ou limites do provedor são apresentados para nova tentativa.

## Publicação

Aplicar `supabase/migrations/20261016140552_moonastery_player_recalculation.sql` antes de publicar a interface.
A migração adiciona a função transacional `moon_recalculate_player`, disponível somente ao papel
administrativo do servidor. Não recalcula nem altera notas existentes durante a instalação.

O servidor precisa de `BALLCHASING_API_TOKEN`, como no processamento de replays existente.

Validação: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build:render`
e `node scripts/database-verify.mjs` (usa a instalação local de PGlite em `.cache/dbverify`).
