import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/custom-auth";
import { useServerFn } from "@tanstack/react-start";
import { notifyNewCandidate } from "@/lib/email.functions";
import { AppShell } from "@/components/AppShell";
import { ApplicationChat } from "@/components/ApplicationChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, X, Zap, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/candidatura")({
  component: CandidaturaPage,
});

const PLATAFORMAS = ["PC (Steam/Epic)", "PlayStation", "Xbox", "Nintendo Switch"];
const RANKS = [
  "Bronze","Silver","Gold","Platinum","Diamond","Champion",
  "Grand Champion","Supersonic Legend","Sem rank/Casual",
];
const INTERESSES = [
  "Jogar competitivamente",
  "Ser criador de conteúdo",
  "Caster / Narrador",
  "Organizador",
  "Apoiar a comunidade",
];

const DISCORD_URL = "https://discord.com/invite/CsCpcSF7C8";

function StatusBanner({ status, meetingAt }: { status: string; meetingAt: string | null }) {
  if (status === "pendente") return (
    <Card className="border-yellow-500/40">
      <CardHeader><CardTitle>⏳ Candidatura recebida — reunião a ser marcada</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Recebemos sua solicitação! A administração vai analisar sua disponibilidade e marcar uma reunião com você.</p>
        <p><strong>Fique atento a esta página</strong> — assim que a reunião for agendada, a data e hora aparecerão aqui.</p>
        <p>A reunião acontecerá no nosso Discord:</p>
        <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="inline-block rounded-md glass-strong px-4 py-2 text-primary hover:shadow-[var(--shadow-glow)] transition">
          🎧 Entrar no Discord da Capixaba
        </a>
      </CardContent>
    </Card>
  );
  if (status === "reuniao") return (
    <Card className="border-primary/50">
      <CardHeader><CardTitle>📅 Reunião agendada</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {meetingAt
          ? <p>Sua reunião está marcada para <strong>{new Date(meetingAt).toLocaleString("pt-BR")}</strong>.</p>
          : <p>A administração agendará sua reunião em breve.</p>}
        <p>A reunião acontecerá no nosso Discord — entre no horário combinado:</p>
        <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="inline-block rounded-md glass-strong px-4 py-2 text-primary hover:shadow-[var(--shadow-glow)] transition">
          🎧 Entrar no Discord da Capixaba
        </a>
      </CardContent>
    </Card>
  );
  if (status === "reprovado") return (
    <Card className="border-destructive/50">
      <CardHeader><CardTitle>❌ Candidatura não aprovada</CardTitle></CardHeader>
      <CardContent>Obrigado pelo interesse. No momento sua candidatura não foi aprovada.</CardContent>
    </Card>
  );
  return null;
}

