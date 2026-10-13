# Auditoria da reconstrução Moonastery

Data: 13/10/2026. Escopo: código local, histórico de migrations e materiais fornecidos. Nenhuma alteração ou limpeza remota foi executada.

## Materiais e interpretação

Os dois textos anexados foram lidos integralmente. Os dois PDFs têm duas páginas cada; todas foram extraídas e renderizadas, incluindo a referência de carta. As três imagens oficiais e duas capturas da Vitality orientam a composição. O `Pasted markdown.md` citado na especificação não foi fornecido entre os anexos disponíveis; o diagnóstico abaixo foi conferido diretamente no repositório. A especificação nova prevalece sobre funcionalidades antigas. A menção a recompensas no resumo é uma visão futura, sem regras funcionais de recompensa definidas, e não autoriza inventar premiações.

## Stack e estrutura

React 19, TypeScript, TanStack Start/Router, TanStack Query, Vite 8, Tailwind 4, Radix, Recharts, Zod e supabase-js. O plugin Lovable já configura os plugins Vite necessários e será preservado. Render usa Nitro node-server. Componentes UI Radix, toasts, gráficos e infraestrutura SSR podem ser reutilizados.

Rotas antigas: homepage, `/auth`, `/jogos`, e grupo autenticado com candidatura, relatório manual, meus relatórios, ranking por MMR, perfil, treinos e administração. APIs antigas: login/cadastro/me próprios, candidatura, despachante secure/write e lembrete público. Funções server adicionais de tracker, email e gestão administrativa. Não existe integração de replays implementada.

## Banco declarado no histórico

23 migrations definem ou alteram profiles, user_roles, weekly_reports, applications, application_messages, trainings, training_videos, rival_teams, matches, team_titles e app_auth_users. Enums antigos: owner/player, status em português, variação MMR e níveis de treino. Há funções has_role, handle_new_user, updated_at e RPCs app_register/login/change_password/disable_user/delete_user. A migration de autenticação própria remove FKs de tabelas públicas para auth.users. Não existe modelagem de baselines, métricas automáticas, processamento, conteúdo editorial ou histórico de cartas.

O inventário local não equivale ao inventário remoto: drift, número de registros, policies efetivamente aplicadas e backups remotos precisam ser verificados com acesso administrativo antes do reset. Docker existe, mas o daemon não está disponível neste ambiente.

## Riscos confirmados

- Perfil contém email e tem SELECT público para aprovados; RLS por linha não protege colunas sensíveis.
- UPDATE de perfil próprio permite modificar status porque o check limita apenas id.
- Login/cadastro e secure/write promovem automaticamente owner por email fixo/configurado.
- Auth própria emite JWT usando SUPABASE_JWT_SECRET, tem sessão local longa sem fluxo nativo de recuperação.
- secure/write usa service role, parte das ações verifica apenas token ou propriedade, não aprovação.
- Lembrete trata chave publicável como segredo e pode disparar emails a partir de requisição pública.
- Relatórios manuais são escritos pelos próprios jogadores; SELECT autenticado amplo expõe relatórios de outros.
- RPCs legacy SECURITY DEFINER expostas e grants PUBLIC precisam ser revogados na implantação nova.

## Decisões

Preservar a stack e projeto Supabase. Substituir auth própria por Supabase Auth; nenhuma promoção por email. Entidades Moonastery com prefixo `moon_` evitam colisões com histórico legado. Perfil privado separado de carta pública. Toda operação interna verifica usuário real, status e papel no servidor, com RLS como segunda barreira. Remover rotas, APIs e serviços obsoletos da aplicação executável. Revogar o acesso do cliente ao legado na migration, mantendo dados até reset explicitamente confirmado.

O provider Ballchasing será real, com segredo apenas servidor. Sem token ou baseline SSL configurada, processamento deve informar a dependência; não deve gerar notas. Identidade do participante usa plataforma/id, nunca nick como chave confiável. Fórmulas propostas ficam versionadas e configuráveis, sem baseline SSL fictícia.

## Configuração externa

Variáveis atuais incluem Supabase público e service role, JWT próprio, bootstrap email, tracker, URL pública e gateway email. Não foram impressos valores do `.env`. As credenciais Supabase serão preservadas. JWT próprio, tracker e bootstrap tornam-se obsoletos, mas não serão apagados do `.env`. Nova URL pública permanece configurável, sem domínio inventado. Ballchasing, SMTP/Auth redirect, baselines reais e primeiro owner exigem configuração na implantação.
