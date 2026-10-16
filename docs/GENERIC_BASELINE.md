# Parâmetro genérico temporário

Em **Configurações → Baseline por jogador**, use **Usar parâmetro genérico em todos os modos**. O botão preserva os pesos, a escala e o jogador de referência que você já configurou. Baselines medidas de uma modalidade têm prioridade; o parâmetro genérico cobre os modos que ainda não têm dados suficientes. Você pode desativá-lo no mesmo painel.

O arquivo `gameplay-scouter-generic-all-modes.json` é uma configuração completa com os pesos padrão. Importá-lo pela configuração avançada substitui o objeto inteiro, incluindo a seleção do jogador. Prefira o botão para preservar os ajustes existentes. Uma cópia para download fica em `/config/gameplay-scouter-generic-all-modes.json`.

`cohort: "GENERIC"` e `playlist: "*"` identificam o alcance global. `samples: 0` e `min_samples: 0` indicam explicitamente que nenhum replay foi medido. Os campos `mean` e `stddev` são centros e escalas de comparação escolhidos como parâmetros de política, não médias e desvios de uma população SSL. As escalas são amplas para permitir avaliações iniciais, mas as notas são provisórias e não equivalem a uma calibração específica de cada modo.

O preset usa o centro de nota 70, 10 pontos por escala e limite de 3 escalas; a ativação pelo botão respeita a escala já salva. Em 1v1, assistências são removidas e a distância dos parceiros é substituída pela distância da bola. Métricas ausentes continuam sem dados e partidas curtas continuam excluídas. Com a referência genérica, o multiplicador por rank dos adversários é neutro. Notas ainda dependem da aprovação do coach antes de chegarem às cartas.

Quando reunir replays suficientes do jogador escolhido, cada modo passa a usar sua referência medida nas próximas análises. Replays já analisados mantêm o snapshot original até um reprocessamento permitido.
