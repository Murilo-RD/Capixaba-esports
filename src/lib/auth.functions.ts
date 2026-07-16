import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  nick: z.string().trim().min(2).max(40),
});

export const createConfirmedAccount = createServerFn({ method: "POST" })
  .inputValidator((data) => signUpSchema.parse(data))
  .handler(async ({ data }) => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Cadastro sem verificacao de email exige SUPABASE_SERVICE_ROLE_KEY configurada no servidor.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        nick: data.nick,
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new Error("Esse email ja esta cadastrado. Entre na sua conta.");
      }
      throw new Error(error.message);
    }

    return { ok: true, userId: created.user?.id ?? null };
  });
