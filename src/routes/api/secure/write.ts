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
          const owner = await isOwner(supabase, userId, claims.email);

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

async function isOwner(supabase: SupabaseAdmin, userId: string, email?: string) {
  const normalizedEmail = (email ?? "").toLowerCase();
  if (normalizedEmail === "murilo.dhu@gmail.com") {
    const { error } = await supabase
      .from("user_roles")
      .upsert(
        [
          { user_id: userId, role: "player" },
          { user_id: userId, role: "owner" },
        ],
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return true;
  }

  const { error: playerError } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "player" }, { onConflict: "user_id,role", ignoreDuplicates: true });
  if (playerError) throw new Error(playerError.message);

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

async function requireApplicationAccess(supabase: SupabaseAdmin, applicationId: string, userId: string, owner: boolean) {
  if (owner) return;
  const { data, error } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sem permissao para acessar esta candidatura.");
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
    case "shell.summary": {
      const data = z.object({ lastSeenCandidates: z.string().optional(), week: z.string().optional() }).parse(payload);
      let newCandidates = 0;
      if (owner && data.lastSeenCandidates) {
        const { count, error } = await supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .gt("created_at", data.lastSeenCandidates);
        if (error) throw new Error(error.message);
        newCandidates = count ?? 0;
      }

      let hasCurrentWeekReport = true;
      if (!owner && data.week) {
        const { count, error } = await supabase
          .from("weekly_reports")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("semana", data.week);
        if (error) throw new Error(error.message);
        hasCurrentWeekReport = (count ?? 0) > 0;
      }

      return { newCandidates, hasCurrentWeekReport };
    }

    case "application.mine": {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("status,meeting_at,nick")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);

      const { data: application, error: appError } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (appError) throw new Error(appError.message);
      return { profile, application };
    }

    case "candidates.list": {
      requireOwner(owner);
      const { data: apps, error: appsError } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (appsError) throw new Error(appsError.message);

      const ids = (apps ?? []).map((item: any) => item.user_id);
      if (!ids.length) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,status,meeting_at")
        .in("id", ids);
      if (profilesError) throw new Error(profilesError.message);

      const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
      return (apps ?? []).map((application: any) => ({
        ...application,
        profile: profileMap.get(application.user_id) ?? null,
      }));
    }

    case "profile.page": {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);

      const { data: reports, error: reportsError } = await supabase
        .from("weekly_reports")
        .select("semana,created_at,rank_atual,mmr_atual,variacao,freeplay,mecanicas,replay_review,nota_geral,rotacao,posicionamento,decisao,consistencia,mecanica")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (reportsError) throw new Error(reportsError.message);
      return { profile, reports: reports ?? [] };
    }

    case "reportForm.load": {
      const data = z.object({ editId: z.string().uuid().optional() }).parse(payload);
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("nick")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);

      let report = null;
      if (data.editId) {
        const { data: existing, error } = await supabase
          .from("weekly_reports")
          .select("*")
          .eq("id", data.editId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        report = existing;
      }

      const { data: recent, error: recentError } = await supabase
        .from("weekly_reports")
        .select("mmr_atual,id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2);
      if (recentError) throw new Error(recentError.message);

      const previous = (recent ?? []).find((item: any) => item.id !== data.editId);
      return { nick: profile?.nick ?? "", report, previousMmr: previous?.mmr_atual ?? null };
    }

    case "reports.mine": {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "reports.all": {
      requireOwner(owner);
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "reports.ranking": {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("nick,rank_atual,mmr_atual,semana,created_at")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "trainings.page": {
      const { data: trainings, error: trainingsError } = await supabase
        .from("trainings")
        .select("*")
        .order("nivel")
        .order("created_at", { ascending: false });
      if (trainingsError) throw new Error(trainingsError.message);

      const { data: videos, error: videosError } = await supabase
        .from("training_videos")
        .select("*")
        .order("nivel")
        .order("created_at", { ascending: false });
      if (videosError) throw new Error(videosError.message);
      return { isOwner: owner, trainings: trainings ?? [], videos: videos ?? [] };
    }

    case "rivalTeams.list": {
      const { data, error } = await supabase.from("rival_teams").select("*").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "matches.list": {
      const { data, error } = await supabase
        .from("matches")
        .select("*, rival_teams(*)")
        .order("played_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case "messages.list": {
      const data = z.object({ applicationId: z.string().uuid() }).parse(payload);
      await requireApplicationAccess(supabase, data.applicationId, userId, owner);
      const { data: messages, error } = await supabase
        .from("application_messages")
        .select("*")
        .eq("application_id", data.applicationId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return messages ?? [];
    }

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
      await requireApplicationAccess(supabase, data.applicationId, userId, owner);
      const { data: message, error } = await supabase
        .from("application_messages")
        .insert({
          application_id: data.applicationId,
          sender_id: userId,
          content: data.content,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return message;
    }

    case "candidate.status": {
      requireOwner(owner);
      const data = z.object({
        userId: z.string().uuid(),
        status: z.enum(["pendente", "reuniao", "aprovado", "reprovado"]),
        meetingAt: z.string().nullable().optional(),
      }).parse(payload);

      const meetingAt = data.status === "reuniao" ? data.meetingAt : null;
      if (data.status === "reuniao") {
        if (!meetingAt) throw new Error("Informe a data e hora da reuniao.");
        const parsed = new Date(meetingAt);
        if (Number.isNaN(parsed.getTime())) throw new Error("Data da reuniao invalida.");
      }

      const { data: application, error: appError } = await supabase
        .from("applications")
        .select("nick")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (appError) throw new Error(appError.message);

      const profileUpdate: Record<string, unknown> = {
        id: data.userId,
        status: data.status,
        meeting_at: meetingAt,
      };
      if (application?.nick) profileUpdate.nick = application.nick;

      const { data: profile, error } = await supabase
        .from("profiles")
        .upsert(profileUpdate, { onConflict: "id" })
        .select("id,status,meeting_at")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, profile };
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

    case "adminUsers.delete": {
      requireOwner(owner);
      const data = z.object({ userId: z.string().uuid() }).parse(payload);

      if (data.userId === userId) {
        throw new Error("Voce nao pode excluir sua propria conta.");
      }

      const { data: targetOwner, error: targetOwnerError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.userId)
        .eq("role", "owner")
        .maybeSingle();
      if (targetOwnerError) throw new Error(targetOwnerError.message);

      if (targetOwner) {
        const { count, error: countError } = await supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "owner");
        if (countError) throw new Error(countError.message);
        if ((count ?? 0) <= 1) {
          throw new Error("Nao e possivel excluir o ultimo admin.");
        }
      }

      const { error: messagesError } = await supabase
        .from("application_messages")
        .delete()
        .eq("sender_id", data.userId);
      if (messagesError) throw new Error(messagesError.message);

      const deletions = [
        supabase.from("applications").delete().eq("user_id", data.userId),
        supabase.from("weekly_reports").delete().eq("user_id", data.userId),
        supabase.from("user_roles").delete().eq("user_id", data.userId),
        supabase.from("profiles").delete().eq("id", data.userId),
        (supabase as any).from("app_auth_users").delete().eq("id", data.userId),
      ];

      for (const deletion of deletions) {
        const { error } = await deletion;
        if (error) throw new Error(error.message);
      }

      return { ok: true };
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

    case "rivalTeams.update": {
      requireOwner(owner);
      const data = z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1),
        logo_url: z.string().nullable(),
      }).parse(payload);
      const { error } = await supabase
        .from("rival_teams")
        .update({ name: data.name, logo_url: data.logo_url })
        .eq("id", data.id);
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
        our_score: z.number().nullable(),
        rival_score: z.number().nullable(),
        played_at: z.string(),
        notes: z.string().nullable(),
      }).parse(payload);
      const { error } = await supabase.from("matches").insert(data);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "matches.update": {
      requireOwner(owner);
      const data = z.object({
        id: z.string().uuid(),
        rival_team_id: z.string().uuid(),
        competition: z.string().trim().min(1),
        our_score: z.number().nullable(),
        rival_score: z.number().nullable(),
        played_at: z.string(),
        notes: z.string().nullable(),
      }).parse(payload);
      const { error } = await supabase
        .from("matches")
        .update({
          rival_team_id: data.rival_team_id,
          competition: data.competition,
          our_score: data.our_score,
          rival_score: data.rival_score,
          played_at: data.played_at,
          notes: data.notes,
        })
        .eq("id", data.id);
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
