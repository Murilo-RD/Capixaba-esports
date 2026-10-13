import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
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
      <main className="team-status" role="status">
        Carregando sua sessão…
      </main>
    );
  if (sessionError)
    return (
      <main className="team-status">
        <h1>Área da equipe indisponível</h1>
        <p role="alert">{sessionError}</p>
        <a href="/">Voltar ao site</a>
      </main>
    );
  if (!session || recovery || search.recovery === 1)
    return (
      <TeamAuth
        recovery={Boolean(session) && (recovery || search.recovery === 1)}
        onPasswordSaved={() => {
          setRecovery(false);
          void navigate({ search: {} });
        }}
      />
    );
  if (member.isPending)
    return (
      <main className="team-status" role="status">
        Verificando seu acesso…
      </main>
    );
  if (member.error || !member.data)
    return (
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
  return (
    <div className="team-layout">
      <a className="team-skip" href="#team-main">
        Pular para o conteúdo
      </a>
      <aside className={`team-sidebar ${mobileOpen ? "team-sidebar-open" : ""}`}>
        <a href="/" className="team-brand">
          <img src="/moonastery-icon.png" alt="Moonastery" />
          <span>
            Moonastery
            <br />
            <small>Área da equipe</small>
          </span>
        </a>
        <nav aria-label="Navegação da equipe">
          {modules.map((module) => (
            <button
              key={module}
              type="button"
              aria-current={selected === module ? "page" : undefined}
              onClick={() => {
                void navigate({ search: { module } });
                setMobileOpen(false);
              }}
            >
              {module === "reports" && membership.role !== "player"
                ? "Relatórios"
                : moduleLabels[module]}
            </button>
          ))}
        </nav>
        <div className="team-sidebar-user">
          <strong>{membership.nick}</strong>
          <span>{membership.role}</span>
          <button className="team-text-button" onClick={() => void logout()}>
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="team-workspace">
        <header className="team-header">
          <button
            className="team-menu"
            aria-label="Abrir navegação da equipe"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? "Fechar" : "Menu"}
          </button>
          <div>
            <p>Moonastery E-Sports</p>
            <h1>{label}</h1>
          </div>
          <a href="/">Site público</a>
        </header>
        <main id="team-main" className="team-main" tabIndex={-1}>
          {data.isPending ? (
            <p role="status">Carregando dados…</p>
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
            <TeamContent key={`${selected}-${offset}`} module={selected} data={data.data} />
          ) : null}
          {data.data && (
            <nav className="team-pagination" aria-label="Paginação dos registros">
              <button
                type="button"
                className="team-button team-button-secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Página anterior
              </button>
              <span>Página {offset / 100 + 1} · até 100 registros por seção</span>
              <button
                type="button"
                className="team-button team-button-secondary"
                disabled={
                  !Object.values(data.data).some(
                    (value) => Array.isArray(value) && value.length === 100,
                  )
                }
                onClick={() => setOffset(offset + 100)}
              >
                Próxima página
              </button>
            </nav>
          )}
        </main>
      </div>
    </div>
  );
}
