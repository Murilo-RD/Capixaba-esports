import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  FileChartColumn,
  Handshake,
  LayoutDashboard,
  Menu,
  Newspaper,
  ScanSearch,
  Settings2,
  Share2,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { moonRequest } from "@/lib/moonastery/client";
import type { DashboardData, Membership } from "@/lib/moonastery/types";
import { TeamAuth } from "@/components/team/auth";
import { TeamContent } from "@/components/team/modules";
import {
  defaultModule,
  moduleLabels,
  permittedModules,
  type TeamModule,
} from "@/components/team/permissions";
import "@/components/team/team.css";

const searchSchema = z.object({
  recovery: z.coerce.number().optional(),
  module: z.string().optional(),
});
const navigationGroups: { title: string; modules: TeamModule[] }[] = [
  { title: "Meu espaço", modules: ["overview", "reports", "ranking", "instructions", "profile"] },
  { title: "Equipe", modules: ["players", "scouter", "users", "submissions"] },
  { title: "Conteúdo e site", modules: ["news", "partners", "socials", "settings"] },
];
const moduleIcons: Record<TeamModule, LucideIcon> = {
  overview: LayoutDashboard,
  ranking: Trophy,
  reports: FileChartColumn,
  instructions: BookOpen,
  profile: UserRound,
  submissions: CircleHelp,
  players: UsersRound,
  scouter: ScanSearch,
  news: Newspaper,
  users: ShieldCheck,
  partners: Handshake,
  socials: Share2,
  settings: Settings2,
};
const moduleDescriptions: Record<TeamModule, string> = {
  overview: "Um resumo do que merece sua atenção agora.",
  ranking: "Veja a classificação e a evolução dos jogadores.",
  reports: "Acompanhe análises, evolução e feedback dos treinos.",
  instructions: "Planos e orientações para o próximo treino.",
  profile: "Atualize as informações que aparecem para a equipe.",
  submissions: "Envie e acompanhe mensagens para a organização.",
  players: "Gerencie os atletas, modalidades e arquétipos.",
  scouter: "Envie replays e acompanhe as análises.",
  news: "Crie, revise e publique notícias da organização.",
  users: "Aprove cadastros e organize as permissões.",
  partners: "Gerencie as marcas parceiras exibidas no site.",
  socials: "Atualize os canais oficiais da Moonastery.",
  settings: "Configure o site, modalidades e critérios de avaliação.",
};
const roleLabels = { owner: "Gestão", coach: "Treinador", editor: "Editor", player: "Jogador" };
const paginatedModules: Partial<Record<TeamModule, (keyof DashboardData)[]>> = {
  ranking: ["players"],
  reports: ["reports"],
  instructions: ["instructions"],
  submissions: ["submissions"],
  players: ["players"],
  scouter: ["jobs"],
  news: ["news"],
  users: ["users"],
  partners: ["partners"],
  socials: ["socials"],
};
export const Route = createFileRoute("/team")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Área da equipe | Moonastery E-Sports" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Team,
});

