import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/custom-auth";
import { secureWrite } from "@/lib/secure-api";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorio")({
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: RelatorioPage,
});

function currentWeekLabel() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((+d - +onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `Semana ${week}/${d.getFullYear()}`;
}

// Ranks oficiais do Rocket League
const RANKS: string[] = [
  "Bronze I", "Bronze II", "Bronze III",
  "Silver I", "Silver II", "Silver III",
  "Gold I", "Gold II", "Gold III",
  "Platinum I", "Platinum II", "Platinum III",
  "Diamond I", "Diamond II", "Diamond III",
  "Champion I", "Champion II", "Champion III",
  "Grand Champion I", "Grand Champion II", "Grand Champion III",
  "Supersonic Legend",
];

function parseMMR(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? null : n;
}

function RelatorioPage() {
  const navigate = useNavigate();
  const { id: editId } = Route.useSearch();
  const [form, setForm] = useState({
    nick: "",
    semana: currentWeekLabel(),
    rank_atual: "Champion I",
    mmr_atual: "",
    freeplay: false,
    mecanicas: false,
    replay_review: false,
    rotacao: 5,
    posicionamento: 5,
    decisao: 5,
    consistencia: 5,
    mecanica: 5,
    evolucao: "",
    melhorar: "",
    objetivo: "",
  });
  const [prevMMR, setPrevMMR] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const user = getCurrentUser();
      if (!user) return;
      const { data: p } = await supabase.from("profiles").select("nick").eq("id", user.id).maybeSingle();
      if (p?.nick) setForm((f) => ({ ...f, nick: p.nick! }));

      if (editId) {
        const { data: rep } = await supabase.from("weekly_reports").select("*").eq("id", editId).maybeSingle();
        if (rep) {
          setForm({
            nick: rep.nick, semana: rep.semana,
            rank_atual: rep.rank_atual ?? "Champion I",
            mmr_atual: rep.mmr_atual ?? "",
            freeplay: rep.freeplay, mecanicas: rep.mecanicas, replay_review: rep.replay_review,
            rotacao: rep.rotacao ?? 5, posicionamento: rep.posicionamento ?? 5,
            decisao: rep.decisao ?? 5, consistencia: rep.consistencia ?? 5,
            mecanica: rep.mecanica ?? 5,
            evolucao: rep.evolucao ?? "", melhorar: rep.melhorar ?? "", objetivo: rep.objetivo ?? "",
          });
        }
      }

      // Busca o MMR do último relatório (ignorando o que está sendo editado)
      const q = supabase.from("weekly_reports").select("mmr_atual,id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);
      const { data: lasts } = await q;
      const ref = (lasts ?? []).find((r) => r.id !== editId);
      if (ref?.mmr_atual) setPrevMMR(parseMMR(ref.mmr_atual));
    })();
  }, [editId]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const notaGeral = useMemo(() => {
    const avg = (form.rotacao + form.posicionamento + form.decisao + form.consistencia + form.mecanica) / 5;
    return Math.round(avg * 10) / 10;
  }, [form.rotacao, form.posicionamento, form.decisao, form.consistencia, form.mecanica]);

  const variacaoAuto = useMemo<"subiu" | "manteve" | "caiu">(() => {
    const cur = parseMMR(form.mmr_atual);
    if (cur == null || prevMMR == null) return "manteve";
    if (cur > prevMMR) return "subiu";
    if (cur < prevMMR) return "caiu";
    return "manteve";
  }, [form.mmr_atual, prevMMR]);

  const diff = useMemo(() => {
    const cur = parseMMR(form.mmr_atual);
    if (cur == null || prevMMR == null) return null;
    return cur - prevMMR;
  }, [form.mmr_atual, prevMMR]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = getCurrentUser();
      if (!user) throw new Error("Sem usuario");
      const payload = {
        nick: form.nick, semana: form.semana, rank_atual: form.rank_atual,
        mmr_atual: form.mmr_atual, variacao: variacaoAuto,
        freeplay: form.freeplay, mecanicas: form.mecanicas, replay_review: form.replay_review,
        rotacao: form.rotacao, posicionamento: form.posicionamento, decisao: form.decisao,
        consistencia: form.consistencia, mecanica: form.mecanica,
        evolucao: form.evolucao, melhorar: form.melhorar, objetivo: form.objetivo,
        nota_geral: notaGeral, user_id: user.id,
      };
      await secureWrite("reports.save", { id: editId, report: payload });
      toast.success(editId ? "Relatório atualizado!" : "Relatório enviado!");
      navigate({ to: "/meus-relatorios" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-black">
          📋 {editId ? "EDITAR" : "RELATÓRIO"} <span className="text-gradient">SEMANAL</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Capixaba E-Sports — preencha sua semana</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <Field label="Nick">
              <Input required value={form.nick} onChange={(e) => set("nick", e.target.value)} />
            </Field>
            <Field label="Semana">
              <Input required value={form.semana} onChange={(e) => set("semana", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">🎮 Desempenho</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Rank atual">
                <Select value={form.rank_atual} onValueChange={(v) => set("rank_atual", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {RANKS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="MMR atual">
                <Input
                  type="number" inputMode="numeric" placeholder="Ex: 1280"
                  value={form.mmr_atual} onChange={(e) => set("mmr_atual", e.target.value)}
                />
              </Field>
            </div>
            <div className="rounded-xl glass px-3 py-2 text-sm">
              <span className="text-muted-foreground">Variação automática: </span>
              <span className={
                variacaoAuto === "subiu" ? "text-primary font-bold"
                : variacaoAuto === "caiu" ? "text-destructive font-bold"
                : "text-muted-foreground font-bold"
              }>
                {variacaoAuto === "subiu" ? "▲ Subiu" : variacaoAuto === "caiu" ? "▼ Caiu" : "▬ Manteve"}
                {diff != null && diff !== 0 && ` (${diff > 0 ? "+" : ""}${diff})`}
              </span>
              {prevMMR == null && (
                <span className="text-xs text-muted-foreground ml-2">— primeiro relatório, base zerada</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">✅ Treinos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Check label="1 hora de Free Play" checked={form.freeplay} onChange={(v) => set("freeplay", v)} />
            <Check label="Treino de Mecânicas" checked={form.mecanicas} onChange={(v) => set("mecanicas", v)} />
            <Check label="Replay Review" checked={form.replay_review} onChange={(v) => set("replay_review", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">📈 Avaliação pessoal (0-10)</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <Slider10 label="Rotação" value={form.rotacao} onChange={(v) => set("rotacao", v)} />
            <Slider10 label="Posicionamento" value={form.posicionamento} onChange={(v) => set("posicionamento", v)} />
            <Slider10 label="Tomada de decisão" value={form.decisao} onChange={(v) => set("decisao", v)} />
            <Slider10 label="Consistência" value={form.consistencia} onChange={(v) => set("consistencia", v)} />
            <Slider10 label="Mecânica" value={form.mecanica} onChange={(v) => set("mecanica", v)} />
            <div className="rounded-xl glass px-3 py-2 flex items-center justify-between" style={{ boxShadow: "var(--shadow-glow)" }}>
              <span className="text-sm text-muted-foreground">Nota geral (média)</span>
              <span className="text-2xl font-black text-gradient">{notaGeral.toFixed(1)}<span className="text-xs text-muted-foreground">/10</span></span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">🏆 Evolução, pontos a melhorar e objetivo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="O que você mais evoluiu?">
              <Textarea rows={2} value={form.evolucao} onChange={(e) => set("evolucao", e.target.value)} />
            </Field>
            <Field label="⚠️ O que mais precisa melhorar?">
              <Textarea rows={2} value={form.melhorar} onChange={(e) => set("melhorar", e.target.value)} />
            </Field>
            <Field label="🎯 Objetivo da próxima semana">
              <Textarea rows={2} value={form.objetivo} onChange={(e) => set("objetivo", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={loading} size="lg">
            {loading ? "Salvando..." : editId ? "Salvar alterações" : "Enviar relatório"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-xl glass px-3 py-2 cursor-pointer transition hover:scale-[1.01]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[color:var(--primary)]"
      />
    </label>
  );
}

function Slider10({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="text-primary font-bold">{value}/10</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--primary)]"
      />
    </div>
  );
}
