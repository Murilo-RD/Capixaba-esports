import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid, Line, LineChart, PolarAngleAxis,
  PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportSlice = {
  semana: string;
  created_at: string;
  rank_atual?: string | null;
  mmr_atual: string | null;
  variacao?: "subiu" | "manteve" | "caiu" | null;
  freeplay?: boolean | null;
  mecanicas?: boolean | null;
  replay_review?: boolean | null;
  nota_geral: number | null;
  rotacao: number | null;
  posicionamento: number | null;
  decisao: number | null;
  consistencia: number | null;
  mecanica: number | null;
};

function avg(nums: (number | null | undefined)[]) {
  const values = nums.filter((n): n is number => typeof n === "number");
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function parseMMR(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? null : n;
}

const tooltipStyle = {
  background: "oklch(0.22 0.05 260 / 0.95)",
  backdropFilter: "blur(12px)",
  border: "1px solid oklch(1 0 0 / 0.15)",
  borderRadius: 12,
  fontSize: 12,
};

export function PlayerEvolutionChart({ reports }: { reports: ReportSlice[] }) {
  const chronological = useMemo(
    () => [...reports].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [reports],
  );

  const chartData = useMemo(() => {
    return chronological.map((r) => ({
      semana: r.semana.replace("Semana ", "S"),
      nota: r.nota_geral ?? 0,
      rotacao: r.rotacao ?? 0,
      posicionamento: r.posicionamento ?? 0,
      decisao: r.decisao ?? 0,
      consistencia: r.consistencia ?? 0,
      mecanica: r.mecanica ?? 0,
      mmr: parseMMR(r.mmr_atual),
    }));
  }, [chronological]);

  const radarData = useMemo(() => [
    { skill: "Rotação", v: avg(chronological.map((r) => r.rotacao)) },
    { skill: "Posicion.", v: avg(chronological.map((r) => r.posicionamento)) },
    { skill: "Decisão", v: avg(chronological.map((r) => r.decisao)) },
    { skill: "Consist.", v: avg(chronological.map((r) => r.consistencia)) },
    { skill: "Mecânica", v: avg(chronological.map((r) => r.mecanica)) },
  ], [chronological]);

  const treinos = {
    freeplay: chronological.filter((r) => r.freeplay).length,
    mecanicas: chronological.filter((r) => r.mecanicas).length,
    replay: chronological.filter((r) => r.replay_review).length,
  };

  const trainData = [
    { name: "Free Play", v: treinos.freeplay },
    { name: "Mecânicas", v: treinos.mecanicas },
    { name: "Replay", v: treinos.replay },
  ];

  const variacoes = {
    subiu: chronological.filter((r) => r.variacao === "subiu").length,
    manteve: chronological.filter((r) => r.variacao === "manteve").length,
    caiu: chronological.filter((r) => r.variacao === "caiu").length,
  };

  const firstNota = chronological.find((r) => r.nota_geral != null)?.nota_geral ?? 0;
  const lastNota = [...chronological].reverse().find((r) => r.nota_geral != null)?.nota_geral ?? 0;
  const notaDelta = lastNota - firstNota;
  const avgNota = avg(chronological.map((r) => r.nota_geral));

  const mmrValid = chartData.filter((c) => c.mmr != null);
  const mmrDelta = mmrValid.length >= 2 ? (mmrValid[mmrValid.length - 1].mmr! - mmrValid[0].mmr!) : 0;
  const treinoPct = Math.round(((treinos.freeplay + treinos.mecanicas + treinos.replay) / Math.max(1, chronological.length * 3)) * 100);

  if (!chronological.length) {
    return (
      <Card className="glass border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sua avaliação</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Envie seu primeiro relatório para ver os gráficos de avaliação.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Nota média" value={avgNota.toFixed(1)} suffix="/10" tone="primary" />
        <Kpi
          label="Evolução nota"
          value={(notaDelta >= 0 ? "+" : "") + notaDelta.toFixed(1)}
          tone={notaDelta > 0 ? "primary" : notaDelta < 0 ? "destructive" : "muted"}
        />
        <Kpi
          label="Δ MMR período"
          value={(mmrDelta >= 0 ? "+" : "") + mmrDelta}
          tone={mmrDelta > 0 ? "primary" : mmrDelta < 0 ? "destructive" : "muted"}
        />
        <Kpi label="MMR semanas" value={`${variacoes.subiu}↑ ${variacoes.manteve}→ ${variacoes.caiu}↓`} tone="accent" />
        <Kpi label="Treinos completos" value={`${treinoPct}%`} tone="primary" />
      </div>

      <Card className="glass border-0">
        <CardHeader><CardTitle className="text-base">Evolução da nota geral</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="playerNotaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="natural" dataKey="nota" stroke="var(--primary)" strokeWidth={3} fill="url(#playerNotaGradient)" dot={{ fill: "var(--primary)", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">Perfil de habilidades</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <defs>
                  <radialGradient id="playerRadarGradient">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.3} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="skill" stroke="var(--muted-foreground)" fontSize={11} />
                <PolarRadiusAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={10} />
                <Radar dataKey="v" stroke="var(--accent)" strokeWidth={2} fill="url(#playerRadarGradient)" fillOpacity={0.7} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">Skills por semana</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="natural" dataKey="rotacao" name="Rotação" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="posicionamento" name="Posicionamento" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="decisao" name="Decisão" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="consistencia" name="Consistência" stroke="var(--chart-4)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="natural" dataKey="mecanica" name="Mecânica" stroke="var(--chart-5)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">Evolução de MMR</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="playerMmrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="semana" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 30", "dataMax + 30"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="natural" dataKey="mmr" stroke="var(--accent)" strokeWidth={3} fill="url(#playerMmrGradient)" dot={{ fill: "var(--accent)", r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardHeader><CardTitle className="text-base">Consistência de treinos</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trainData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="playerBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.05)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="v" fill="url(#playerBarGradient)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix, tone = "primary" }: {
  label: string;
  value: string;
  suffix?: string;
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
