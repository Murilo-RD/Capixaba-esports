import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/weekly-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendGmail, wrapHtml } = await import("@/lib/email.server");
        const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

        const { data: players } = await supabaseAdmin
          .from("user_roles").select("user_id").eq("role", "player");
        const ids = (players ?? []).map((p) => p.user_id);
        if (!ids.length) {
          return new Response(JSON.stringify({ ok: true, sent: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const html = wrapHtml(
          "Nova semana começou 📅",
          `<p>Uma nova semana começou na Capixaba Esports!</p>
           <p>Não esqueça de <strong>preencher seu relatório semanal</strong> com treinos, partidas e evolução.</p>
           <p><a href="${appUrl}/relatorio" style="color:#7c5cff">📝 Preencher relatório agora</a></p>`
        );

        let sent = 0;
        for (const id of ids) {
          const { data } = await supabaseAdmin.auth.admin.getUserById(id);
          const to = data?.user?.email;
          if (!to) continue;
          try { await sendGmail(to, "📅 Lembrete: relatório semanal - Capixaba", html); sent++; }
          catch (e) { console.error("[weekly-reminder]", e); }
        }
        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
