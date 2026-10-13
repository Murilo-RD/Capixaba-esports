# Recriar o banco de dados Moonastery pelo SQL Editor

O erro `function "assert_actor" already exists` ocorre quando a segunda migration é executada outra vez sobre uma função já criada. Para recomeçar no mesmo projeto Supabase, use o arquivo único [`scripts/moonastery-recreate.sql`](../scripts/moonastery-recreate.sql). Ele remove apenas os objetos da aplicação Moonastery e reaplica as três migrations em uma transação.

## O que será apagado

Todas as tabelas `public.moon_*` e seus dados (perfis internos, notícias, relatórios, cartas, replays/jobs e configurações), funções `moon_*`, schema `moon_private`, trigger `moon_auth_user_created` e policy `moon_media_public`. As três migrations recriam as tabelas e os dados iniciais de organização, jogos e arquétipos.

Os usuários de `auth.users`, outras tabelas antigas `public.*`, buckets e arquivos do Storage, chaves de API e configurações do projeto continuam. Contas Auth antigas precisarão de um novo `moon_memberships` para entrar na plataforma. Se você precisa apagar também usuários/Auth/Storage e todos os dados antigos, crie **um projeto Supabase novo** e rode o mesmo arquivo nele. Isso muda URL e chaves e exige atualizar Render/ambiente e Auth redirects.

## Passo a passo no projeto atual

1. No Dashboard Supabase, confira o **nome e project ref** do projeto aberto. Pare gravações no site durante o procedimento.
2. Faça um backup recuperável. Use **Database > Backups** se o plano oferecer download, ou um dump lógico com Supabase CLI/`pg_dump`; salve fora do Git. Arquivos do Storage exigem cópia separada. Veja as [instruções oficiais de backup](https://supabase.com/docs/guides/platform/backups) e [backup com CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
3. Abra **SQL Editor > New query** no mesmo projeto. Copie **todo** o conteúdo de `scripts/moonastery-recreate.sql` e execute uma vez. No PowerShell, dentro da pasta do projeto, você pode copiar o arquivo inteiro com:

   ```powershell
   Get-Content -Raw -Encoding UTF8 .\scripts\moonastery-recreate.sql | Set-Clipboard
   ```

   Então cole no SQL Editor e clique em **Run**. Não execute as três migrations individuais depois disso. O arquivo inclui `BEGIN`/`COMMIT`: se encontrar uma dependência inesperada, `RESTRICT` interrompe a limpeza sem apagar objetos externos.
4. Confira a estrutura e os dados iniciais em uma **nova query**:

   ```sql
   SELECT count(*) AS moon_tables
   FROM pg_tables
   WHERE schemaname = 'public' AND tablename ~ '^moon_';

   SELECT 'games' AS item, count(*) AS total FROM public.moon_games
   UNION ALL SELECT 'archetypes', count(*) FROM public.moon_archetypes
   UNION ALL SELECT 'organization', count(*) FROM public.moon_organization
   UNION ALL SELECT 'memberships', count(*) FROM public.moon_memberships;
   ```

   Resultado esperado: **19 tabelas**, 3 jogos, 3 arquétipos, 1 organização e 0 memberships, antes de cadastrar o primeiro usuário. Se alguma contagem divergir, não rode migrations individuais; examine o erro da execução completa.
5. Em **Authentication > Users**, crie uma conta Auth para você ou entre/cadastre-se pelo site. Copie o **User UID exato** da conta. Como `auth.users` foi preservada, você também pode selecionar uma conta já existente.
6. Abra `scripts/moonastery-bootstrap-owner.sql`, substitua somente o UUID `00000000-0000-0000-0000-000000000000` da linha `selected_user uuid := ...` pelo User UID copiado. Copie todo o SQL editado para uma nova query e execute. Ele exige que o usuário Auth exista, cria/atualiza o membership `approved`/`owner` e cria o perfil interno, se faltar. A última consulta deve retornar seu usuário com `role = owner`.
7. Entre em `/team`, atualize os dados da organização e confira os módulos owner. Configure `PUBLIC_APP_URL`, URLs/redirects do Auth e SMTP antes de convites e recuperação de senha; o restante está em [`DEPLOY_RENDER.md`](../DEPLOY_RENDER.md).

## Histórico de migrations

O SQL Editor executa SQL, mas não marca automaticamente arquivos como aplicados em `supabase_migrations.schema_migrations`. Antes de qualquer futuro `supabase db push`, compare `supabase migration list --linked` e corrija o histórico somente após confirmar que as três migrations Moonastery estão completas. A [documentação de migrations do Supabase](https://supabase.com/docs/guides/deployment/database-migrations) explica `migration repair --status applied`. Este repositório também contém migrations antigas; não rode `db push` indiscriminadamente em um projeto novo, pois ele tentaria executá-las em ordem.

## Se quiser um banco totalmente novo

Crie um novo projeto no Dashboard Supabase, entre no SQL Editor desse projeto e siga os passos **3 a 7** acima. O script também funciona num projeto vazio. Atualize URL e chaves públicas/secretas no Render e no `.env` local; configure novamente Auth Site URL, Redirect URLs e SMTP. Depois de validar o novo projeto, decida separadamente o destino do antigo. Não use `supabase db reset --linked` neste repositório: ele aplica também as migrations legadas e apaga todo o banco remoto vinculado.

## Validação local do arquivo

`node scripts/build-moonastery-recreate.mjs` regenera o SQL a partir das três migrations. `node scripts/database-recreate-verify.mjs` testa em PostgreSQL isolado a instalação limpa, recriação após instalação, preservação de Auth/buckets e bootstrap do primeiro owner. Não conecta ao seu projeto hospedado.
