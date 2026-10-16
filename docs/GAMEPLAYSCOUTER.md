# GameplayScouter Moonastery

## Entrada e responsabilidades

O domínio (`config.ts`, `parser.ts`, `scoring.ts`) independe da interface e do banco. `ballchasing.server.ts` contém o provider substituível e `pipeline.server.ts` persiste os resultados usando um cliente Supabase administrativo, somente no servidor. Os helpers conferem novamente membership aprovada e papel owner/coach. Os handlers do backend também validam a identidade com Supabase Auth antes de fornecer o ator.

`ingestReplay(db, actorId, {bytes, filename})` valida extensão `.replay`, nome, tamanho de 16 bytes a 20 MB e o comprimento inicial do cabeçalho binário. Essa validação é preliminar; o provider valida a estrutura completa. O original vai para o bucket privado `moon-replays`, em `actorId/uuid.replay`. SHA256 é calculado no servidor. Duplicatas reutilizam o job existente, inclusive quando descartado: reenviar um arquivo não desfaz uma decisão do coach. O upload não depende do token externo e pode permanecer pendente até sua configuração.

`processReplayJob(db, jobId, actorId)` reserva o job por compare-and-swap de status e tentativa. O pipeline baixa o original privado, envia ao provider, extrai métricas, cruza identidades e publica o resultado com a RPC transacional `moon_complete_processing`. Essa RPC confere a tentativa reservada, guarda uma revisão imutável em `moon_processing_history` e substitui somente a projeção atual de revisão. Jobs prontos ficam `awaiting_review`; não alimentam cartas antes da aprovação.

