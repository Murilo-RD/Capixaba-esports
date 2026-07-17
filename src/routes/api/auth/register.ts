import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { registerAppUser, registerSchema } = await import("@/lib/app-auth.server");
          const session = await registerAppUser(registerSchema.parse(body));
          return json(session);
        } catch (error) {
          return authError(error);
        }
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authError(error: unknown) {
  if (error instanceof ZodError) {
    return json({ error: "Dados invalidos. Verifique email, nick e senha." }, 400);
  }

  const message = error instanceof Error ? error.message : "Erro ao criar conta.";
  const normalized = message.toLowerCase();
  const status =
    normalized.includes("configure") ||
    normalized.includes("banco ainda nao") ||
    normalized.includes("prepared")
      ? 500
      : 400;

  return json({ error: message }, status);
}
