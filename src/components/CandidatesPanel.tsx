import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/custom-auth";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { ApplicationChat } from "@/components/ApplicationChat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Check, X, Eye, MessageCircle } from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  nick: string;
  idade: number | null;
  do_es: boolean | null;
  cidade: string | null;
  plataforma: string | null;
  rank_atual: string | null;
  ja_participou_camp: boolean | null;
  possui_equipe: boolean | null;
  nome_equipe: string | null;
  objetivo: string | null;
  interesse: string | null;
  discord: string | null;
  entrar_servidor: boolean | null;
  available_slots: any;
  quick_request: boolean;
  created_at: string;
  profile?: { status: string; meeting_at: string | null };
};

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function CandidatesPanel() {
  const qc = useQueryClient();
  const [meetingFor, setMeetingFor] = useState<Row | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [detailsFor, setDetailsFor] = useState<Row | null>(null);
  const [chatFor, setChatFor] = useState<Row | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOwnerId(getCurrentUser()?.id ?? null);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["candidatos"],
    queryFn: async () => secureRead<Row[]>("candidates.list", {}),
  });

  async function scheduleMeeting() {
    if (!meetingFor || !meetingDate) return;
    setBusy(true);
    try {
      const parsedDate = new Date(meetingDate);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error("Data e hora invalidas.");
      }

      const meetingAt = parsedDate.toISOString();
      const result = await secureWrite<{ profile?: { status: string; meeting_at: string | null } }>("candidate.status", {
        userId: meetingFor.user_id,
        status: "reuniao",
        meetingAt,
      });
      toast.success("Reunião agendada.");
      qc.setQueryData<Row[]>(["candidatos"], (current) =>
        (current ?? []).map((item) =>
          item.user_id === meetingFor.user_id
            ? {
                ...item,
                profile: {
                  ...(item.profile ?? { status: "pendente", meeting_at: null }),
                  ...(result.profile ?? { status: "reuniao", meeting_at: meetingAt }),
                },
              }
            : item,
        ),
      );
      setMeetingFor(null); setMeetingDate("");
      qc.invalidateQueries({ queryKey: ["candidatos"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(r: Row) {
    setBusy(true);
    try {
      await secureWrite("candidate.status", {
        userId: r.user_id,
        status: "aprovado",
        meetingAt: null,
      });
      toast.success(`${r.nick} aprovado!`);
      qc.invalidateQueries({ queryKey: ["candidatos"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectFor) return;
    setBusy(true);
    try {
      const result = await secureWrite<{ warning?: string | null; loginDisabled?: boolean }>("candidate.reject", {
        userId: rejectFor.user_id,
      });
      if (result.warning) {
        toast.warning(`${rejectFor.nick} recusado. Login nao desativado: ${result.warning}`);
      } else {
        toast.success(result.loginDisabled
          ? `${rejectFor.nick} recusado e login desativado.`
          : `${rejectFor.nick} recusado.`
        );
      }
      setRejectFor(null);
      qc.invalidateQueries({ queryKey: ["candidatos"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data?.length) return <p className="text-muted-foreground">Nenhuma candidatura recebida.</p>;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        {data.map((r) => {
          const status = r.profile?.status ?? "pendente";
          return (
            <Card key={r.id} className="glass border-0">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg text-gradient">{r.nick}</CardTitle>
                    {r.quick_request && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10">
                        Sem formulário
                      </span>
                    )}
                  </div>
                  <StatusChip status={status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  {r.idade ? ` · ${r.idade} anos` : ""}
                  {r.cidade ? ` · ${r.cidade}${r.do_es ? "/ES" : ""}` : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <KV k="Plataforma" v={r.plataforma || "-"} />
                  <KV k="Rank" v={r.rank_atual || "-"} />
                  <KV k="Camp." v={r.ja_participou_camp == null ? "-" : r.ja_participou_camp ? "Sim" : "Não"} />
                  <KV k="Equipe" v={r.possui_equipe ? (r.nome_equipe || "Sim") : r.possui_equipe === false ? "Não" : "-"} />
                  <KV k="Discord" v={r.discord || "-"} />
                  <KV k="Interesse" v={r.interesse || "-"} />
                </div>
                {r.objetivo && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Objetivo</div>
                    <p className="text-foreground/90 whitespace-pre-wrap">{r.objetivo}</p>
                  </div>
                )}
                {Array.isArray(r.available_slots) && r.available_slots.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Horários disponíveis</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.available_slots.map((s: string, i: number) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-md glass">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {r.profile?.meeting_at && (
                  <div className="rounded-lg glass p-2 text-xs">
                    📅 Reunião: <strong>{new Date(r.profile.meeting_at).toLocaleString("pt-BR")}</strong>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setDetailsFor(r)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Formulário
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setChatFor(r)}>
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Chat
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setMeetingFor(r); setMeetingDate(toDateTimeLocal(r.profile?.meeting_at)); }}>
                    <Calendar className="h-3.5 w-3.5 mr-1" /> Agendar
                  </Button>
                  {status !== "aprovado" && (
                    <Button size="sm" onClick={() => approve(r)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => setRejectFor(r)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Recusar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!meetingFor} onOpenChange={(o) => { if (!o && !busy) setMeetingFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar reunião</AlertDialogTitle>
            <AlertDialogDescription>
              Com <strong>{meetingFor?.nick}</strong>. Escolha data e hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Data e hora</Label>
            <Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button onClick={scheduleMeeting} disabled={busy || !meetingDate}>
              {busy ? "Salvando..." : "Agendar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar candidato?</AlertDialogTitle>
            <AlertDialogDescription>
              A candidatura de <strong>{rejectFor?.nick}</strong> será removida, o perfil ficará como reprovado e o login dessa conta será desativado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); reject(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Recusando..." : "Recusar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detailsFor} onOpenChange={(o) => !o && setDetailsFor(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Formulário de {detailsFor?.nick}</DialogTitle>
            <DialogDescription>
              Enviado em {detailsFor && new Date(detailsFor.created_at).toLocaleString("pt-BR")}
              {detailsFor?.quick_request ? " · Solicitação sem formulário" : ""}
            </DialogDescription>
          </DialogHeader>
          {detailsFor && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KV k="Nick" v={detailsFor.nick} />
                <KV k="Idade" v={detailsFor.idade?.toString() ?? "-"} />
                <KV k="Do ES?" v={detailsFor.do_es == null ? "-" : detailsFor.do_es ? "Sim" : "Não"} />
                <KV k="Cidade" v={detailsFor.cidade ?? "-"} />
                <KV k="Plataforma" v={detailsFor.plataforma ?? "-"} />
                <KV k="Rank" v={detailsFor.rank_atual ?? "-"} />
                <KV k="Já em campeonato?" v={detailsFor.ja_participou_camp == null ? "-" : detailsFor.ja_participou_camp ? "Sim" : "Não"} />
                <KV k="Possui equipe?" v={detailsFor.possui_equipe == null ? "-" : detailsFor.possui_equipe ? "Sim" : "Não"} />
                <KV k="Nome equipe" v={detailsFor.nome_equipe ?? "-"} />
                <KV k="Interesse" v={detailsFor.interesse ?? "-"} />
                <KV k="Discord" v={detailsFor.discord ?? "-"} />
                <KV k="Entrar servidor?" v={detailsFor.entrar_servidor == null ? "-" : detailsFor.entrar_servidor ? "Sim" : "Não"} />
              </div>
              {detailsFor.objetivo && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Objetivo</div>
                  <p className="mt-1 whitespace-pre-wrap p-3 rounded-lg glass">{detailsFor.objetivo}</p>
                </div>
              )}
              {Array.isArray(detailsFor.available_slots) && detailsFor.available_slots.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Horários disponíveis</div>
                  <div className="flex flex-wrap gap-1">
                    {detailsFor.available_slots.map((s: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-md glass">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {detailsFor.profile?.meeting_at && (
                <div className="rounded-lg glass p-2 text-xs">
                  📅 Reunião agendada: <strong>{new Date(detailsFor.profile.meeting_at).toLocaleString("pt-BR")}</strong>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chatFor} onOpenChange={(o) => !o && setChatFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chat com {chatFor?.nick}</DialogTitle>
            <DialogDescription>Conversa direta com o candidato.</DialogDescription>
          </DialogHeader>
          {chatFor && ownerId && (
            <ApplicationChat
              applicationId={chatFor.id}
              currentUserId={ownerId}
              applicantUserId={chatFor.user_id}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
    reuniao: "border-primary/40 text-primary bg-primary/10",
    aprovado: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
    reprovado: "border-destructive/40 text-destructive bg-destructive/10",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${map[status]}`}>{status}</span>;
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
