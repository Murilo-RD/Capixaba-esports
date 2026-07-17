import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdminClient() {
  const { createAuthDbClient } = await import("@/lib/app-auth.server");
  return createAuthDbClient();
}

async function assertOwner(userId: string) {
  const supabase = await getAdminClient();
  const { data: role, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!role) throw new Error("Apenas admins podem executar isso.");
  return supabase;
}

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await assertOwner(context.userId);

    await supabase.from("application_messages").delete().eq("sender_id", data.userId);
    await supabase.from("applications").delete().eq("user_id", data.userId);
    await supabase.from("weekly_reports").delete().eq("user_id", data.userId);
    await supabase.from("user_roles").delete().eq("user_id", data.userId);
    await supabase.from("profiles").delete().eq("id", data.userId);
    await (supabase as any).from("app_auth_users").delete().eq("id", data.userId);

    return { ok: true };
  });

export const rejectCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = await assertOwner(context.userId);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ status: "reprovado", meeting_at: null })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    const { error: appError } = await supabase
      .from("applications")
      .delete()
      .eq("user_id", data.userId);
    if (appError) throw new Error(appError.message);

    const { error: disableError } = await (supabase as any)
      .from("app_auth_users")
      .delete()
      .eq("id", data.userId);

    if (disableError) {
      return { ok: true, loginDisabled: false, warning: disableError.message };
    }

    return { ok: true, loginDisabled: true };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = await assertOwner(context.userId);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,nick,email,status,created_at")
      .order("created_at", { ascending: false });
    if (profilesError) throw new Error(profilesError.message);

    const { data: roles, error: rolesError } = await supabase
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
    const supabase = await assertOwner(context.userId);

    if (data.admin) {
      const { error } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: "owner" },
          { onConflict: "user_id,role" },
        );
      if (error) throw new Error(error.message);
      return { ok: true, admin: true };
    }

    if (data.userId === context.userId) {
      throw new Error("Voce nao pode remover seu proprio admin.");
    }

    const { count, error: countError } = await supabase
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "owner");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error("Nao e possivel remover o ultimo admin.");
    }

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "owner");
    if (error) throw new Error(error.message);

    return { ok: true, admin: false };
  });
