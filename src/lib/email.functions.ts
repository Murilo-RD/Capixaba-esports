import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getEmailsByRole(role: "owner" | "player"): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("role", role);
  const ids = (roles ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("id", ids);
  return (profiles ?? []).map((profile) => profile.email).filter(Boolean) as string[];
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  return data?.email ?? null;
}

export const notifyNewCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    nick: z.string(),
    quick: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { sendGmail, wrapHtml } = await import("./email.server");
    const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";
    const owners = await getEmailsByRole("owner");
    const recipients = Array.from(new Set(owners));
    if (!recipients.length) return { ok: true, sent: 0 };
    const html = wrapHtml(
      "Nova candidatura recebida",
      `<p><strong>${data.nick}</strong> enviou uma ${data.quick ? "solicitação rápida" : "candidatura completa"}.</p>
       <p>Acesse o painel de administração para ver os detalhes e agendar a reunião.</p>
       <p><a href="${appUrl}/admin" style="color:#7c5cff">Abrir painel</a></p>`
    );
    for (const to of recipients) {
      try { await sendGmail(to, "🆕 Nova candidatura - Capixaba Esports", html); } catch (e) { console.error(e); }
    }
    return { ok: true, sent: recipients.length };
  });

export const notifyMeetingScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    candidateUserId: z.string().uuid(),
    nick: z.string(),
    meetingAt: z.string(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { sendGmail, wrapHtml } = await import("./email.server");
    const discordUrl = process.env.DISCORD_URL ?? "https://discord.gg/zXFKNtwkGz";
    const to = await getUserEmail(data.candidateUserId);
    if (!to) return { ok: false, reason: "no_email" };
    const when = new Date(data.meetingAt).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
    const html = wrapHtml(
      "Sua reunião foi agendada 🎉",
      `<p>Olá <strong>${data.nick}</strong>,</p>
       <p>A administração da Capixaba Esports agendou sua reunião para:</p>
       <p style="font-size:18px;padding:12px;background:#1f1f2e;border-radius:8px;text-align:center">
         📅 <strong>${when}</strong>
       </p>
       <p>A reunião acontecerá no nosso Discord. Entre no horário combinado:</p>
       <p><a href="${discordUrl}" style="color:#7c5cff">🎧 Entrar no Discord</a></p>`
    );
    try { await sendGmail(to, "📅 Reunião agendada - Capixaba Esports", html); }
    catch (e) { console.error(e); return { ok: false }; }
    return { ok: true };
  });
