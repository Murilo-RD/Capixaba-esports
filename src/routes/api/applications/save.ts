import { createFileRoute } from "@tanstack/react-router";
import { z, ZodError } from "zod";

const applicationSchema = z.object({
  nick: z.string().trim().min(1),
  idade: z.number().nullable().optional(),
  do_es: z.boolean().nullable().optional(),
  cidade: z.string().nullable().optional(),
  plataforma: z.string().nullable().optional(),
  rank_atual: z.string().nullable().optional(),
  ja_participou_camp: z.boolean().nullable().optional(),
  possui_equipe: z.boolean().nullable().optional(),
  nome_equipe: z.string().nullable().optional(),
  objetivo: z.string().nullable().optional(),
  interesse: z.string().nullable().optional(),
  discord: z.string().nullable().optional(),
  entrar_servidor: z.boolean().nullable().optional(),
  available_slots: z.array(z.string()).default([]),
  quick_request: z.boolean().default(false),
});

export const Route = createFileRoute("/api/applications/save")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = getBearerToken(request);
          const { createAuthDbClient, verifyAppToken } = await import("@/lib/app-auth.server");
          const claims = await verifyAppToken(token);
          const supabase = createAuthDbClient();
          const body = applicationSchema.parse(await request.json());
          const payload = { ...body, user_id: claims.sub! };

          const { data: existing, error: existingError } = await supabase
            .from("applications")
            .select("id")
            .eq("user_id", claims.sub!)
            .maybeSingle();

          if (existingError) throw existingError;

          const { data: profile, error: profileLoadError } = await supabase
            .from("profiles")
            .select("id,status")
            .eq("id", claims.sub!)
            .maybeSingle();

          if (profileLoadError) throw profileLoadError;

          const { data: saved, error: saveError } = existing
            ? await supabase
                .from("applications")
                .update(payload)
                .eq("user_id", claims.sub!)
                .select("id")
                .maybeSingle()
            : await supabase
                .from("applications")
                .insert(payload)
                .select("id")
                .maybeSingle();

          if (saveError) throw saveError;

          const profileEmail = claims.email?.toLowerCase() ?? null;
          const profileWrite = profile
            ? existing
              ? await supabase
                  .from("profiles")
                  .update({ nick: body.nick, email: profileEmail })
                  .eq("id", claims.sub!)
              : await supabase
                  .from("profiles")
                  .update({ nick: body.nick, email: profileEmail, status: "pendente", meeting_at: null })
                  .eq("id", claims.sub!)
            : await supabase
                .from("profiles")
                .insert({ id: claims.sub!, nick: body.nick, email: profileEmail, status: "pendente" });

          if (profileWrite.error) throw profileWrite.error;

          return json({ id: saved?.id ?? existing?.id ?? null, created: !existing });
        } catch (error) {
          if (error instanceof ZodError) {
            return json({ error: "Dados invalidos na candidatura." }, 400);
          }
          return json({ error: error instanceof Error ? error.message : "Erro ao salvar candidatura." }, 400);
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
