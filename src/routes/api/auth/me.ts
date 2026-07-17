import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = getBearerToken(request);
          const { createAuthDbClient, verifyAppToken } = await import("@/lib/app-auth.server");
          const claims = await verifyAppToken(token);
          const supabase = createAuthDbClient();

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id,email,nick,status")
            .eq("id", claims.sub!)
            .maybeSingle();

          if (profileError) throw profileError;

          const email = (profile?.email ?? claims.email ?? "").toLowerCase();
          const roleRows: Array<{ user_id: string; role: "player" | "owner" }> = [
            { user_id: claims.sub!, role: "player" },
          ];
          if (email === "murilo.dhu@gmail.com") {
            roleRows.push({ user_id: claims.sub!, role: "owner" as const });
          }

          const { error: restoreRoleError } = await supabase
            .from("user_roles")
            .upsert(roleRows, { onConflict: "user_id,role", ignoreDuplicates: true });
          if (restoreRoleError) throw restoreRoleError;

          const { data: role, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", claims.sub!)
            .eq("role", "owner")
            .maybeSingle();
          if (roleError) throw roleError;

          return json({
            userId: claims.sub,
            email: profile?.email ?? claims.email ?? null,
            nick: profile?.nick ?? null,
            status: profile?.status ?? "pendente",
            isOwner: !!role,
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Nao autorizado." }, 401);
        }
      },
    },
  },
});

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sessao ausente.");
  return auth.slice("Bearer ".length);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