function CandidaturaPage() {
  const navigate = useNavigate();
  const notifyNew = useServerFn(notifyNewCandidate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("pendente");
  const [meetingAt, setMeetingAt] = useState<string | null>(null);
  const [hasApp, setHasApp] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "full" | "quick">("choose");
  const [form, setForm] = useState({
    nick: "", idade: 18, do_es: true, cidade: "", plataforma: "PC (Steam/Epic)",
    rank_atual: "Diamond", ja_participou_camp: false, possui_equipe: false,
    nome_equipe: "", objetivo: "", interesse: "Jogar competitivamente",
    discord: "", entrar_servidor: true,
  });
  const [slots, setSlots] = useState<string[]>([]);
  const [slotInput, setSlotInput] = useState("");

  useEffect(() => {
    (async () => {
      const user = getCurrentUser();
      if (!user) return;
      setUserId(user.id);
      const { data: p } = await supabase.from("profiles").select("status, meeting_at, nick").eq("id", user.id).maybeSingle();
      if (p) {
        setStatus(p.status);
        setMeetingAt(p.meeting_at);
        if (p.status === "aprovado") { navigate({ to: "/relatorio" }); return; }
        setForm((f) => ({ ...f, nick: p.nick ?? "" }));
      }
      const { data: app } = await supabase.from("applications").select("*").eq("user_id", user.id).maybeSingle();
      if (app) {
        setHasApp(true);
        setAppId(app.id);
        setMode(app.quick_request ? "quick" : "full");
        setForm({
          nick: app.nick, idade: app.idade ?? 18, do_es: app.do_es ?? true, cidade: app.cidade ?? "",
          plataforma: app.plataforma ?? "PC (Steam/Epic)", rank_atual: app.rank_atual ?? "Diamond",
          ja_participou_camp: app.ja_participou_camp ?? false, possui_equipe: app.possui_equipe ?? false,
          nome_equipe: app.nome_equipe ?? "", objetivo: app.objetivo ?? "",
          interesse: app.interesse ?? "Jogar competitivamente", discord: app.discord ?? "",
          entrar_servidor: app.entrar_servidor ?? true,
        });
        setSlots(Array.isArray(app.available_slots) ? (app.available_slots as string[]) : []);
      }
      setLoading(false);
    })();
  }, [navigate]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addSlot() {
    const s = slotInput.trim();
    if (!s) return;
    setSlots((prev) => Array.from(new Set([...prev, s])));
    setSlotInput("");
  }
  function addSlotDT(dt: string) {
    if (!dt) return;
    const d = new Date(dt);
    const label = d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    setSlots((prev) => Array.from(new Set([...prev, label])));
  }
  function removeSlot(s: string) {
    setSlots((prev) => prev.filter((x) => x !== s));
  }

  async function submitFull(e: React.FormEvent) {
    e.preventDefault();
    // extra guards: nothing can be blank
    const requiredText: Array<[string, string]> = [
      ["nick", form.nick], ["cidade", form.cidade], ["objetivo", form.objetivo],
      ["discord", form.discord],
    ];
    for (const [k, v] of requiredText) {
      if (!String(v ?? "").trim()) { toast.error(`Preencha o campo obrigatório: ${k}`); return; }
    }
    if (form.possui_equipe && !form.nome_equipe.trim()) {
      toast.error("Informe o nome da equipe."); return;
    }
    if (slots.length === 0) { toast.error("Adicione pelo menos uma data/horário de disponibilidade para a reunião."); return; }
    setSaving(true);
    try {
      const user = getCurrentUser();
      if (!user) throw new Error("Sem usuario");
      const payload: any = { ...form, user_id: user.id, available_slots: slots, quick_request: false };
      const { data: saved, error } = hasApp
        ? await supabase.from("applications").update(payload).eq("user_id", user.id).select("id").maybeSingle()
        : await supabase.from("applications").insert(payload).select("id").maybeSingle();
      if (error) throw error;
      await supabase.from("profiles").update({ nick: form.nick }).eq("id", user.id);
      const wasNew = !hasApp;
      toast.success("Candidatura enviada!");
      setHasApp(true);
      if (saved?.id) setAppId(saved.id);
      if (wasNew) { try { await notifyNew({ data: { nick: form.nick, quick: false } }); } catch {} }
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  }

  async function submitQuick() {
    if (!form.nick.trim()) { toast.error("Informe seu nick."); return; }
    if (!form.discord.trim()) { toast.error("Informe seu nick do Discord."); return; }
    if (slots.length === 0) { toast.error("Adicione pelo menos uma data/horário de disponibilidade para a reunião."); return; }
    setSaving(true);
    try {
      const user = getCurrentUser();
      if (!user) throw new Error("Sem usuario");
      const payload: any = {
        user_id: user.id,
        nick: form.nick,
        discord: form.discord,
        available_slots: slots,
        quick_request: true,
      };
      const { data: saved, error } = hasApp
        ? await supabase.from("applications").update(payload).eq("user_id", user.id).select("id").maybeSingle()
        : await supabase.from("applications").insert(payload).select("id").maybeSingle();
      if (error) throw error;
      await supabase.from("profiles").update({ nick: form.nick }).eq("id", user.id);
      const wasNew = !hasApp;
      toast.success("Solicitação enviada!");
      setHasApp(true);
      if (saved?.id) setAppId(saved.id);
      if (wasNew) { try { await notifyNew({ data: { nick: form.nick, quick: true } }); } catch {} }
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSaving(false); }
  }

  if (loading) return <AppShell><p className="text-muted-foreground">Carregando...</p></AppShell>;

  const readOnly = status === "reprovado";

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-black">
          🚀 Quero entrar no <span className="text-gradient">Capixaba</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Escolha como quer se apresentar ao time</p>
      </div>

      <div className="mb-6"><StatusBanner status={status} meetingAt={meetingAt} /></div>

      {hasApp && appId && userId && status !== "reprovado" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">💬 Conversa com a administração</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationChat applicationId={appId} currentUserId={userId} applicantUserId={userId} />
          </CardContent>
        </Card>
      )}

      {mode === "choose" && !hasApp && !readOnly && (
        <>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <button onClick={() => setMode("full")} className="text-left rounded-2xl glass p-6 hover:scale-[1.02] hover:shadow-[var(--shadow-glow)] transition-all">
              <ClipboardList className="h-8 w-8 text-primary mb-3" />
              <div className="font-bold text-lg mb-1">Formulário completo</div>
              <p className="text-sm text-muted-foreground">Conte tudo sobre você — plataforma, rank, experiência e objetivos. <strong>Este é o caminho oficial</strong> para entrar no time.</p>
            </button>
            <button onClick={() => setMode("quick")} className="text-left rounded-2xl glass p-6 hover:scale-[1.02] hover:shadow-[var(--shadow-glow)] transition-all opacity-90">
              <Zap className="h-8 w-8 text-accent mb-3" />
              <div className="font-bold text-lg mb-1">Solicitar sem formulário</div>
              <p className="text-sm text-muted-foreground">⚠️ <strong>Apenas para pessoas já convidadas pela administração.</strong> Solicitações enviadas por aqui sem convite prévio não recebem resposta.</p>
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-6 px-1">
            Não foi convidado? Use o <strong>formulário completo</strong> — é o único caminho para novos candidatos.
          </p>
        </>
      )}

      {mode !== "choose" && !hasApp && !readOnly && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => setMode("choose")}>← Trocar tipo de solicitação</Button>
        </div>
      )}

      {mode === "quick" && !hasApp && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">⚡ Solicitação rápida</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <F label="Nick no Rocket League *"><Input required autoComplete="off" value={form.nick} onChange={(e) => set("nick", e.target.value)} /></F>
              <F label="Nick do Discord *"><Input required autoComplete="off" value={form.discord} onChange={(e) => set("discord", e.target.value)} placeholder="ex: capixaba#0001" /></F>
              <div className="sm:col-span-2">
                <SlotsPicker slots={slots} slotInput={slotInput} setSlotInput={setSlotInput} addSlot={addSlot} addSlotDT={addSlotDT} removeSlot={removeSlot} />
              </div>
            </CardContent>
          </Card>
          {!readOnly && (
            <div className="flex justify-end">
              <Button onClick={submitQuick} disabled={saving} size="lg">
                {saving ? "Enviando..." : hasApp ? "Atualizar solicitação" : "Enviar solicitação"}
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === "full" && !hasApp && (
        <form onSubmit={submitFull} autoComplete="off" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Sobre você</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <F label="1️⃣ Nick no Rocket League *"><Input required autoComplete="off" value={form.nick} onChange={(e) => set("nick", e.target.value)} /></F>
              <F label="2️⃣ Idade *"><Input required autoComplete="off" type="number" min={10} max={99} value={form.idade} onChange={(e) => set("idade", Number(e.target.value))} /></F>
              <F label="3️⃣ É do Espírito Santo? *">
                <Select value={form.do_es ? "sim" : "nao"} onValueChange={(v) => set("do_es", v === "sim")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                </Select>
              </F>
              <F label="4️⃣ Cidade *"><Input required autoComplete="off" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} /></F>
              <F label="5️⃣ Plataforma principal *">
                <Select value={form.plataforma} onValueChange={(v) => set("plataforma", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATAFORMAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="6️⃣ Rank atual *">
                <Select value={form.rank_atual} onValueChange={(v) => set("rank_atual", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RANKS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Experiência & equipe</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <F label="7️⃣ Já participou de campeonato? *">
                <Select value={form.ja_participou_camp ? "sim" : "nao"} onValueChange={(v) => set("ja_participou_camp", v === "sim")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                </Select>
              </F>
              <F label="8️⃣ Possui equipe/time? *">
                <Select value={form.possui_equipe ? "sim" : "nao"} onValueChange={(v) => set("possui_equipe", v === "sim")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                </Select>
              </F>
              {form.possui_equipe && (
                <F label="9️⃣ Nome da equipe *">
                  <Input required autoComplete="off" value={form.nome_equipe} onChange={(e) => set("nome_equipe", e.target.value)} />
                </F>
              )}
              <F label="1️⃣1️⃣ Você teria interesse em *">
                <Select value={form.interesse} onValueChange={(v) => set("interesse", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INTERESSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <div className="sm:col-span-2">
                <F label="🔟 Qual seu principal objetivo no Rocket League? *">
                  <Textarea required autoComplete="off" rows={3} value={form.objetivo} onChange={(e) => set("objetivo", e.target.value)} />
                </F>
              </div>
              <F label="1️⃣2️⃣ Nick do Discord *">
                <Input required autoComplete="off" value={form.discord} onChange={(e) => set("discord", e.target.value)} placeholder="ex: capixaba#0001" />
              </F>
              <F label="1️⃣3️⃣ Quer entrar no servidor da comunidade? *">
                <Select value={form.entrar_servidor ? "sim" : "nao"} onValueChange={(v) => set("entrar_servidor", v === "sim")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Não</SelectItem></SelectContent>
                </Select>
              </F>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">📅 Sua disponibilidade para reunião</CardTitle></CardHeader>
            <CardContent>
              <SlotsPicker slots={slots} slotInput={slotInput} setSlotInput={setSlotInput} addSlot={addSlot} addSlotDT={addSlotDT} removeSlot={removeSlot} />
            </CardContent>
          </Card>

          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" disabled={saving} size="lg">
                {saving ? "Salvando..." : hasApp ? "Atualizar candidatura" : "Enviar candidatura"}
              </Button>
            </div>
          )}
        </form>
      )}
    </AppShell>
  );
}

function SlotsPicker({
  slots, slotInput, setSlotInput, addSlot, addSlotDT, removeSlot,
}: {
  slots: string[]; slotInput: string; setSlotInput: (s: string) => void;
  addSlot: () => void; addSlotDT: (dt: string) => void; removeSlot: (s: string) => void;
}) {
  const [dt, setDt] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Escolha por data e hora</Label>
        <div className="flex gap-2 mt-1">
          <Input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => { addSlotDT(dt); setDt(""); }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Ou descreva livremente (ex: "Sáb 20h–22h")</Label>
        <div className="flex gap-2 mt-1">
          <Input value={slotInput} onChange={(e) => setSlotInput(e.target.value)} placeholder="Ex: Segunda 19h–21h" />
          <Button type="button" variant="outline" onClick={addSlot}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {slots.map((s) => (
            <span key={s} className="text-xs px-2 py-1 rounded-md glass flex items-center gap-1">
              {s}
              <button type="button" onClick={() => removeSlot(s)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
