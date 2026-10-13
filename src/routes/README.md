# Rotas Moonastery

- /: institucional público com equipe, cartas, modalidades, notícias, parceiros e redes.
- /noticias/$slug: notícia publicada, com conteúdo completo.
- /contato: envio público de denúncias, sugestões e mensagens sem conta.
- /team: Supabase Auth, aprovação pending e navegação interna por papel; search module permite links para módulos. Recuperação em ?recovery=1.
- /api/moonastery: consultas públicas restritas e ações internas validadas no servidor.
- /api/scouter: upload multipart de replay exclusivo coach/owner aprovado.

As rotas antigas de candidaturas, treinos, avaliações manuais e confrontos foram removidas. routeTree.gen.ts é gerado pelo TanStack Router durante dev/build.
