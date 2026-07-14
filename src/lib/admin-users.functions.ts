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

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!role) throw new Error("Apenas admins podem ver usuários.");

    const { data: profiles, error: profilesError } = await context.supabase
      .from("profiles")
      .select("id,nick,email,status,created_at")
      .order("created_at", { ascending: false });
    if (profilesError) throw new Error(profilesError.message);

    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("user_id,role");
    if (rolesError) throw new Error(rolesError.message);

    const roleMap = new Map<string, string[]>();
    for (const item of roles ?? []) {
      const current = roleMap.get(item.user_id) ?? [];
      current.push(item.role);
      roleMap.set(item.user_id, current);
    }

    return (profiles ?? []).map((profile) => ({
      ...profile,
      roles: roleMap.get(profile.id) ?? [],
      isAdmin: (roleMap.get(profile.id) ?? []).includes("owner"),
    }));
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!role) throw new Error("Apenas admins podem alterar permissões.");

    if (data.admin) {
      const { error } = await context.supabase
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: "owner" },
          { onConflict: "user_id,role" },
        );
      if (error) throw new Error(error.message);
      return { ok: true, admin: true };
    }

    if (data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio admin.");
    }

    const { count, error: countError } = await context.supabase
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "owner");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error("Não é possível remover o último admin.");
    }

    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "owner");
    if (error) throw new Error(error.message);

    return { ok: true, admin: false };
  });
