import { createFileRoute } from "@tanstack/react-router";
import { z, ZodError } from "zod";

const requestSchema = z.object({
  action: z.string(),
  payload: z.unknown(),
});

export const Route = createFileRoute("/api/secure/write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = getBearerToken(request);
          const body = requestSchema.parse(await request.json());
          const { createAuthDbClient, hashPassword, verifyAppToken } = await import("@/lib/app-auth.server");
          const claims = await verifyAppToken(token);
          const supabase = createAuthDbClient();
          const userId = claims.sub!;
          const owner = await isOwner(supabase, userId);

          const result = await runAction({
            action: body.action,
            payload: body.payload,
            supabase,
            userId,
            owner,
            hashPassword,
          });

          return json({ result });
        } catch (error) {
          if (error instanceof ZodError) {
            return json({ error: "Dados invalidos." }, 400);
          }
          return json({ error: error instanceof Error ? error.message : "Erro ao salvar." }, 400);
        }
      },
    },
  },
});

type SupabaseAdmin = any;

async function isOwner(supabase: SupabaseAdmin, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

function requireOwner(owner: boolean) {
  if (!owner) throw new Error("Apenas admins podem executar isso.");
}

async function runAction({
  action,
  payload,
  supabase,
  userId,
  owner,
  hashPassword,
}: {
  action: string;
  payload: unknown;
  supabase: SupabaseAdmin;
  userId: string;
  owner: boolean;
  hashPassword: (password: string) => Promise<string>;
}) {
  switch (action) {
    case "profile.updateNick": {
      const data = z.object({ nick: z.string().trim().min(1).max(80) }).parse(payload);
      const { error } = await supabase.from("profiles").update({ nick: data.nick }).eq("id", userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "profile.changePassword": {
      const data = z.object({ password: z.string().min(6).max(128) }).parse(payload);
      const password_hash = await hashPassword(data.password);
      const { error } = await (supabase as any)
        .from("app_auth_users")
        .update({ password_hash })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "profile.syncTracker": {
      const data = z.object({
        platform: z.enum(["steam", "epic", "psn", "xbl", "switch"]),
        identifier: z.string().trim().min(2),
      }).parse(payload);
      const apiKey = process.env.TRN_API_KEY ?? process.env.TRACKER_API_KEY ?? process.env.RLTRACKER_API_KEY;
      if (!apiKey) {
        throw new Error("Integração com Tracker Network ainda não configurada. Adicione TRN_API_KEY no Render.");
      }

      const url = `https://public-api.tracker.gg/v2/rocket-league/standard/profile/${data.platform}/${encodeURIComponent(data.identifier)}`;
      const res = await fetch(url, {
        headers: {
          "TRN-Api-Key": apiKey,
          "Accept": "application/json",
          "User-Agent": "CapixabaESports/1.0",
        },
      });

      if (res.status === 404) throw new Error("Jogador não encontrado no Tracker. Verifique a plataforma e o ID.");
      if (res.status === 401 || res.status === 403) throw new Error("Chave da Tracker Network inválida ou sem permissão para a API.");
      if (res.status === 429) throw new Error("Muitas requisições. Aguarde alguns segundos e tente novamente.");
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Tracker Network respondeu ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        data?: {
          platformInfo?: { avatarUrl?: string | null };
          segments?: Array<{
            type?: string;
            metadata?: { name?: string };
            stats?: {
              rating?: { value?: number | null };
              tier?: { metadata?: { name?: string | null } };
            };
          }>;
        };
      };
      const segments = json?.data?.segments ?? [];

      function pick(playlistName: string) {
        const segment = segments.find(
          (item) =>
            item.type === "playlist" &&
            (item.metadata?.name ?? "").toLowerCase().includes(playlistName.toLowerCase()),
        );
        const mmr = segment?.stats?.rating?.value ?? null;
        const rank = segment?.stats?.tier?.metadata?.name ?? null;
        return { mmr: mmr != null ? Math.round(mmr) : null, rank };
      }

      const duel = pick("Ranked Duel");
      const doubles = pick("Ranked Doubles");
      const standard = pick("Ranked Standard");
      const update = {
        platform: data.platform,
        rocket_league_id: data.identifier,
        avatar_url: json?.data?.platformInfo?.avatarUrl ?? null,
        mmr_1v1: duel.mmr,
        rank_1v1: duel.rank,
        mmr_2v2: doubles.mmr,
        rank_2v2: doubles.rank,
        mmr_3v3: standard.mmr,
        rank_3v3: standard.rank,
        tracker_synced_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").update(update).eq("id", userId);
      if (error) throw new Error(error.message);
      return update;
    }

    case "reports.save": {
      const data = z.object({ id: z.string().uuid().optional(), report: z.record(z.unknown()) }).parse(payload);
      const report = { ...data.report, user_id: userId };
      const query = data.id
        ? supabase.from("weekly_reports").update(report).eq("id", data.id).eq("user_id", userId).select("id").maybeSingle()
        : supabase.from("weekly_reports").insert(report as any).select("id").maybeSingle();
      const { data: saved, error } = await query;
      if (error) throw new Error(error.message);
      return { id: saved?.id ?? data.id ?? null };
    }

    case "reports.delete": {
      const data = z.object({ id: z.string().uuid() }).parse(payload);
      const query = owner
        ? supabase.from("weekly_reports").delete().eq("id", data.id)
        : supabase.from("weekly_reports").delete().eq("id", data.id).eq("user_id", userId);
      const { error } = await query;
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "messages.send": {
      const data = z.object({ applicationId: z.string().uuid(), content: z.string().trim().min(1).max(2000) }).parse(payload);
      const { error } = await supabase.from("application_messages").insert({
        application_id: data.applicationId,
        sender_id: userId,
        content: data.content,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "candidate.status": {
      requireOwner(owner);
      const data = z.object({
        userId: z.string().uuid(),
        status: z.enum(["pendente", "reuniao", "aprovado", "reprovado"]),
        meetingAt: z.string().nullable().optional(),
      }).parse(payload);
      const { error } = await supabase
        .from("profiles")
        .update({ status: data.status, meeting_at: data.meetingAt ?? null })
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "candidate.reject": {
      requireOwner(owner);
      const data = z.object({ userId: z.string().uuid() }).parse(payload);

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

      const { error: authError } = await (supabase as any)
        .from("app_auth_users")
        .delete()
        .eq("id", data.userId);

      return { ok: true, loginDisabled: !authError, warning: authError?.message ?? null };
    }

    case "adminUsers.list": {
      requireOwner(owner);
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

      return (profiles ?? []).map((profile: any) => ({
        ...profile,
        roles: roleMap.get(profile.id) ?? [],
        isAdmin: (roleMap.get(profile.id) ?? []).includes("owner"),
      }));
    }

    case "adminUsers.setRole": {
      requireOwner(owner);
      const data = z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(payload);

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

      if (data.userId === userId) {
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
    }

    case "trainings.create": {
      requireOwner(owner);
      const data = z.object({
        nome: z.string().trim().min(1),
        codigo: z.string().trim().min(1),
        nivel: z.enum(["platina", "diamante", "champion", "grand_champion", "ssl"]),
      }).parse(payload);
      const { error } = await supabase.from("trainings").insert({ ...data, created_by: userId });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "trainings.delete": {
      requireOwner(owner);
      const data = z.object({ id: z.string().uuid() }).parse(payload);
      const { error } = await supabase.from("trainings").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "trainingVideos.create": {
      requireOwner(owner);
      const data = z.object({
        titulo: z.string().trim().min(1),
        descricao: z.string().nullable(),
        youtube_url: z.string().trim().min(1),
        youtube_id: z.string().trim().min(1),
        nivel: z.enum(["platina", "diamante", "champion", "grand_champion", "ssl"]),
      }).parse(payload);
      const { error } = await supabase.from("training_videos").insert({ ...data, created_by: userId });
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "trainingVideos.delete": {
      requireOwner(owner);
      const data = z.object({ id: z.string().uuid() }).parse(payload);
      const { error } = await supabase.from("training_videos").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "rivalTeams.create": {
      requireOwner(owner);
      const data = z.object({ name: z.string().trim().min(1), logo_url: z.string().nullable() }).parse(payload);
      const { error } = await supabase.from("rival_teams").insert(data);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "rivalTeams.delete": {
      requireOwner(owner);
      const data = z.object({ id: z.string().uuid() }).parse(payload);
      const { error } = await supabase.from("rival_teams").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "matches.create": {
      requireOwner(owner);
      const data = z.object({
        rival_team_id: z.string().uuid(),
        competition: z.string().trim().min(1),
        our_score: z.number(),
        rival_score: z.number(),
        played_at: z.string(),
        notes: z.string().nullable(),
      }).parse(payload);
      const { error } = await supabase.from("matches").insert(data);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "matches.delete": {
      requireOwner(owner);
      const data = z.object({ id: z.string().uuid() }).parse(payload);
      const { error } = await supabase.from("matches").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    default:
      throw new Error("Acao nao permitida.");
  }
}

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
