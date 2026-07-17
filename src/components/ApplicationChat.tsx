import { useEffect, useRef, useState } from "react";
import { secureRead, secureWrite } from "@/lib/secure-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string;
  application_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export function ApplicationChat({
  applicationId,
  currentUserId,
  applicantUserId,
}: {
  applicationId: string;
  currentUserId: string;
  applicantUserId: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    async function loadMessages() {
      const data = await secureRead<Msg[]>("messages.list", { applicationId });
      if (!mounted) return;
      setMsgs((data ?? []) as Msg[]);
    }

    loadMessages().catch((err) => toast.error(err.message));
    const interval = window.setInterval(() => {
      loadMessages().catch(() => undefined);
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [applicationId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const message = await secureWrite<Msg>("messages.send", { applicationId, content });
      setMsgs((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, message]);
      setText("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[420px] rounded-xl glass overflow-hidden">
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nenhuma mensagem ainda. Diga oi 👋</p>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === currentUserId;
          const fromApplicant = m.sender_id === applicantUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-primary text-primary-foreground"
                    : "glass-strong text-foreground"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
                  {mine ? "Você" : fromApplicant ? "Candidato" : "Administração"}
                </div>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className="text-[10px] opacity-60 mt-1 text-right">
                  {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-2 flex gap-2 bg-background/40">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Escreva uma mensagem..."
          autoComplete="off"
        />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
