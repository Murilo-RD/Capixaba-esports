import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Upload, X } from "lucide-react";

type Team = { id: string; name: string; logo_url: string | null };

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export function RivalTeamsPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rival-teams"],
    queryFn: async () => secureRead<Team[]>("rivalTeams.list", {}),
  });

  function resetForm() {
    setEditing(null);
    setName("");
    setLogo(null);
  }

  function startEdit(team: Team) {
    setEditing(team);
    setName(team.name);
    setLogo(team.logo_url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) {
      toast.error("Logo muito grande (max 500KB).");
      return;
    }
    setLogo(await fileToDataUrl(f));
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await secureWrite("rivalTeams.update", { id: editing.id, name: name.trim(), logo_url: logo });
        toast.success("Equipe atualizada!");
      } else {
        await secureWrite("rivalTeams.create", { name: name.trim(), logo_url: logo });
        toast.success("Equipe cadastrada!");
      }
      resetForm();
      qc.invalidateQueries({ queryKey: ["rival-teams"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta equipe e todos os jogos ligados a ela?")) return;
    try {
      await secureWrite("rivalTeams.delete", { id });
      toast.success("Equipe removida.");
      if (editing?.id === id) resetForm();
      qc.invalidateQueries({ queryKey: ["rival-teams"] });
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
            {editing ? "Editar equipe rival" : "Cadastrar equipe rival"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label>Nome da equipe</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Furia" />
          </div>
          <div className="space-y-2">
            <Label>Logo (PNG, max 500KB)</Label>
            <div className="flex items-center gap-3">
              {logo && <img src={logo} alt="preview" className="h-12 w-12 object-contain rounded-md glass p-1" />}
              <label className="inline-flex items-center gap-2 rounded-md glass px-3 py-2 text-sm cursor-pointer hover:bg-white/10">
                <Upload className="h-4 w-4" /> Escolher
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
              </label>
              {logo && (
                <Button type="button" size="icon" variant="ghost" onClick={() => setLogo(null)} title="Remover logo">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alteracoes" : "Cadastrar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Equipes cadastradas</h3>
        {isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data ?? []).map((t) => (
            <div key={t.id} className="rounded-2xl glass p-4 flex items-center gap-3">
              {t.logo_url
                ? <img src={t.logo_url} alt={t.name} className="h-14 w-14 object-contain" />
                : <div className="h-14 w-14 rounded-md glass grid place-items-center text-xs text-muted-foreground">sem logo</div>}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{t.name}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => startEdit(t)} className="hover:text-primary" title="Editar equipe">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)} className="text-destructive hover:text-destructive" title="Excluir equipe">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!isLoading && !data?.length && <p className="text-muted-foreground text-sm">Nenhuma equipe ainda.</p>}
        </div>
      </div>
    </div>
  );
}
