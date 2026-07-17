import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";

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

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultForm() {
  return {
    rival_team_id: "",
    competition: "",
    our_score: 0,
    rival_score: 0,
    has_result: false,
    played_at: todayInputValue(),
    notes: "",
  };
}

function normalizeDateInput(value: string) {
  return value.slice(0, 10);
}

function formatDateBR(value: string) {
  const [year, month, day] = normalizeDateInput(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function hasMatchResult(match: Match) {
  return match.our_score !== null && match.rival_score !== null;
}

export function MatchesPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState(defaultForm);
  const [editing, setEditing] = useState<Match | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["rival-teams"],
    queryFn: async () => secureRead<Team[]>("rivalTeams.list", {}),
  });

  const { data: matches, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => secureRead<Match[]>("matches.list", {}),
  });

  function resetForm() {
    setEditing(null);
    setForm(defaultForm());
  }

  function startEdit(match: Match) {
    setEditing(match);
    setForm({
      rival_team_id: match.rival_team_id,
      competition: match.competition,
      our_score: match.our_score ?? 0,
      rival_score: match.rival_score ?? 0,
      has_result: hasMatchResult(match),
      played_at: normalizeDateInput(match.played_at),
      notes: match.notes ?? "",
    });
  }

  async function save() {
    if (!form.rival_team_id) {
      toast.error("Selecione uma equipe rival.");
      return;
    }
    if (!form.competition.trim()) {
      toast.error("Informe a competicao.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        rival_team_id: form.rival_team_id,
        competition: form.competition.trim(),
        our_score: form.has_result ? form.our_score : null,
        rival_score: form.has_result ? form.rival_score : null,
        played_at: normalizeDateInput(form.played_at),
        notes: form.notes || null,
      };

      if (editing) {
        await secureWrite("matches.update", { id: editing.id, ...payload });
        toast.success("Jogo atualizado!");
      } else {
        await secureWrite("matches.create", payload);
        toast.success(form.has_result ? "Jogo cadastrado!" : "Jogo agendado!");
      }
      resetForm();
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
      if (editing?.id === id) resetForm();
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="text-base">
            {editing ? "Editar jogo" : "Cadastrar jogo"}
          </CardTitle>
        </CardHeader>
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
            <Label>Competicao</Label>
            <Input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} placeholder="Ex: Copa Capixaba 2026" />
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={form.played_at} onChange={(e) => setForm({ ...form, played_at: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3 rounded-md glass px-3 py-2">
            <Checkbox
              id="match-has-result"
              checked={form.has_result}
              onCheckedChange={(checked) => setForm({ ...form, has_result: checked === true })}
            />
            <Label htmlFor="match-has-result" className="cursor-pointer">
              Resultado ja definido
            </Label>
          </div>
          {form.has_result && (
            <>
              <div className="space-y-2">
                <Label>Nosso placar</Label>
                <Input type="number" min={0} value={form.our_score} onChange={(e) => setForm({ ...form, our_score: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Placar rival</Label>
                <Input type="number" min={0} value={form.rival_score} onChange={(e) => setForm({ ...form, rival_score: Number(e.target.value) })} />
              </div>
            </>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>Observacoes (opcional)</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alteracoes" : form.has_result ? "Cadastrar jogo" : "Agendar jogo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Jogos cadastrados</h3>
        {isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {(matches ?? []).map((m) => {
            const hasResult = hasMatchResult(m);
            return (
              <div key={m.id} className="rounded-2xl glass p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {formatDateBR(m.played_at)} - {m.competition}
                  </div>
                  <div className="font-bold mt-1">
                    {hasResult
                      ? <>Capixaba {m.our_score} x {m.rival_score} {m.rival_teams?.name}</>
                      : <>Capixaba x {m.rival_teams?.name} <span className="text-xs text-primary">Agendado</span></>}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(m)}
                  className="hover:text-primary"
                  title={hasResult ? "Editar jogo" : "Adicionar resultado"}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(m.id)} className="text-destructive hover:text-destructive" title="Excluir jogo">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {!isLoading && !matches?.length && <p className="text-muted-foreground text-sm">Nenhum jogo cadastrado ainda.</p>}
        </div>
      </div>
    </div>
  );
}
