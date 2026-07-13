import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Report = Database["public"]["Tables"]["weekly_reports"]["Row"];

const variacaoColor: Record<string, string> = {
  subiu: "text-primary",
  manteve: "text-muted-foreground",
  caiu: "text-destructive",
};
const variacaoIcon: Record<string, string> = {
  subiu: "▲",
  manteve: "▬",
  caiu: "▼",
};

export function ReportCard({ r, showNick = true, onDelete, onEdit }: { r: Report; showNick?: boolean; onDelete?: (r: Report) => void; onEdit?: (r: Report) => void }) {
  return (
    <Card className="glass border-0 transition-all hover:shadow-[0_0_40px_-10px_var(--primary)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">
            {showNick && <span className="text-primary">{r.nick} · </span>}
            {r.semana}
          </CardTitle>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <div className="text-2xl font-black text-gradient">{r.nota_geral ?? "-"}<span className="text-sm text-muted-foreground">/10</span></div>
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={() => onEdit(r)} aria-label="Editar relatório">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(r)} aria-label="Excluir relatório">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Info label="Rank" value={r.rank_atual} />
          <Info label="MMR" value={r.mmr_atual} />
          <Info
            label="Variação"
            value={
              r.variacao ? (
                <span className={variacaoColor[r.variacao]}>
                  {variacaoIcon[r.variacao]} {r.variacao}
                </span>
              ) : "-"
            }
          />
          <Info
            label="Treinos"
            value={`${[r.freeplay, r.mecanicas, r.replay_review].filter(Boolean).length}/3`}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Rotação" v={r.rotacao} />
          <Stat label="Posic." v={r.posicionamento} />
          <Stat label="Decisão" v={r.decisao} />
          <Stat label="Consist." v={r.consistencia} />
          <Stat label="Mecânica" v={r.mecanica} />
        </div>

        <Section title="🏆 Evolução">{r.evolucao}</Section>
        <Section title="⚠️ A melhorar">{r.melhorar}</Section>
        <Section title="🎯 Objetivo">{r.objetivo}</Section>

        <div className="flex gap-3 flex-wrap pt-1">
          <Badge ok={r.freeplay}>Free Play</Badge>
          <Badge ok={r.mecanicas}>Mecânicas</Badge>
          <Badge ok={r.replay_review}>Replay Review</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold">{value || "-"}</div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="rounded-lg glass px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-bold text-primary">{v ?? "-"}<span className="text-xs text-muted-foreground">/10</span></div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <p className="text-foreground/90 whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        "text-xs px-2 py-1 rounded-full border " +
        (ok
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground line-through")
      }
    >
      {children}
    </span>
  );
}
