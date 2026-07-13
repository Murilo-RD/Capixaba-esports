import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  BarChart, Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ReportCard } from "@/components/ReportCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CandidatesPanel } from "@/components/CandidatesPanel";
import { RivalTeamsPanel } from "@/components/RivalTeamsPanel";
import { MatchesPanel } from "@/components/MatchesPanel";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["weekly_reports"]["Row"];

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function avg(nums: (number | null)[]) {
  const v = nums.filter((n): n is number => typeof n === "number");
  if (!v.length) return 0;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function Admin() {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["all-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Report[];
    },
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("weekly_reports").delete().eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Relatório excluído.");
    setToDelete(null);
    queryClient.invalidateQueries({ queryKey: ["all-reports"] });
  }

  const byPlayer = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of data ?? []) {
      const arr = map.get(r.nick) ?? [];
      arr.push(r);
      map.set(r.nick, arr);
    }
    return Array.from(map.entries())
      .map(([nick, reports]) => ({
        nick,
        reports,
        count: reports.length,
        latest: reports[reports.length - 1],
        avgNota: avg(reports.map((r) => r.nota_geral)),
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const filteredPlayers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return byPlayer;
    return byPlayer.filter((p) => p.nick.toLowerCase().includes(q));
  }, [byPlayer, filter]);

  const selectedData = selected ? byPlayer.find((p) => p.nick === selected) : null;

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black">
            Painel do <span className="text-primary">Dono</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {data?.length ?? 0} relatórios · {byPlayer.length} jogadores
          </p>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {error && (
        <p className="text-destructive">
          Erro ao carregar. Detalhes: {(error as Error).message}
        </p>
      )}

      <Tabs defaultValue="jogadores" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="jogadores">Jogadores</TabsTrigger>
          <TabsTrigger value="candidatos">Candidatos</TabsTrigger>
          <TabsTrigger value="equipes">Equipes rivais</TabsTrigger>
          <TabsTrigger value="jogos">Jogos</TabsTrigger>
        </TabsList>

        <TabsContent value="jogadores">
          {!selectedData && (
            <>
              <Input
                placeholder="Buscar jogador..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-4 sm:w-72 glass border-white/10"
              />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlayers.map((p) => (
                  <button
                    key={p.nick}
                    onClick={() => setSelected(p.nick)}
                    className="text-left rounded-2xl glass p-5 hover:scale-[1.02] hover:shadow-[var(--shadow-glow)] transition-all group"
                  >
                    <div className="flex items-baseline justify-between">
                      <div className="font-bold text-lg text-gradient">{p.nick}</div>
                      <div className="text-2xl font-black">
                        {p.avgNota.toFixed(1)}
                        <span className="text-xs text-muted-foreground">/10</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.count} relatório(s) · Última: {p.latest.semana}
                    </div>
                    <div className="text-xs mt-2 text-muted-foreground">
                      Rank atual: <span className="text-foreground">{p.latest.rank_atual ?? "-"}</span> · MMR: <span className="text-foreground">{p.latest.mmr_atual ?? "-"}</span>
                    </div>
                  </button>
                ))}
                {!isLoading && filteredPlayers.length === 0 && (
                  <p className="text-muted-foreground">Nenhum jogador encontrado.</p>
                )}
              </div>
            </>
          )}
          {selectedData && (
            <PlayerDashboard
              data={selectedData}
              onBack={() => setSelected(null)}
              onDelete={(r) => setToDelete(r)}
            />
          )}
        </TabsContent>

        <TabsContent value="candidatos">
          <CandidatesPanel />
        </TabsContent>

        <TabsContent value="equipes">
          <RivalTeamsPanel />
        </TabsContent>

        <TabsContent value="jogos">
          <MatchesPanel />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir relatório?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && (
                <>
                  Esta ação não pode ser desfeita. O relatório de{" "}
                  <strong>{toDelete.nick}</strong> da semana <strong>{toDelete.semana}</strong> será removido permanentemente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function PlayerDashboard({
  data,
  onBack,
  onDelete,
}: {
  data: { nick: string; reports: Report[]; avgNota: number; latest: Report };
  onBack: () => void;
  onDelete: (r: Report) => void;
}) {
  const { nick, reports, latest } = data;

  const chronological = [...reports];
  const chartData = chronological.map((r) => ({
    semana: r.semana,
    nota: r.nota_geral ?? 0,
    rotacao: r.rotacao ?? 0,
    posicionamento: r.posicionamento ?? 0,
    decisao: r.decisao ?? 0,
    consistencia: r.consistencia ?? 0,
    mecanica: r.mecanica ?? 0,
    mmr: typeof r.mmr_atual === "string" ? parseInt(r.mmr_atual.replace(/[^\d-]/g, ""), 10) || null : null,
  }));

  const radarData = [
    { skill: "Rotação", v: avg(reports.map((r) => r.rotacao)) },
    { skill: "Posicion.", v: avg(reports.map((r) => r.posicionamento)) },
    { skill: "Decisão", v: avg(reports.map((r) => r.decisao)) },
    { skill: "Consist.", v: avg(reports.map((r) => r.consistencia)) },
    { skill: "Mecânica", v: avg(reports.map((r) => r.mecanica)) },
  ];

  const treinos = {
    freeplay: reports.filter((r) => r.freeplay).length,
    mecanicas: reports.filter((r) => r.mecanicas).length,
    replay: reports.filter((r) => r.replay_review).length,
  };
  const trainData = [
    { name: "Free Play", v: treinos.freeplay },
    { name: "Mecânicas", v: treinos.mecanicas },
    { name: "Replay", v: treinos.replay },
  ];

  const variacoes = {
    subiu: reports.filter((r) => r.variacao === "subiu").length,
    manteve: reports.filter((r) => r.variacao === "manteve").length,
    caiu: reports.filter((r) => r.variacao === "caiu").length,
  };

  const firstNota = chronological.find((r) => r.nota_geral != null)?.nota_geral ?? 0;
  const lastNota = [...chronological].reverse().find((r) => r.nota_geral != null)?.nota_geral ?? 0;
  const delta = lastNota - firstNota;

  const mmrValid = chartData.filter((c) => c.mmr != null);
  const mmrDelta = mmrValid.length >= 2 ? (mmrValid[mmrValid.length - 1].mmr! - mmrValid[0].mmr!) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Voltar</Button>
        <div>
          <h2 className="text-2xl font-black">
            <span className="text-primary">{nick}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {reports.length} relatórios · Rank atual: {latest.rank_atual ?? "-"} · MMR: {latest.mmr_atual ?? "-"}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Nota média" value={data.avgNota.toFixed(1)} suffix="/10" tone="primary" />
        <Kpi
          label="Evolução nota"
          value={(delta >= 0 ? "+" : "") + delta.toFixed(1)}
          tone={delta > 0 ? "primary" : delta < 0 ? "destructive" : "muted"}
        />
        <Kpi
          label="Δ MMR período"
          value={(mmrDelta >= 0 ? "+" : "") + mmrDelta}
          tone={mmrDelta > 0 ? "primary" : mmrDelta < 0 ? "destructive" : "muted"}
        />
        <Kpi
          label="MMR semanas"
          value={`${variacoes.subiu}↑ ${variacoes.manteve}→ ${variacoes.caiu}↓`}
          tone="accent"
        />
        <Kpi
          label="Treinos completos"
          value={`${Math.round(((treinos.freeplay + treinos.mecanicas + treinos.replay) / Math.max(1, reports.length * 3)) * 100)}%`}
          tone="primary"
        />
      </div>

      {/* Main evolution */}
      <Card className="glass border-0">
        <CardHeader><CardTitle className="text-base">📈 Evolução da nota geral</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gNota" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "oklch(0.22 0.05 260 / 0.95)", backdropFilter: "blur(12px)", border: "1px solid oklch(1 0 0 / 0.15)", borderRadius: 12 }} />
              <Area type="natural" dataKey="nota" stroke="var(--primary)" strokeWidth={3} fill="url(#gNota)" dot={{ fill: "var(--primary)", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">🎯 Perfil de habilidades (média)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <defs>
                  <radialGradient id="gRadar">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.3} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="skill" stroke="var(--muted-foreground)" fontSize={11} />
                <PolarRadiusAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={10} />
                <Radar dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#gRadar)" fillOpacity={0.7} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">📊 Skills por semana</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "oklch(0.22 0.05 260 / 0.95)", backdropFilter: "blur(12px)", border: "1px solid oklch(1 0 0 / 0.15)", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="natural" dataKey="rotacao" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="posicionamento" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="decisao" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="consistencia" stroke="var(--chart-4)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="mecanica" stroke="var(--chart-5)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">🏆 Evolução de MMR</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gMmr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 30", "dataMax + 30"]} />
                <Tooltip contentStyle={{ background: "oklch(0.22 0.05 260 / 0.95)", backdropFilter: "blur(12px)", border: "1px solid oklch(1 0 0 / 0.15)", borderRadius: 12 }} />
                <Area type="natural" dataKey="mmr" stroke="var(--accent)" strokeWidth={3} fill="url(#gMmr)" dot={{ fill: "var(--accent)", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">✅ Consistência de treinos</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trainData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.05)" }} contentStyle={{ background: "oklch(0.22 0.05 260 / 0.95)", backdropFilter: "blur(12px)", border: "1px solid oklch(1 0 0 / 0.15)", borderRadius: 12 }} />
                <Bar dataKey="v" fill="url(#gBar)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-bold mb-3">Histórico de relatórios</h3>
        <div className="grid gap-4">
          {[...reports].reverse().map((r) => <ReportCard key={r.id} r={r} showNick={false} onDelete={onDelete} />)}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, tone = "primary" }: {
  label: string; value: string; suffix?: string;
  tone?: "primary" | "accent" | "destructive" | "muted";
}) {
  const color = {
    primary: "text-primary",
    accent: "text-accent",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-2xl glass p-4 transition-all hover:scale-[1.02]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-black mt-1 ${color}`}>
        {value}{suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
