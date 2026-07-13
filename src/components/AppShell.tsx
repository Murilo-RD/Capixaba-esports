import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { FilePlus2, History, Dumbbell, Shield, LogOut, Trophy, User, ClipboardList, Swords } from "lucide-react";
import logo from "@/assets/capixaba-logo.png";

function currentWeekLabel() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((+d - +onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `Semana ${week}/${d.getFullYear()}`;
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; ownerOnly?: boolean };

const APPROVED_ITEMS: NavItem[] = [
  { to: "/relatorio", label: "Novo relatório", icon: FilePlus2 },
  { to: "/meus-relatorios", label: "Meus relatórios", icon: History },
  { to: "/ranking", label: "Ranking do time", icon: Trophy },
  { to: "/jogos", label: "Jogos", icon: Swords },
  { to: "/treinos", label: "Treinos", icon: Dumbbell },
  { to: "/perfil", label: "Meu perfil", icon: User },
  { to: "/admin", label: "Admin", icon: Shield, ownerOnly: true },
];

const PENDING_ITEMS: NavItem[] = [
  { to: "/candidatura", label: "Minha candidatura", icon: ClipboardList },
  { to: "/jogos", label: "Jogos", icon: Swords },
  { to: "/perfil", label: "Meu perfil", icon: User },
];

const PUBLIC_FOR_PENDING = ["/candidatura", "/perfil", "/jogos"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [isOwner, setIsOwner] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [uid, setUid] = useState<string | null>(null);
  const [newCandidates, setNewCandidates] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData.user?.id;
      setEmail(userData.user?.email ?? null);
      setUid(id ?? null);
      if (!id) return;
      const [{ data: role }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id).eq("role", "owner").maybeSingle(),
        supabase.from("profiles").select("status").eq("id", id).maybeSingle(),
      ]);
      const owner = !!role;
      const st = prof?.status ?? "pendente";
      setIsOwner(owner);
      setStatus(st);

      // Admin: notify about new candidates since last visit
      if (owner) {
        const key = `capixaba:lastSeenCandidates:${id}`;
        const lastSeen = localStorage.getItem(key) ?? new Date(0).toISOString();
        const { count } = await supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .gt("created_at", lastSeen);
        const c = count ?? 0;
        setNewCandidates(c);
        if (c > 0) {
          toast.info(`${c} nova(s) candidatura(s) aguardando análise`, {
            action: { label: "Ver", onClick: () => navigate({ to: "/admin" }) },
          });
        }
      }

      // Approved player: weekly report reminder
      if (st === "aprovado" && !owner) {
        const week = currentWeekLabel();
        const remindKey = `capixaba:reportReminded:${id}`;
        if (localStorage.getItem(remindKey) !== week) {
          const { count } = await supabase
            .from("weekly_reports")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("semana", week);
          if ((count ?? 0) === 0) {
            toast.info(`Nova semana! Lembre de enviar o relatório de ${week}.`, {
              duration: 8000,
              action: { label: "Preencher", onClick: () => navigate({ to: "/relatorio" }) },
            });
          }
          localStorage.setItem(remindKey, week);
        }
      }
    })();
  }, [navigate]);

  // gate: if not approved (and not owner), restrict access
  useEffect(() => {
    if (status == null) return;
    if (status !== "aprovado" && !isOwner && !PUBLIC_FOR_PENDING.includes(pathname)) {
      navigate({ to: "/candidatura" });
    }
  }, [status, isOwner, pathname, navigate]);

  // Mark candidates as seen when admin opens /admin
  useEffect(() => {
    if (isOwner && uid && pathname === "/admin") {
      localStorage.setItem(`capixaba:lastSeenCandidates:${uid}`, new Date().toISOString());
      setNewCandidates(0);
    }
  }, [isOwner, uid, pathname]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Force a clean route/session reload so pending candidates do not get stuck
      // in the authenticated shell with stale profile state.
      window.location.replace("/auth");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao sair da conta.");
      setLoggingOut(false);
    }
  }

  const baseItems = status === "aprovado" || isOwner ? APPROVED_ITEMS : PENDING_ITEMS;
  const visible = baseItems.filter((i) => !i.ownerOnly || isOwner);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
              <img src={logo} alt="Capixaba E-Sports" className="h-11 w-11 shrink-0 object-contain" />
              <span className="font-black tracking-tight truncate">
                <span className="text-primary">CAPIXABA</span>{" "}
                <span className="text-accent">E-SPORTS</span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navegação</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link to={item.to} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                            {item.to === "/admin" && newCandidates > 0 && (
                              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">
                                {newCandidates}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 pb-2 text-xs text-muted-foreground truncate">{email}</div>
            <Button variant="ghost" size="sm" onClick={logout} disabled={loggingOut} className="justify-start gap-2">
              <LogOut className="h-4 w-4" /> {loggingOut ? "Saindo..." : "Sair"}
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 glass border-0 border-b border-white/10 px-3 sm:px-4 sticky top-0 z-30 rounded-none">
            <SidebarTrigger />
            <Link to="/" className="flex items-center gap-2 min-w-0">
              <img src={logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
              <span className="font-black tracking-tight truncate text-sm sm:text-base">
                <span className="text-primary">CAPIXABA</span>{" "}
                <span className="text-accent">E-SPORTS</span>
              </span>
            </Link>
          </header>
          <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
