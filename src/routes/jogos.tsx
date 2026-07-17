import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import logo from "@/assets/capixaba-logo.png";
import { Trophy, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/jogos")({
  head: () => ({
    meta: [
      { title: "Jogos e Resultados - Capixaba E-Sports" },
      { name: "description", content: "Acompanhe todos os jogos e resultados da Capixaba E-Sports no Rocket League." },
    ],
  }),
  component: JogosPage,
});

type Team = { id: string; name: string; logo_url: string | null };
type Match = {
  id: string;
  rival_team_id: string;
  competition: string;
  our_score: number | null;
  rival_score: number | null;
  played_at: string;
  notes: string | null;
  rival_teams?: Team;
};

function formatMatchDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  const months = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  const monthIndex = Number(month) - 1;
  if (!year || !day || monthIndex < 0 || monthIndex >= months.length) return value;
  return `${day} de ${months[monthIndex]} de ${year}`;
}

function hasMatchResult(match: Match) {
  return match.our_score !== null && match.rival_score !== null;
}

function JogosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*, rival_teams(*)")
        .order("played_at", { ascending: false });
      if (error) throw error;
      return data as Match[];
    },
  });

  const total = data?.length ?? 0;
  const completed = data?.filter(hasMatchResult) ?? [];
  const wins = completed.filter((m) => m.our_score! > m.rival_score!).length;
  const losses = completed.filter((m) => m.our_score! < m.rival_score!).length;
  const scheduled = total - completed.length;

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-accent/30 blur-3xl pointer-events-none" />

      <header className="glass border-b border-white/10 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="" className="h-11 w-11 shrink-0 object-contain" />
            <span className="font-black tracking-tight text-sm sm:text-base">
              <span className="text-primary">CAPIXABA</span> <span className="text-accent">E-SPORTS</span>
            </span>
          </Link>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Inicio
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 relative z-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-widest text-primary mb-3">
            <Trophy className="h-3 w-3" /> Resultados
          </div>
          <h1 className="text-4xl sm:text-5xl font-black">
            <span className="text-gradient">Jogos</span> da Capixaba
          </h1>
          <p className="text-muted-foreground text-sm mt-2">Todos os confrontos disputados pelo time.</p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          <Stat label="Jogos" value={total} tone="primary" />
          <Stat label="Vitorias" value={wins} tone="emerald" />
          <Stat label="Derrotas" value={losses} tone="destructive" />
          <Stat label="Agendados" value={scheduled} tone="muted" />
        </div>

        {isLoading && <p className="text-muted-foreground">Carregando...</p>}
        {!isLoading && !data?.length && (
          <Card className="glass border-0">
            <CardContent className="py-12 text-center text-muted-foreground">
              Ainda nao ha jogos cadastrados.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {(data ?? []).map((m) => {
            const hasResult = hasMatchResult(m);
            const winCapixaba = hasResult && m.our_score! > m.rival_score!;
            const draw = hasResult && m.our_score === m.rival_score;
            return (
              <Card key={m.id} className="glass border-0 hover:shadow-[var(--shadow-glow)] transition-all">
                <CardContent className="py-5">
                  <div className="text-xs text-muted-foreground mb-3 flex flex-wrap gap-x-3">
                    <span>{formatMatchDate(m.played_at)}</span>
                    <span>-</span>
                    <span className="text-accent">{m.competition}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0 justify-end sm:justify-start">
                      <div className="hidden sm:block text-right min-w-0 flex-1">
                        <div className="font-bold truncate">Capixaba</div>
                        <div className="text-[10px] uppercase text-muted-foreground">nossa</div>
                      </div>
                      <img src={logo} alt="Capixaba" className="h-20 w-20 sm:h-24 sm:w-24 object-contain drop-shadow-[0_0_15px_rgba(120,180,255,0.4)]" />
                    </div>
                    <div className="text-center px-2">
                      <div className={`text-3xl sm:text-4xl font-black tabular-nums ${!hasResult || draw ? "text-muted-foreground" : winCapixaba ? "text-emerald-400" : "text-destructive"}`}>
                        {hasResult ? (
                          <>{m.our_score} <span className="text-muted-foreground/50">x</span> {m.rival_score}</>
                        ) : (
                          <span className="text-2xl sm:text-3xl">VS</span>
                        )}
                      </div>
                      <div className={`text-[10px] uppercase tracking-widest mt-1 ${!hasResult || draw ? "text-muted-foreground" : winCapixaba ? "text-emerald-400" : "text-destructive"}`}>
                        {!hasResult ? "Agendado" : draw ? "Finalizado" : winCapixaba ? "Vitoria" : "Derrota"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      {m.rival_teams?.logo_url
                        ? <img src={m.rival_teams.logo_url} alt={m.rival_teams.name} className="h-14 w-14 sm:h-16 sm:w-16 object-contain" />
                        : <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-md glass grid place-items-center text-[10px] text-muted-foreground">sem logo</div>}
                      <div className="min-w-0 flex-1 sm:block hidden">
                        <div className="font-bold truncate">{m.rival_teams?.name ?? "-"}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">rival</div>
                      </div>
                    </div>
                  </div>
                  <div className="sm:hidden text-center text-xs mt-3 text-muted-foreground">
                    Capixaba x <strong className="text-foreground">{m.rival_teams?.name}</strong>
                  </div>
                  {m.notes && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-white/10">{m.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground relative z-10">Capixaba E-Sports</footer>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "primary" | "emerald" | "muted" | "destructive" }) {
  const colors: Record<string, string> = {
    primary: "text-primary",
    emerald: "text-emerald-400",
    muted: "text-muted-foreground",
    destructive: "text-destructive",
  };
  return (
    <div className="rounded-2xl glass p-4 text-center">
      <div className={`text-3xl font-black ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