Configure `BALLCHASING_API_TOKEN` exclusivamente no servidor. A integração usa upload multipart privado e consulta de replay detalhado. Duplicidade 409 reaproveita a identificação existente; respostas pending/202 e 429 mantêm o job pendente com prazo de nova tentativa. Cada chamada tem timeout de 12 segundos, uma repetição para falhas de rede/5xx e espera curta. Não há loop infinito no request nem publicação de resultados fictícios. Limites dependem do plano contratado; a aplicação respeita Retry-After e impede reprocessar antes dele. Referência consultada em 13/10/2026: [documentação oficial Ballchasing](https://ballchasing.com/doc/api).

Não há worker permanente implicitamente iniciado: o painel dispara o processamento e permite retomá-lo/reprocessá-lo. Para automação contínua, um scheduler autenticado no servidor deve invocar os mesmos helpers; não exponha um endpoint público com chave publicável como segredo. O backend controla retomada de reservas antigas após falha do processo e impede que uma tentativa antiga publique sobre outra.

## Identidade, data e dados disponíveis

Participantes são ligados a jogadores exclusivamente por plataforma e id externo exatos. Nick é apresentação e nunca fallback de identidade. Identidades duplicadas no replay são rejeitadas; cadastros ambíguos ficam sem vínculo. Oponentes não vinculados continuam identificáveis no snapshot de revisão.

O replay precisa fornecer uma data ISO com fuso explícito (`Z` ou offset); datas sem offset são recusadas. Se Ballchasing indicar que o arquivo original não tinha timezone, mas devolver a data normalizada com `Z`, o parser usa esse offset UTC explícito. `session_date` é o dia civil de `America/Sao_Paulo`, usando a data da partida, não a data do upload. A passagem à noite seguinte ocorre às 00h locais; treinos que atravessam a meia-noite pertencem a duas noites. Uma outra janela operacional precisa ser definida e versionada antes de alterar essa política.

São extraídos os contadores e agregados disponíveis de gols, chutes, assistências, saves, velocidade, supersônica, powerslide, distância dos parceiros, posição relativa à bola, boost, pads e demos. Campos ausentes são `null`, enquanto zero confirmado pelo provider permanece zero. Contadores por minuto usam a duração do participante limitada à duração jogada. Conversão é `100 × gols/chutes` apenas quando chutes > 0 e gols ≤ chutes.

`goals_against_while_last_defender`, quando presente, registra gols sofridos enquanto último defensor: **não prova um erro individual**. Os seguintes conceitos não estão disponíveis de forma individual confiável nesta integração e ficam explicitamente `null`: posse individual, assistências por posse, xG, erros do último homem e eficiência de rotação. Distância dos parceiros e posição relativa à bola são proxies contextuais, não uma medição direta de leitura tática. Maior/menor distância não é automaticamente melhor. Alertas são desvios observados da baseline, com métrica, valor e z-score; não afirmam double commits, culpa ou rotação incorreta sem evidência.

## Configuração e baseline real

### Referência por ID de jogador (fluxo recomendado no painel)

Em **Configurações → Baseline por jogador**, escolha um integrante pelo nick e pelo ID Steam/Epic/PSN exibido na lista, defina o mínimo de partidas por modo (5 por padrão, mínimo 2) e clique em **Usar este jogador em todos os modos**. O perfil precisa ter plataforma e ID cadastrados. A configuração é exclusiva de owners; coaches continuam podendo processar e revisar replays.

O servidor calcula automaticamente médias e desvios amostrais das métricas brutas dos replays processados desse jogador. A seleção vale para todos os modos: ranqueado, casual, extras, torneios e privado. Cada playlist tem sua distribuição; modos genéricos como partidas privadas e torneios também separam o tamanho das equipes. Modos novos retornados pelo provedor são aceitos sem reaproveitar a distribuição de outro modo. A tabela do painel mostra as amostras disponíveis e as modalidades que ainda aguardam partidas.

`reference_player` guarda a identidade selecionada e o mínimo de amostras; `baselines` contém as referências por modo, com `cohort: "PLAYER"`, fonte e IDs das partidas. Cada nova análise atualiza a referência usando até 199 partidas recentes elegíveis, além do replay atual quando o jogador participa. A última tentativa de cada partida prevalece, e jobs descartados/em processamento não participam. Uma baseline individual não certifica rank SSL. Ao desativar esse fluxo, a baseline manual anterior pode voltar a ser usada.

Snapshots novos preservam o tempo de participação e o formato. Para snapshots antigos, o servidor tenta recuperar os dados originais no Ballchasing, com cache de 10 minutos e até 20 consultas novas por requisição. Sem tempo de participação confirmado, a amostra é excluída e o painel informa a limitação. Partidas curtas, valores ausentes, amostras abaixo do mínimo e métricas sem variação não recebem números inventados. Assim, uma modalidade pode ter referência parcial e continuar sem determinados atributos ou overall.

Em 1v1, a referência por jogador remove assistências da composição e usa distância da bola no lugar de distância dos parceiros. As regras remanescentes mantêm pesos somando 1. Os snapshots antigos não são alterados; notas novas ainda exigem aprovação para chegar às cartas.

### Baseline SSL manual e compatibilidade

`scoringConfigSchema` é a validação compartilhada com `scoring.save`; o singleton `moon_scoring.config` contém o objeto completo. `DEFAULT_SCORING_SETTINGS` é uma proposta de política, com `baseline: null`, e não contém médias/desvios SSL inventados. O owner pode ajustar as regras via configuração, enquanto o coach não atribui notas manuais.

Para habilitar notas, forneça uma baseline real com:

- `version` e `source`: versão e origem rastreável do conjunto de referência.
- `cohort: "SSL"` e `playlist`: a mesma modalidade do replay avaliado.
- `min_samples`: mínimo de observações por métrica, padrão proposto 30.
- `metrics`: para cada identificador utilizado, média `mean`, desvio amostral positivo `stddev` e quantidade `samples`, todos derivados do conjunto real de referência.

O template não define `min_samples` porque não instala uma baseline vazia; o owner precisa informá-lo junto com os dados. Um conjunto adequado deve evitar misturar formatos, mudanças de provider, temporadas e distribuições incompatíveis. Desvio zero, proveniência vazia e pesos inválidos são rejeitados. Amostras abaixo do mínimo tornam aquela métrica indisponível. A aplicação valida a estrutura e rastreia a origem declarada; confirmar a qualidade e a classificação SSL da amostra é responsabilidade operacional da organização. Não existe inferência de rank SSL a partir de nick.

## Fórmulas propostas e versionadas

Para a métrica `x`, média SSL `μ` e desvio `σ > 0`, calcula-se `z = (x − μ)/σ`. A regra `higher` mantém z; `lower` usa −z; `target` usa −|z|, valorizando a proximidade ao padrão SSL em métricas sem direção monotônica justificada. Cada z é limitado ao intervalo [−3, +3] por padrão. Isso reduz o efeito de outliers.

Para cada atributo, `coverage = Σ pesos das métricas disponíveis e com baseline válida`. A cobertura mínima proposta é 0,75, com duração mínima da partida e do jogador de 120 segundos. Com menos evidência, o atributo é `null`; não há substituição por zero. Cobertura é uma proporção de evidência disponível, **não** probabilidade estatística nem intervalo de confiança.

Quando suficiente, `Zatributo = Σ(peso × z limitado)/coverage`. A transformação proposta é `score = clamp((70 + 10 × Zatributo) × multiplicador_adversário, 0, 99)`, arredondada a duas casas. Centro, escala, limite de z, duração, pesos e cobertura podem ser configurados e são registrados no snapshot de cada processamento. Esses parâmetros são hipóteses explícitas de produto; precisam de calibração com a baseline real antes do uso competitivo.

| Atributo | Métricas e pesos propostos                                                        | Direção                |
| -------- | --------------------------------------------------------------------------------- | ---------------------- |
| VEL      | velocidade média 0,50; % supersônica 0,30; duração média de powerslide 0,20       | higher; higher; target |
| FIN      | conversão 0,60; gols/min 0,40                                                     | higher                 |
| CRI      | assistências/min 0,50; demos/min 0,25; % metade ofensiva 0,25                     | higher                 |
| DEF      | saves/min 0,50; gols sofridos como último defensor/min 0,25; % atrás da bola 0,25 | higher; lower; target  |
| POS      | distância média de parceiros 0,50; % atrás da bola 0,50                           | target                 |
| BST      | boost roubado/min 0,30; pads pequenos/min 0,30; overfill/min 0,40                 | higher; higher; lower  |
| IMP      | gols/min 0,40; assistências/min 0,30; saves/min 0,30                              | higher                 |

FIN/CRI/IMP usam contadores por tempo porque a posse individual não está disponível. Não são apresentados como estimativas de xG ou ações por posse. A regra target em POS usa a média SSL como alvo: aproximação explicitamente limitada, não modelo causal de rotação.

## Força adversária

O replay não é presumido como fonte de ranks. `opponent.evidence` exige plataforma/id, força ordinal positiva, fonte externa e data de verificação. A proposta de referência é strength 22 para SSL numa escala operacional ordinal; isso não é uma média de desempenho SSL nem MMR. A organização deve manter a mesma escala para todas as evidências e pode configurar a referência.

São utilizadas evidências contemporâneas (no máximo 30 dias por padrão), anteriores ou iguais à partida. Quando todos os adversários possuem evidência, `multiplicador = clamp(média(força_adversários)/força_referência, 0,75, 1,10)` por padrão. Com qualquer rank ausente/antigo/futuro, o multiplicador é 1 e o resultado marca força desconhecida, com motivo. Rank não confirmado nunca é inventado. A origem e o multiplicador ficam na revisão imutável. Este modelo ordinal é uma proposta configurável e precisa de calibração, especialmente na proximidade entre tiers.

## Noite, evolução, aprovação e overall

O domínio oferece `consolidateNight` para média ponderada pela cobertura, uma amostra por `match_id`; no reprocessamento só a maior revisão contribui. Misturar noites é rejeitado. A aprovação transacional no backend consolida apenas jobs aprovados da mesma noite e mantém uma âncora anterior à primeira aprovação daquela noite. O cálculo e a regra efetiva da RPC devem corresponder a esse contrato; os testes SQL verificam a integração.

`novo = anterior + min(limite_noturno, smoothing × (alvo_consolidado − anterior))`, limitado a [0,99], com `smoothing=0,20` e `limite_noturno ≤ 1,00` por padrão. Reduções também são suavizadas. Reaprovar mais replays da mesma noite recalcula usando a mesma âncora: não soma +1 por replay. A inicialização de um atributo antes indisponível usa o primeiro alvo válido (não constitui aumento a partir de uma nota anterior inexistente). Métrica insuficiente não elimina um atributo anterior válido; a revisão registra a insuficiência.

A carta só muda após o coach aprovar a sessão. Relatórios anteriores e snapshots são imutáveis; aprovação, descarte e mudança de arquétipo devem gerar auditoria. O backend serializa alterações por jogador e registra âncora/sessão para impedir concorrência e inflação. Reprocessamento de resultados já aprovados exige fluxo explícito no backend e não deve reaprová-los como nova noite ou apagar sua origem.

`overall = Σ(peso_arquétipo × atributo)`, com pesos não negativos somando 1. Todo atributo com peso positivo deve estar disponível, caso contrário overall é `null`. Mudança de arquétipo muda a composição, sem reescrever métricas históricas. Ranking ordena overall desc., IMP desc., nick normalizado lexicográfico e UUID; null vem por último. MMR não participa.

## Verificação

`tests/gameplay-scouter.test.ts` contém fixtures sintéticas identificadas exclusivamente para testes, sem seed de dados publicados. A suite cobre parsing e identidade, zero versus ausente, dates/timezone, baseline e cobertura, z-score/direções, outliers, oponentes, alertas com evidência, overall/arquétipos, desempate, consolidação, duplicatas/revisões, +1/noite, smoothing de queda, validação do arquivo e respostas reais de API simuladas no limite HTTP (201/409/429/pending). Execute `node --import tsx --test tests/gameplay-scouter.test.ts`.

As chamadas externas reais dependem do token Ballchasing e de um replay autorizado. Persistência/RLS/RPCs dependem da migration aplicada ao projeto Supabase. A suite matemática local não equivale a uma certificação remota do provider, baseline ou políticas de produção. Sem essas configurações o sistema mantém estados honestos e não fabrica cartas ou rankings.