function Team() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const cache = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    setOffset(0);
    setMobileOpen(false);
  }, [search.module]);
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);
  useEffect(() => {
    let subscription: { unsubscribe(): void } | undefined;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, next) => {
        setSession(next);
        setReady(true);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        // Não aguarde chamadas Supabase dentro do listener de Auth.
        setTimeout(() => {
          void cache.invalidateQueries({ queryKey: ["moon-team"] });
        }, 0);
      });
      subscription = data.subscription;
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) setSessionError(error.message);
          setSession(data.session);
          setReady(true);
        })
        .catch((error) => {
          setSessionError(error instanceof Error ? error.message : "Erro de sessão.");
          setReady(true);
        });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Configure o acesso à plataforma.");
      setReady(true);
    }
    return () => subscription?.unsubscribe();
  }, [cache]);
  const member = useQuery({
    queryKey: ["moon-team", "membership", session?.user.id],
    queryFn: () => moonRequest<Membership>("membership.me"),
    enabled: Boolean(session),
    retry: false,
    refetchInterval: 30000,
  });
  const data = useQuery({
    queryKey: ["moon-team", "dashboard", session?.user.id, offset],
    queryFn: () => moonRequest<DashboardData>("dashboard.get", { offset }),
    enabled: member.data?.status === "approved",
    retry: false,
    refetchInterval: 15000,
  });
  async function logout() {
    await supabase.auth.signOut();
    cache.removeQueries({ queryKey: ["moon-team"] });
    setSession(null);
  }
  if (!ready)
    return (
      <>
        <main className="team-status" role="status">
          Carregando sua sessão…
        </main>
        <TeamFooter />
      </>
    );
  if (sessionError)
    return (
      <>
        <main className="team-status">
          <h1>Área da equipe indisponível</h1>
          <p role="alert">{sessionError}</p>
          <a href="/">Voltar ao site</a>
        </main>
        <TeamFooter />
      </>
    );
  if (!session || recovery || search.recovery === 1)
    return (
      <>
        <TeamAuth
          recovery={Boolean(session) && (recovery || search.recovery === 1)}
          onPasswordSaved={() => {
            setRecovery(false);
            void navigate({ search: {} });
          }}
        />
        <TeamFooter />
      </>
    );
  if (member.isPending)
    return (
      <>
        <main className="team-status" role="status">
          Verificando seu acesso…
        </main>
        <TeamFooter />
      </>
    );
  if (member.error || !member.data)
    return (
      <>
        <main className="team-status">
          <h1>Não foi possível verificar seu acesso</h1>
          <p role="alert">{member.error?.message}</p>
          <button className="team-button" onClick={() => void member.refetch()}>
            Tentar novamente
          </button>
          <button className="team-text-button" onClick={() => void logout()}>
            Sair
          </button>
        </main>
        <TeamFooter />
      </>
    );
  const membership = member.data;
  if (membership.status !== "approved" || !membership.role) {
    const descriptions = {
      pending:
        "Seu cadastro está aguardando a aprovação de um owner. Seu acesso será liberado após a definição da sua função.",
      rejected: "Sua solicitação de acesso foi recusada. Entre em contato com a organização.",
      suspended: "Seu acesso foi suspenso. Entre em contato com a organização.",
      approved: "Sua função ainda não foi definida. Entre em contato com um owner.",
    };
    return (
      <>
        <main className="team-status">
          <img src="/moonastery-icon.png" width="100" height="100" alt="Moonastery" />
          <h1>{membership.status === "pending" ? "Aguardando aprovação" : "Acesso à equipe"}</h1>
          <p>{descriptions[membership.status]}</p>
          <button className="team-button" onClick={() => void member.refetch()}>
            Verificar aprovação
          </button>
          <button className="team-text-button" onClick={() => void logout()}>
            Sair
          </button>
          <a href="/">Voltar ao site</a>
        </main>
        <TeamFooter />
      </>
    );
  }
  const modules = permittedModules(membership);
  const selected = modules.includes(search.module as TeamModule)
    ? (search.module as TeamModule)
    : defaultModule(membership.role);
  const label =
    selected === "reports" && membership.role !== "player"
      ? "Relatórios dos jogadores"
      : moduleLabels[selected];
  const paginationKeys = paginatedModules[selected] ?? [];
  const hasNextPage = Boolean(
    data.data &&
    paginationKeys.some((key) => {
      const value = data.data[key];
      return Array.isArray(value) && value.length === 100;
    }),
  );
  function handleModuleNavigation() {
    setOffset(0);
    setMobileOpen(false);
  }
  return (
    <div className="team-layout">
      <a className="team-skip" href="#team-main">
        Pular para o conteúdo
      </a>
      {mobileOpen && (
        <button
          type="button"
          className="team-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`team-sidebar ${mobileOpen ? "team-sidebar-open" : ""}`}>
        <a href="/" className="team-brand">
          <img src="/moonastery-icon.png" width="47" height="47" alt="Moonastery" />
          <span>
            Moonastery
            <br />
            <small>Central da equipe</small>
          </span>
        </a>
        <div className="team-sidebar-intro">
          <span className="team-online-dot" aria-hidden="true" />
          Seu espaço de trabalho
        </div>
        <nav aria-label="Navegação da equipe">
          {navigationGroups.map((group) => {
            const visible = group.modules.filter((module) => modules.includes(module));
            if (!visible.length) return null;
            return (
              <div className="team-nav-group" key={group.title}>
                <p>{group.title}</p>
                {visible.map((module) => {
                  const Icon = moduleIcons[module];
                  return (
                    <Link
                      key={module}
                      to="/team"
                      search={{ module }}
                      aria-current={selected === module ? "page" : undefined}
                      onClick={handleModuleNavigation}
                    >
                      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>
                        {module === "reports" && membership.role !== "player"
                          ? "Relatórios"
                          : moduleLabels[module]}
                      </span>
                      {selected === module && <ChevronRight size={16} aria-hidden="true" />}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="team-sidebar-user">
          <span className="team-user-avatar" aria-hidden="true">
            {membership.nick.slice(0, 1).toLocaleUpperCase("pt-BR")}
          </span>
          <div>
            <strong>{membership.nick}</strong>
            <span>{roleLabels[membership.role]}</span>
          </div>
          <button className="team-text-button" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>
      <div className="team-workspace">
        <header className="team-header">
          <button
            className="team-menu"
            aria-label={mobileOpen ? "Fechar navegação da equipe" : "Abrir navegação da equipe"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            <span>Menu</span>
          </button>
          <div className="team-header-copy">
            <p>
              Central da equipe <span aria-hidden="true">/</span> {roleLabels[membership.role]}
            </p>
            <h1>{label}</h1>
            <span>{moduleDescriptions[selected]}</span>
          </div>
          <a className="team-public-link" href="/">
            Ver site <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </header>
        <main id="team-main" className="team-main" tabIndex={-1}>
          {data.isPending ? (
            <div className="team-loading" role="status">
              Preparando seu espaço…
            </div>
          ) : data.error ? (
            <div>
              <p className="team-error" role="alert">
                {data.error.message}
              </p>
              <button className="team-button" onClick={() => void data.refetch()}>
                Tentar novamente
              </button>
            </div>
          ) : data.data ? (
            <TeamContent
              key={`${selected}-${offset}`}
              module={selected}
              data={data.data}
              onNavigate={handleModuleNavigation}
            />
          ) : null}
          {data.data && paginationKeys.length > 0 && (offset > 0 || hasNextPage) && (
            <nav className="team-pagination" aria-label="Paginação dos registros">
              <button
                type="button"
                className="team-button team-button-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Página anterior
              </button>
              <span>Página {offset / 100 + 1}</span>
              <button
                type="button"
                className="team-button team-button-secondary"
                disabled={!hasNextPage}
                onClick={() => setOffset(offset + 100)}
              >
                Próxima página
              </button>
            </nav>
          )}
        </main>
        <TeamFooter />
      </div>
    </div>
  );
}

function TeamFooter() {
  return (
    <footer className="team-footer">
      <span>© {new Date().getFullYear()} Moonastery E-Sports</span>
      <nav aria-label="Informações legais">
        <a href="/privacidade">Privacidade e dados</a>
        <a href="/termos">Termos de uso</a>
        <a href="/contato">Contato</a>
        <a href="/">Site público</a>
      </nav>
    </footer>
  );
}
