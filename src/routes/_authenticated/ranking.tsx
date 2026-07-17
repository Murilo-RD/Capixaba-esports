import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Trophy, Medal, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { secureRead } from "@/lib/secure-api";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["weekly_reports"]["Row"];

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

// Ordem oficial dos ranks do Rocket League (do menor para o maior)
const RANK_ORDER: string[] = [
  "Bronze I", "Bronze II", "Bronze III",
  "Silver I", "Silver II", "Silver III",
  "Gold I", "Gold II", "Gold III",
  "Platinum I", "Platinum II", "Platinum III",
  "Diamond I", "Diamond II", "Diamond III",
  "Champion I", "Champion II", "Champion III",
  "Grand Champion I", "Grand Champion II", "Grand Champion III",
  "Supersonic Legend",
];

const RANK_COLOR: Record<string, string> = {
  Bronze: "text-amber-700",
  Silver: "text-slate-300",
  Gold: "text-yellow-400",
  Platinum: "text-cyan-300",
  Diamond: "text-sky-300",
  Champion: "text-purple-300",
  "Grand Champion": "text-red-300",
  Supersonic: "text-amber-300",
};

function rankColor(rank: string | null | undefined) {
  if (!rank) return "text-muted-foreground";
  for (const k of Object.keys(RANK_COLOR)) if (rank.startsWith(k)) return RANK_COLOR[k];
  return "text-muted-foreground";
}

function rankTier(rank: string | null | undefined): number {
  if (!rank) return -1;
  return RANK_ORDER.indexOf(rank);
}

function parseMMR(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? null : n;
}

type Row = {
  nick: string;
  mmr: number;
  rank: string | null;
  prevMmr: number | null;
  delta: number | null;
  semana: string;
  reportsCount: number;
};

function RankingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["ranking-reports"],
    queryFn: async () => secureRead<Pick<Report, "nick" | "rank_atual" | "mmr_atual" | "semana" | "created_at">[]>("reports.ranking", {}),
  });

  const rows = useMemo<Row[]>(() => {
    const byNick = new Map<string, typeof data>() as Map<string, NonNullable<typeof data>>;
    for (const r of data ?? []) {
      const arr = byNick.get(r.nick) ?? [];
      arr.push(r);
      byNick.set(r.nick, arr);
    }
    const out: Row[] = [];
    byNick.forEach((reports, nick) => {
      const withMmr = reports.filter((r) => parseMMR(r.mmr_atual) != null);
      if (withMmr.length === 0) return;
      const latest = withMmr[withMmr.length - 1];
      const prev = withMmr.length >= 2 ? withMmr[withMmr.length - 2] : null;
      const mmr = parseMMR(latest.mmr_atual)!;
      const prevMmr = prev ? parseMMR(prev.mmr_atual) : null;
      out.push({
        nick,
        mmr,
        rank: latest.rank_atual,
        prevMmr,
        delta: prevMmr != null ? mmr - prevMmr : null,
        semana: latest.semana,
        reportsCount: reports.length,
      });
    });
    return out.sort((a, b) => {
      const ta = rankTier(a.rank);
      const tb = rankTier(b.rank);
      if (tb !== ta) return tb - ta;
      return b.mmr - a.mmr;
    });
  }, [data]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-black">
          🏆 RANKING <span className="text-gradient">DO TIME</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Classificação por rank e MMR (último relatório de cada jogador)
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-muted-foreground">Nenhum jogador com MMR registrado ainda.</p>
      )}

      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 items-end">
          {/* 2º */}
          {podium[1] ? (
            <PodiumCard pos={2} row={podium[1]} heightClass="pt-6" />
          ) : <div />}
          {/* 1º */}
          {podium[0] && <PodiumCard pos={1} row={podium[0]} heightClass="pt-2" highlight />}
          {/* 3º */}
          {podium[2] ? (
            <PodiumCard pos={3} row={podium[2]} heightClass="pt-10" />
          ) : <div />}
        </div>
      )}

      {rest.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Classificação completa</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5">
              {rest.map((r, i) => (
                <RankRow key={r.nick} pos={i + 4} row={r} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function PodiumCard({ pos, row, heightClass, highlight }: {
  pos: number; row: Row; heightClass: string; highlight?: boolean;
}) {
  const trophyColor = pos === 1 ? "text-yellow-400" : pos === 2 ? "text-slate-300" : "text-amber-600";
  return (
    <div className={`${heightClass}`}>
      <Card className={`text-center ${highlight ? "shadow-[var(--shadow-glow)]" : ""}`}>
        <CardContent className="p-3 sm:p-5">
          <div className="flex justify-center mb-2">
            {pos === 1 ? <Trophy className={`h-7 w-7 sm:h-9 sm:w-9 ${trophyColor}`} />
              : <Medal className={`h-6 w-6 sm:h-8 sm:w-8 ${trophyColor}`} />}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{pos}º lugar</div>
          <div className="font-black text-lg sm:text-xl text-gradient truncate">{row.nick}</div>
          <div className={`text-xs font-semibold mt-1 ${rankColor(row.rank)}`}>{row.rank ?? "-"}</div>
          <div className="mt-3 text-2xl sm:text-3xl font-black">
            {row.mmr}
            <span className="text-xs text-muted-foreground"> MMR</span>
          </div>
          <DeltaBadge delta={row.delta} />
        </CardContent>
      </Card>
    </div>
  );
}

function RankRow({ pos, row }: { pos: number; row: Row }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 text-center font-black text-muted-foreground">{pos}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{row.nick}</div>
        <div className={`text-xs ${rankColor(row.rank)}`}>{row.rank ?? "-"} · {row.semana}</div>
      </div>
      <div className="text-right">
        <div className="text-lg font-black">{row.mmr}<span className="text-[10px] text-muted-foreground"> MMR</span></div>
        <DeltaBadge delta={row.delta} compact />
      </div>
    </div>
  );
}

function DeltaBadge({ delta, compact }: { delta: number | null; compact?: boolean }) {
  if (delta == null) {
    return <div className={`text-[10px] text-muted-foreground ${compact ? "" : "mt-1"}`}>—</div>;
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground";
  const sign = delta > 0 ? "+" : "";
  return (
    <div className={`inline-flex items-center gap-1 text-xs font-semibold ${color} ${compact ? "" : "mt-1"}`}>
      <Icon className="h-3 w-3" />
      {sign}{delta}
    </div>
  );
}
