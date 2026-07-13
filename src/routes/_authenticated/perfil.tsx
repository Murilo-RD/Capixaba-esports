import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { PlayerEvolutionChart } from "@/components/PlayerEvolutionChart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, User as UserIcon, ExternalLink } from "lucide-react";
import { syncTrackerProfile } from "@/lib/tracker.functions";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

const PLATFORMS = [
  { value: "epic", label: "Epic Games" },
  { value: "steam", label: "Steam" },
  { value: "psn", label: "PlayStation (PSN)" },
  { value: "xbl", label: "Xbox Live" },
  { value: "switch", label: "Nintendo Switch" },
];

function PerfilPage() {
  const qc = useQueryClient();
  const sync = useServerFn(syncTrackerProfile);

  const [email, setEmail] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [nick, setNick] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [loading, setLoading] = useState(false);

  const [platform, setPlatform] = useState("epic");
  const [rlId, setRlId] = useState("");
  const [syncing, setSyncing] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: myReports } = useQuery({
    queryKey: ["my-evolution-reports", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("semana,created_at,rank_atual,mmr_atual,variacao,freeplay,mecanicas,replay_review,nota_geral,rotacao,posicionamento,decisao,consistencia,mecanica")
        .eq("user_id", uid!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      setUid(u.user.id);
    })();
  }, []);

  useEffect(() => {
    if (profile) {
      setNick(profile.nick ?? "");
      setPlatform(profile.platform ?? "epic");
      setRlId(profile.rocket_league_id ?? "");
    }
  }, [profile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ nick }).eq("id", uid);
      if (error) throw error;
      toast.success("Perfil atualizado.");
      qc.invalidateQueries({ queryKey: ["profile", uid] });
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 6) { toast.error("Senha mínima de 6 caracteres."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("Senha alterada.");
      setNewPwd("");
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    if (!rlId.trim()) { toast.error("Informe seu ID/nome no Rocket League."); return; }
    setSyncing(true);
    try {
      await sync({ data: { platform, identifier: rlId.trim() } });
      toast.success("Perfil sincronizado com a Tracker Network!");
      qc.invalidateQueries({ queryKey: ["profile", uid] });
      qc.invalidateQueries({ queryKey: ["public-roster"] });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao sincronizar");
    } finally { setSyncing(false); }
  }

  return (
    <AppShell>
      <h1 className="text-2xl sm:text-3xl font-black mb-5 sm:mb-6">
        Meu <span className="text-gradient">perfil</span>
      </h1>

      {/* Cartão de identidade */}
      <Card className="mb-6 glass border-0">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-primary/40 bg-primary/10 grid place-items-center shrink-0">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt={profile.nick ?? ""} className="w-full h-full object-cover" />
                : <UserIcon className="h-8 w-8 text-primary/60" />}
            </div>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-black text-gradient truncate">{profile?.nick ?? "Jogador"}</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
              {profile?.tracker_synced_at && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Sincronizado {new Date(profile.tracker_synced_at).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
          </div>

          {/* Ranks */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
            <RankStat label="1v1" mmr={profile?.mmr_1v1} rank={profile?.rank_1v1} />
            <RankStat label="2v2" mmr={profile?.mmr_2v2} rank={profile?.rank_2v2} />
            <RankStat label="3v3" mmr={profile?.mmr_3v3} rank={profile?.rank_3v3} />
          </div>
        </CardContent>
      </Card>

      {/* Evolução */}
      <div className="mb-6">
        <PlayerEvolutionChart reports={myReports ?? []} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        {/* Sync Tracker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Sincronizar Rocket League
            </CardTitle>
            <CardDescription className="text-xs">
              Puxa seus ranks e MMR direto da Tracker Network usando seu ID de jogador.
              <a href="https://rocketleague.tracker.network/" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-1">
                onde encontrar meu ID? <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSync} className="space-y-3">
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ID do jogador</Label>
                <Input value={rlId} onChange={(e) => setRlId(e.target.value)} placeholder="Ex: SeuNick ou ID Epic" />
                <p className="text-[10px] text-muted-foreground">
                  Epic: seu nome de exibição. Steam: SteamID64. PSN/Xbox: seu gamertag.
                </p>
              </div>
              <Button type="submit" disabled={syncing} className="w-full">
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Sincronizando..." : "Sincronizar agora"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Dados */}
        <Card>
          <CardHeader><CardTitle className="text-base">Dados da conta</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2"><Label>E-mail</Label><Input value={email} disabled /></div>
              <div className="space-y-2"><Label>Nick</Label><Input required value={nick} onChange={(e) => setNick(e.target.value)} /></div>
              <Button type="submit" disabled={loading}>Salvar</Button>
            </form>
          </CardContent>
        </Card>

        {/* Senha */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Alterar senha</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="flex gap-3 flex-wrap items-end">
              <div className="space-y-2 flex-1 min-w-[200px]">
                <Label>Nova senha</Label>
                <Input type="password" minLength={6} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading || !newPwd}>Atualizar senha</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function RankStat({ label, mmr, rank }: { label: string; mmr: number | null | undefined; rank: string | null | undefined }) {
  return (
    <div className="rounded-xl glass px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-lg sm:text-xl font-black mt-1 tabular-nums">
        {mmr ?? "—"}
        {mmr != null && <span className="text-[10px] text-muted-foreground"> MMR</span>}
      </div>
      <div className="text-[10px] sm:text-xs text-primary/80 truncate mt-0.5">{rank ?? "sem dados"}</div>
    </div>
  );
}
