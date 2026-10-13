# Implantação Moonastery no Render

A stack existente foi preservada. Não reescreva histórico publicado no Git/Lovable. Não envie .env, backups ou segredos para Git.

## Preparação

1. Leia docs/DATABASE_RESET.md: faça inventário/backup do banco real e revise as novas migrations. A aplicação nova não importa os dados operacionais legados. A limpeza é um procedimento separado, somente após confirmação explícita.
2. Aplique as migrations Moonastery, valide RLS e compare o inventário real com o local. O código local não aplica migrations automaticamente em produção.
3. Cadastre sua conta pelo Supabase Auth e provisione o primeiro owner com o procedimento administrativo documentado pelo backend. Não existe promoção por lista de emails.
4. Configure em Supabase Auth a URL real do site e redirects para /team, /team?recovery=1 e o fluxo de convite. Habilite email e SMTP para confirmação, recuperação e convites. Auth antigo não é migrado automaticamente.
5. Execute npm ci, npm run typecheck, npm run lint, npm test e npm run build:render. O lockfile npm é o registro de instalação para Render.

## Serviço

O render.yaml descreve um Web Service Node, healthcheck /, build npm ci --include=dev && npm run build:render, start npm run start. Nitro usa PORT fornecida pela hospedagem. Node 22.16 é o mínimo configurado; a validação local também usa Node 24.

## Variáveis

- SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY): preserve credenciais existentes. A chave administrativa é exclusivamente servidor.
- VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: públicas, injetadas no build. Nunca use chave administrativa nestes campos.
- PUBLIC_APP_URL e VITE_PUBLIC_APP_URL: configure a mesma URL real quando o domínio for definido. A primeira é usada no servidor para convites e a segunda para links/callbacks/metadados do cliente. Em desenvolvimento, callbacks usam a origem atual se não configuradas.
- NITRO_PRESET=node-server: necessário para Render.
- BALLCHASING_API_TOKEN: segredo servidor para uploads privados e obtenção das métricas reais. Confira limites e plano da conta do provedor.

As variáveis antigas de JWT próprio, bootstrap por email, Tracker e gateway email não são usadas pela nova aplicação. Elas não foram apagadas do .env existente. Remova-as da hospedagem somente após conferir que nenhum outro serviço depende delas.

## Operação

Configure modalidades, perfis de jogadores, identificações Steam/Epic, arquétipos e baselines SSL reais no painel owner. Parceiros, redes e notícias ficam vazios até cadastro real. Sem token Ballchasing ou baseline válida, a interface informa falha/insuficiência; não gera notas demonstrativas. Coaches enviam e processam replays na fila, respeitando espera/retries do provedor. O build não cria um scheduler externo; para processamento contínuo sem interação, execute um worker autorizado seguindo docs/GAMEPLAYSCOUTER.md.

Antes de liberar o domínio, teste com contas de cada papel: cadastro pending, owner aprova/atribui, editor submete e owner publica, coach processa/aprova, player consulta somente seus relatórios. Execute os testes SQL em homologação e verifique Storage/redirects/SMTP. Testes locais de PostgreSQL não substituem a conferência do Supabase hospedado.
