import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // verify caller is owner
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!role) throw new Error("Apenas o dono pode executar isso.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rejectCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!role) throw new Error("Apenas o dono pode executar isso.");

    const { error: profileError } = await context.supabase
      .from("profiles")
      .update({ status: "reprovado", meeting_at: null })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    const { error: appError } = await context.supabase
      .from("applications")
      .delete()
      .eq("user_id", data.userId);
    if (appError) throw new Error(appError.message);

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (error) {
        return { ok: true, authDeleted: false, warning: error.message };
      }
      return { ok: true, authDeleted: true };
    }

    return { ok: true, authDeleted: false };
  });
