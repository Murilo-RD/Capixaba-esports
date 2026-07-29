import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Award, Pencil, Trash2, Trophy, Upload, X } from "lucide-react";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type TeamTitle = {
  id: string;
  tournament_name: string;
  championship_logo_url: string | null;
  trophy_image_url: string | null;
  achieved_at: string | null;
  notes: string | null;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export function TeamTitlesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TeamTitle | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tournament_name: "",
    championship_logo_url: null as string | null,
    trophy_image_url: null as string | null,
    achieved_at: "",
    notes: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["team-titles"],
    queryFn: async () => secureRead<TeamTitle[]>("teamTitles.list", {}),
  });

  function resetForm() {
    setEditing(null);
    setForm({
      tournament_name: "",
      championship_logo_url: null,
      trophy_image_url: null,
      achieved_at: "",
      notes: "",
    });
  }

  function startEdit(title: TeamTitle) {
    setEditing(title);
    setForm({
      tournament_name: title.tournament_name,
      championship_logo_url: title.championship_logo_url,
      trophy_image_url: title.trophy_image_url,
      achieved_at: title.achieved_at?.slice(0, 10) ?? "",
      notes: title.notes ?? "",
    });
  }

  async function onImage(
    e: React.ChangeEvent<HTMLInputElement>,
    field: "championship_logo_url" | "trophy_image_url",
  ) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 900_000) {
      toast.error("Imagem muito grande (max 900KB).");
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    setForm((current) => ({ ...current, [field]: dataUrl }));
  }

  async function save() {
    if (!form.tournament_name.trim()) {
      toast.error("Informe o nome do torneio ou campeonato.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tournament_name: form.tournament_name.trim(),
        championship_logo_url: form.championship_logo_url,
        trophy_image_url: form.trophy_image_url,
        achieved_at: form.achieved_at || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        await secureWrite("teamTitles.update", { id: editing.id, ...payload });
        toast.success("Titulo atualizado!");
      } else {
        await secureWrite("teamTitles.create", payload);
        toast.success("Titulo cadastrado!");
      }

      resetForm();
      qc.invalidateQueries({ queryKey: ["team-titles"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este titulo?")) return;
    try {
      await secureWrite("teamTitles.delete", { id });
      toast.success("Titulo removido.");
      if (editing?.id === id) resetForm();
      qc.invalidateQueries({ queryKey: ["team-titles"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass border-0">
        <CardHeader>
          <CardTitle className="text-base">
            {editing ? "Editar titulo" : "Cadastrar titulo"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nome do torneio ou campeonato</Label>
            <Input
              value={form.tournament_name}
              onChange={(e) => setForm({ ...form, tournament_name: e.target.value })}
              placeholder="Ex: Copa Capixaba 2026"
            />
          </div>
          <div className="space-y-2">
            <Label>Data do titulo (opcional)</Label>
            <Input
              type="date"
              value={form.achieved_at}
              onChange={(e) => setForm({ ...form, achieved_at: e.target.value })}
            />
          </div>
          <ImagePicker
            label="Logo do campeonato"
            value={form.championship_logo_url}
            onChange={(e) => onImage(e, "championship_logo_url")}
            onRemove={() => setForm({ ...form, championship_logo_url: null })}
            icon={<Award className="h-4 w-4" />}
          />
          <ImagePicker
            label="Foto do trofeu (opcional)"
            value={form.trophy_image_url}
            onChange={(e) => onImage(e, "trophy_image_url")}
            onRemove={() => setForm({ ...form, trophy_image_url: null })}
            icon={<Trophy className="h-4 w-4" />}
          />
          <div className="space-y-2 sm:col-span-2">
            <Label>Observacoes (opcional)</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ex: Campeao invicto, melhor campanha..."
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar
              </Button>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editing ? "Salvar alteracoes" : "Cadastrar titulo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Titulos cadastrados</h3>
        {isLoading && <p className="text-muted-foreground text-sm">Carregando...</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {(data ?? []).map((title) => (
            <div key={title.id} className="rounded-2xl glass p-4 flex items-center gap-3">
              {title.championship_logo_url
                ? <img src={title.championship_logo_url} alt={title.tournament_name} className="h-14 w-14 object-contain" />
                : <div className="h-14 w-14 rounded-md glass grid place-items-center text-xs text-muted-foreground">sem logo</div>}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{title.tournament_name}</div>
                <div className="text-xs text-muted-foreground">
                  {title.achieved_at ? formatDateBR(title.achieved_at) : "Sem data"}
                </div>
              </div>
              {title.trophy_image_url && (
                <img src={title.trophy_image_url} alt="Trofeu" className="hidden sm:block h-12 w-12 object-contain rounded-md" />
              )}
              <Button size="icon" variant="ghost" onClick={() => startEdit(title)} className="hover:text-primary" title="Editar titulo">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(title.id)} className="text-destructive hover:text-destructive" title="Excluir titulo">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!isLoading && !data?.length && <p className="text-muted-foreground text-sm">Nenhum titulo cadastrado ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function ImagePicker({
  label,
  value,
  icon,
  onChange,
  onRemove,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="preview" className="h-12 w-12 object-contain rounded-md glass p-1" />}
        <label className="inline-flex items-center gap-2 rounded-md glass px-3 py-2 text-sm cursor-pointer hover:bg-white/10">
          <Upload className="h-4 w-4" /> {icon} Escolher
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onChange} />
        </label>
        {value && (
          <Button type="button" size="icon" variant="ghost" onClick={onRemove} title="Remover imagem">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDateBR(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
