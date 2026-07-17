import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

type Team = { id: string; name: string; logo_url: string | null };
type Match = {
  id: string; rival_team_id: string; competition: string;
  our_score: number; rival_score: number; played_at: string; notes: string | null;
  rival_teams?: Team;
};

export function MatchesPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    rival_team_id: "",
    competition: "",
    our_score: 0,
    rival_score: 0,
    played_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["rival-teams"],
    queryFn: async () => secureRead<Team[]>("rivalTeams.list", {}),
  });

  const { data: matches, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => secureRead<Match[]>("matches.list", {}),
  });

  async function save() {
    if (!form.rival_team_id) { toast.error("Selecione uma equipe rival."); return; }
    if (!form.competition.trim()) { toast.error("Informe a competição."); return; }
    setSaving(true);
    try {
      await secureWrite("matches.create", {
        rival_team_id: form.rival_team_id,
        competition: form.competition.trim(),
        our_score: form.our_score,
        rival_score: form.rival_score,
        played_at: form.played_at,
        notes: form.notes || null,
      });
      toast.success("Jogo cadastrado!");
      setForm({ ...form, competition: "", our_score: 0, rival_score: 0, notes: "" });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este jogo?")) return;
    try {
      await secureWrite("matches.delete", { id });
      toast.success("Jogo removido.");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass border-0">
        <CardHeader><CardTitle className="text-base">➕ Cadastrar jogo</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Equipe rival</Label>
            <Select value={form.rival_team_id} onValueChange={(v) => setForm({ ...form, rival_team_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!teams?.length && (
              <p className="text-xs text-muted-foreground">
                Cadastre uma equipe rival primeiro na aba "Equipes".
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Competição</Label>
            <Input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} placeholder="Ex: Copa Capixaba 2026" />
          </div>
          <div className="space-y-2">
            <Label>Nosso placar</Label>
            <Input type="number" min={0} value={form.our_score} onChange={(e) => setForm({ ...form, our_score: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Placar rival</Label>
            <Input type="number" min={0} value={form.rival_score} onChange={(e) => setForm({ ...form, rival_score: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={form.played_at} onChange={(e) => setForm({ ...form, played_at: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observações (opcional)</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Cadastrar jogo"}</Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Jogos cadastrados</h3>
        {isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {(matches ?? []).map((m) => (
            <div key={m.id} className="rounded-2xl glass p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">
                  {new Date(m.played_at).toLocaleDateString("pt-BR")} · {m.competition}
                </div>
                <div className="font-bold mt-1">
                  Capixaba {m.our_score} × {m.rival_score} {m.rival_teams?.name}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(m.id)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!isLoading && !matches?.length && <p className="text-muted-foreground text-sm">Nenhum jogo cadastrado ainda.</p>}
        </div>
      </div>
    </div>
  );
}
