import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Youtube, Play, ExternalLink } from "lucide-react";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

type Training = Database["public"]["Tables"]["trainings"]["Row"];
type TrainingVideo = Database["public"]["Tables"]["training_videos"]["Row"];
type Level = Database["public"]["Enums"]["training_level"];

export const Route = createFileRoute("/_authenticated/treinos")({
  component: TreinosPage,
});

const LEVELS: { value: Level; label: string; color: string }[] = [
  { value: "platina", label: "Platina", color: "text-cyan-300" },
  { value: "diamante", label: "Diamante", color: "text-sky-300" },
  { value: "champion", label: "Champion", color: "text-purple-300" },
  { value: "grand_champion", label: "Grand Champion", color: "text-red-300" },
  { value: "ssl", label: "Supersonic Legend", color: "text-amber-300" },
];

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // youtu.be/ID
  let m = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/watch?v=ID
  m = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/embed/ID  or  /shorts/ID
  m = trimmed.match(/youtube\.com\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  // Raw ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

function TreinosPage() {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    (async () => {
      const page = await secureRead<{ isOwner: boolean }>("trainings.page", {});
      setIsOwner(page.isOwner);
    })().catch(() => setIsOwner(false));
  }, []);

  return (
    <AppShell>
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-black">
          🎯 TREINOS <span className="text-gradient">SUGERIDOS</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Códigos de treino e vídeos de exemplo organizados por rank
        </p>
      </div>

      <Tabs defaultValue="codigos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="codigos">🎮 Códigos</TabsTrigger>
          <TabsTrigger value="videos"><Youtube className="h-4 w-4 mr-1.5" /> Vídeos</TabsTrigger>
        </TabsList>

        <TabsContent value="codigos" className="mt-4">
          <CodigosTab isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="videos" className="mt-4">
          <VideosTab isOwner={isOwner} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* -------- Códigos -------- */

function CodigosTab({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nivel, setNivel] = useState<Level>("platina");
  const [filter, setFilter] = useState<Level | "todos">("todos");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Training | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["trainings"],
    queryFn: async () => (await secureRead<{ trainings: Training[] }>("trainings.page", {})).trainings,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !codigo.trim()) return;
    setSaving(true);
    try {
      await secureWrite("trainings.create", { nome: nome.trim(), codigo: codigo.trim(), nivel });
      toast.success("Treino cadastrado!");
      setNome(""); setCodigo("");
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await secureWrite("trainings.delete", { id: toDelete.id });
      toast.success("Treino removido.");
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["trainings"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const filtered = (data ?? []).filter((t) => filter === "todos" || t.nivel === filter);
  const grouped: Record<Level, Training[]> = {
    platina: [], diamante: [], champion: [], grand_champion: [], ssl: [],
  };
  for (const t of filtered) grouped[t.nivel].push(t);

  return (
    <>
      {isOwner && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">➕ Cadastrar novo código</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome do treino</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Aerial Shots" required />
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex: A503-264F-..." required />
              </div>
              <div className="space-y-2">
                <Label>Nível</Label>
                <Select value={nivel} onValueChange={(v) => setNivel(v as Level)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-4 flex justify-end">
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <LevelFilter value={filter} onChange={setFilter} />

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum treino cadastrado ainda.</p>
      )}

      <div className="space-y-6">
        {LEVELS.map((l) => grouped[l.value].length > 0 && (
          <div key={l.value}>
            <h2 className={`text-base sm:text-lg font-black mb-3 ${l.color}`}>{l.label}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[l.value].map((t) => (
                <Card key={t.id} className="hover:border-primary/50 transition">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{t.nome}</div>
                        <code className="text-xs text-primary font-mono break-all">{t.codigo}</code>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => { navigator.clipboard.writeText(t.codigo); toast.success("Código copiado!"); }}
                        >
                          Copiar
                        </Button>
                        {isOwner && (
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10"
                            onClick={() => setToDelete(t)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir treino?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && <>O treino <strong>{toDelete.nome}</strong> será removido.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------- Vídeos -------- */

function VideosTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [url, setUrl] = useState("");
  const [nivel, setNivel] = useState<Level>("platina");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Level | "todos">("todos");
  const [toDelete, setToDelete] = useState<TrainingVideo | null>(null);
  const [playing, setPlaying] = useState<TrainingVideo | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["training-videos"],
    queryFn: async () => (await secureRead<{ videos: TrainingVideo[] }>("trainings.page", {})).videos,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ytId = extractYouTubeId(url);
    if (!titulo.trim()) { toast.error("Informe o título."); return; }
    if (!ytId) { toast.error("Link do YouTube inválido. Cole a URL completa."); return; }
    setSaving(true);
    try {
      await secureWrite("trainingVideos.create", {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        youtube_url: url.trim(),
        youtube_id: ytId,
        nivel,
      });
      toast.success("Vídeo cadastrado!");
      setTitulo(""); setDescricao(""); setUrl("");
      qc.invalidateQueries({ queryKey: ["training-videos"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await secureWrite("trainingVideos.delete", { id: toDelete.id });
      toast.success("Vídeo removido.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["training-videos"] });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const filtered = (data ?? []).filter((t) => filter === "todos" || t.nivel === filter);
  const grouped: Record<Level, TrainingVideo[]> = {
    platina: [], diamante: [], champion: [], grand_champion: [], ssl: [],
  };
  for (const t of filtered) grouped[t.nivel].push(t);

  return (
    <>
      {isOwner && (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Youtube className="h-4 w-4" /> Cadastrar novo vídeo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-2 sm:col-span-2">
                <Label>Título</Label>
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Como fazer flip reset" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Link do YouTube</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." required />
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label>Descrição (opcional)</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Explique o objetivo do vídeo, quando usar essa jogada..." />
              </div>
              <div className="space-y-2">
                <Label>Nível</Label>
                <Select value={nivel} onValueChange={(v) => setNivel(v as Level)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-4 flex justify-end">
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar vídeo"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <LevelFilter value={filter} onChange={setFilter} />

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center">
          <Youtube className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum vídeo cadastrado ainda.</p>
        </div>
      )}

      <div className="space-y-6">
        {LEVELS.map((l) => grouped[l.value].length > 0 && (
          <div key={l.value}>
            <h2 className={`text-base sm:text-lg font-black mb-3 ${l.color}`}>{l.label}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[l.value].map((v) => (
                <Card key={v.id} className="overflow-hidden hover:border-primary/50 transition group">
                  <button onClick={() => setPlaying(v)} className="block relative w-full aspect-video bg-black">
                    <img
                      src={`https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`}
                      alt={v.titulo}
                      className="w-full h-full object-cover group-hover:opacity-70 transition"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="rounded-full bg-primary/90 p-3 shadow-[var(--shadow-glow)] group-hover:scale-110 transition">
                        <Play className="h-6 w-6 text-primary-foreground fill-current" />
                      </div>
                    </div>
                  </button>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm sm:text-base truncate">{v.titulo}</div>
                        {v.descricao && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.descricao}</p>
                        )}
                      </div>
                      {isOwner && (
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => setToDelete(v)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <a
                      href={v.youtube_url} target="_blank" rel="noreferrer"
                      className="mt-2 text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      Abrir no YouTube <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Player modal */}
      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-base sm:text-lg pr-6">{playing?.titulo}</DialogTitle>
          </DialogHeader>
          {playing && (
            <div className="aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${playing.youtube_id}?autoplay=1&rel=0`}
                title={playing.titulo}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {playing?.descricao && (
            <div className="p-4 text-sm text-muted-foreground">{playing.descricao}</div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vídeo?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && <>O vídeo <strong>{toDelete.titulo}</strong> será removido.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LevelFilter({ value, onChange }: { value: Level | "todos"; onChange: (v: Level | "todos") => void }) {
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <Chip active={value === "todos"} onClick={() => onChange("todos")}>Todos</Chip>
      {LEVELS.map((l) => (
        <Chip key={l.value} active={value === l.value} onClick={() => onChange(l.value)}>
          {l.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "text-xs sm:text-sm px-3 py-1.5 rounded-full transition shrink-0 " +
        (active
          ? "glass-strong text-primary border border-primary/40"
          : "glass text-muted-foreground hover:text-foreground")
      }
    >{children}</button>
  );
}
