# Deploy no Render

Este projeto esta preparado para rodar no Render como Web Service Node.

## 1. Antes de subir

1. Aplique a migration mais recente no Supabase:
   - Abra o Supabase Dashboard do projeto.
   - Va em SQL Editor.
   - Rode o arquivo `supabase/migrations/20260713172000_repair_database_policies.sql`.
2. Confirme se `.env` nao vai para o Git. Ele esta listado no `.gitignore`; use `.env.example` como modelo.
3. Rode um build local quando possivel:

```bash
NITRO_PRESET=node-server npm run build:render
```

## 2. Subir para o Git

Como este workspace estava sem um repositorio Git valido, inicialize e envie para um repositorio remoto:

```bash
git init
git add .
git commit -m "Prepare app for Render deployment"
git branch -M main
git remote add origin <URL_DO_SEU_REPOSITORIO>
git push -u origin main
```

Nao faca force push, rebase ou amend em commits ja enviados, porque o projeto tambem tem historico do Lovable.

## 3. Criar o servico no Render

Opcao recomendada: crie um Blueprint no Render usando o arquivo `render.yaml`.

Opcao manual:

- Service type: Web Service
- Runtime: Node
- Build command: `npm install --include=dev && npm run build:render`
- Start command: `npm run start`
- Health check path: `/`
- Node version: `22.16.0`

O Render injeta a variavel `PORT` automaticamente. O preset `node-server` do Nitro usa essa porta em producao.

## 4. Variaveis de ambiente no Render

Configure estas variaveis no painel do Render:

```env
NITRO_PRESET=node-server
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_JWT_SECRET=
SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
PUBLIC_APP_URL=
DISCORD_URL=
TRN_API_KEY=
EMAIL_FROM=
EMAIL_GATEWAY_URL=
EMAIL_GATEWAY_BEARER=
EMAIL_CONNECTION_API_KEY=
```

Depois do primeiro deploy, coloque em `PUBLIC_APP_URL` a URL real do Render, por exemplo `https://capixaba-es.onrender.com`, e rode um novo deploy.

Se sua chave secreta nova comecar com `sb_secret_`, coloque o mesmo valor em `SUPABASE_SECRET_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.

Nunca crie `VITE_SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SECRET_KEY` ou `VITE_SUPABASE_JWT_SECRET`. Chaves com prefixo `VITE_` ficam expostas no navegador.
