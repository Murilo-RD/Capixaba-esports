# Aplicação da nova estrutura e reset controlado

Para recriar as tabelas e dados `moon_*` no SQL Editor após erro de migration já aplicada, siga [RECREATE_DATABASE.md](RECREATE_DATABASE.md). O procedimento abaixo trata da limpeza posterior das tabelas legadas da aplicação antiga.

Nenhuma migration, alteração de usuário ou limpeza foi executada no projeto remoto durante esta implementação. As três migrations novas criam entidades `moon_*` sem carregar dados operacionais antigos. A primeira revoga acesso Data API às onze tabelas antigas e funções de auth customizada, remove o trigger legado de cadastro e instala o cadastro nativo pending. Ela deve ser aplicada junto ao deploy que remove as APIs antigas.

## Inventário e backup antes de produção

Inventário conhecido das migrations: profiles, user_roles, weekly_reports, applications, application_messages, trainings, training_videos, rival_teams, matches, team_titles, app_auth_users. As FKs para auth.users haviam sido removidas pelo legado; a nova estrutura as restaura nas novas entidades. Revisar o banco remoto real porque mudanças manuais podem divergir do repositório.

Com acesso administrativo somente leitura, exportar os resultados de pg_tables, pg_constraint, pg_indexes, pg_policies, pg_trigger e pg_proc para as tabelas e funções public acima. Listar dependências externas usando pg_depend. Registrar versão PostgreSQL e migrations aplicadas. Confirmar que schemas auth, storage, extensions, realtime e outros gerenciados não entram na lista de exclusão. Salvar um JSON de revisão `{ "schema":"public", "reviewed":true, "tables":[...onze nomes acima...] }` somente depois da conferência. O script não confere a validade de um backup: testar restauração é obrigação operacional.

Faça backup com pg_dump em formato custom antes da migration e guarde-o fora de Git; use credenciais de conexão por variável de ambiente, sem incluí-las em comandos salvos. `pg_dump -Fc -f moonastery-before-rebuild.dump` usa PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD configurados no ambiente. Faça também o backup dos objetos Storage pelo mecanismo da infraestrutura, pois um dump SQL não contém arquivos. Valide com `pg_restore --list moonastery-before-rebuild.dump` e ensaie `pg_restore --exit-on-error --no-owner --dbname=<banco de recuperação> moonastery-before-rebuild.dump` em um banco separado. Não restaure automaticamente sobre produção.

## Implantar

Descubra comandos na versão instalada: `supabase migration list --help` e `supabase db push --help`. Revise o SQL e a lista antes de aplicar migrations. As novas migrations usam prefixos para isolar arquitetura e não apagam public, auth, storage, credenciais ou extensões. O cadastro Supabase Auth nativo cria um membership pending e um perfil sem role; metadados editáveis nunca concedem acesso.

O primeiro owner exige bootstrap administrativo explícito após um cadastro nativo confirmado. No SQL Editor seguro, selecione o UUID exato do usuário confirmado; altere apenas seu `moon_memberships` para status approved e role owner. Não há promoção por e-mail, lista de allowlist ou parâmetro vindo do navegador. Contas Supabase Auth antigas não são migradas automaticamente. Se precisar preservar uma conta antiga, crie seu membership e player por procedimento administrativo revisado; contas antigas da tabela app_auth_users não são sessões Auth nativas.

## Limpar legado depois da validação

Execute `node scripts/database-reset.mjs` para uma simulação sem conexão. O SQL usa lista fechada, transação e DROP ... RESTRICT. Dependências inesperadas abortam a operação inteira; não substitua por CASCADE indiscriminado. Não remove tipos/infraestrutura nem moon_*.

Somente após backup, ensaio de restauração, inventário e autorização explícita de reset remoto: configure DATABASE_URL no ambiente e execute `node scripts/database-reset.mjs --execute --confirm=RESET_LEGACY_APPLICATION --backup=<dump verificado> --inventory=<inventário revisado.json>`. As credenciais não são impressas. Um segundo procedimento separado via Supabase Auth Admin API é necessário para limpar contas Auth antigas, com confirmação explícita individualizada; este script não o faz.

## Verificação local

PGlite foi instalado em `.cache/dbverify` apenas para validação (sem dependência de produção). `node scripts/database-verify.mjs` aplica as novas migrations em PostgreSQL isolado com stubs mínimos de Auth/Storage e verifica RLS, papéis, unicidade, aprovação, evolução e publicação. Isso não verifica a configuração real de e-mail, Storage, HTTP/Auth ou drift do projeto remoto. Aplicar e testar em staging antes de produção.
