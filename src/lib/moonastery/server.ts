import { createClient } from "@supabase/supabase-js";
import { actionSchemas, requestSchema } from "./schemas";
import { isUploadedInstructionImageUrl } from "./media";
import type { MoonAction } from "./schemas";
import type { Membership, PublicHome, Player, PublicPlayer, Archetype, PlayerCard } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export function createServerClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new ApiError(
      "Configure as credenciais de servidor do Supabase.",
      503,
      "SERVER_NOT_CONFIGURED",
    );
  if (key.startsWith("sb_publishable_"))
    throw new ApiError(
      "A chave de servidor deve ser administrativa.",
      503,
      "SERVER_NOT_CONFIGURED",
    );
  if (!key.startsWith("sb_secret_")) {
    let role: string | undefined;
    try {
      role = JSON.parse(Buffer.from(key.split(".")[1] || "", "base64url").toString()).role;
    } catch {
      role = undefined;
    }
    if (role !== "service_role")
      throw new ApiError(
        "A chave de servidor deve ser administrativa.",
        503,
        "SERVER_NOT_CONFIGURED",
      );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type MoonDb = ReturnType<typeof createServerClient>;
const publicSubmissionAttempts = new Map<string, number>();
type PayloadUnion = ReturnType<(typeof actionSchemas)[MoonAction]["parse"]>;
type UnionKeys<T> = T extends unknown ? keyof T : never;
type FieldValue<T, K> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;
// Access is selected by the action branches after its strict schema has parsed.
type ParsedPayload = { [K in UnionKeys<PayloadUnion>]: FieldValue<PayloadUnion, K> };
export async function requireActor(request: Request, roles?: Membership["role"][]) {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") || "");
  if (!match) throw new ApiError("Sessão ausente.", 401, "UNAUTHENTICATED");
  const db = createServerClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(match[1]);
  if (error || !user) throw new ApiError("Sessão inválida ou expirada.", 401, "UNAUTHENTICATED");
  const membership = await checked<Membership>(
    db.from("moon_memberships").select("*").eq("id", user.id).maybeSingle(),
  );
  if (!membership)
    throw new ApiError(
      "Sua conta precisa ser cadastrada na Moonastery.",
      403,
      "MEMBERSHIP_REQUIRED",
    );
  if (roles && (membership.status !== "approved" || !roles.includes(membership.role)))
    throw new ApiError("Ação não autorizada para sua conta.", 403, "FORBIDDEN");
  return { user, membership, db };
}
export async function checked<T = unknown>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new ApiError("Este registro já existe.", 409, "DUPLICATE");
    if (code === "23503")
      throw new ApiError(
        "O registro possui vínculos ou a referência não existe.",
        409,
        "REFERENCE_CONFLICT",
      );
    const message = (error as { message?: string }).message || "";
    if (message.includes("REPORT_NOT_FOUND"))
      throw new ApiError("Relatório não encontrado.", 404, "NOT_FOUND");
    if (message.includes("SELF_CHANGE") || message.includes("LAST_OWNER") || code === "42501")
      throw new ApiError(
        "A operação violaria as permissões ou a proteção do proprietário.",
        403,
        "FORBIDDEN",
      );
    if (message.includes("OLDER_SESSION"))
      throw new ApiError(
        "Já existe uma sessão posterior aprovada para este jogador. Revise o histórico antes de alterar uma noite anterior.",
        409,
        "OLDER_SESSION",
      );
    if (message.includes("JOB_NOT_REVIEWABLE"))
      throw new ApiError("Este processamento não está aguardando validação.", 409, "JOB_STATE");
    if (message.includes("INSUFFICIENT_EVIDENCE"))
      throw new ApiError(
        "Ainda não há atributos calculáveis com evidência suficiente. Configure uma baseline SSL real e processe novamente.",
        409,
        "INSUFFICIENT_EVIDENCE",
      );
    throw new ApiError(
      "Falha ao acessar os dados. Confira a implantação das migrations.",
      500,
      "DATABASE_ERROR",
    );
  }
  return data as T;
}
const publicPlayerColumns = "id,nick,bio,photo_url,game_id,archetype_id,public_visible";
const publicNewsColumns =
  "id,title,slug,summary,content,cover_url,category,status,published_at,created_at";
export async function loadPlayers(
  db: MoonDb,
  publicOnly = false,
  access?: { staff: boolean; userId: string },
): Promise<Player[] | PublicPlayer[]> {
  const members = await checked<{ id: string; role: Player["role"] }[]>(
    db
      .from("moon_memberships")
      .select("id,role")
      .eq("status", "approved")
      .in("role", ["player", "coach", "owner"]),
  );
  if (!members.length) return [];
  let query = db
    .from("moon_players")
    .select(publicOnly ? `${publicPlayerColumns},user_id` : "*")
    .in(
      "user_id",
      members.map((m) => m.id),
    );
  if (publicOnly) query = query.eq("public_visible", true);
  const rows = await checked<Player[]>(query.limit(500));
  const [archetypes, cards] = await Promise.all([
    checked<Archetype[]>(db.from("moon_archetypes").select("*")),
    checked<(PlayerCard & { player_id: string })[]>(db.from("moon_cards").select("*")),
  ]);
  const memberRoles = new Map(members.map((member) => [member.id, member.role]));
  const enriched = rows.map((p) => ({
    ...p,
    role: memberRoles.get(p.user_id)!,
    archetype: archetypes.find((a) => a.id === p.archetype_id) || null,
    card: cards.find((c) => c.player_id === p.id) || null,
    ranking_position: null as number | null,
  }));
  enriched.sort(
    (a, b) =>
      (b.card?.overall ?? -1) - (a.card?.overall ?? -1) ||
      (b.card?.attributes.IMP ?? -1) - (a.card?.attributes.IMP ?? -1) ||
      (a.nick.toLowerCase() < b.nick.toLowerCase()
        ? -1
        : a.nick.toLowerCase() > b.nick.toLowerCase()
          ? 1
          : 0) ||
      a.id.localeCompare(b.id),
  );
  return enriched.map((p, i) => {
    const player = {
      ...p,
      ...(access && !access.staff && p.user_id !== access.userId
        ? { platform: null, platform_id: null }
        : {}),
      ranking_position: p.card?.overall == null ? null : i + 1,
    };
    if (publicOnly) {
      const { user_id: _, ...publicPlayer } = player;
      return publicPlayer;
    }
    return player;
  });
}
export async function loadPublicHome(): Promise<PublicHome> {
  const db = createServerClient();
  const [organization, players, games, news, partners, socials] = await Promise.all([
    checked<PublicHome["organization"]>(
      db.from("moon_organization").select("*").eq("id", "default").maybeSingle(),
    ),
    loadPlayers(db, true),
    checked<PublicHome["games"]>(
      db.from("moon_games").select("*").eq("active", true).order("display_order").limit(100),
    ),
    checked<PublicHome["news"]>(
      db
        .from("moon_news")
        .select(publicNewsColumns)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(24),
    ),
    checked<PublicHome["partners"]>(
      db.from("moon_partners").select("*").eq("active", true).order("display_order").limit(100),
    ),
    checked<PublicHome["socials"]>(
      db.from("moon_socials").select("*").eq("active", true).order("display_order").limit(100),
    ),
  ]);
  return { organization, players, games, news, partners, socials };
}
export async function loadPublicNews(slug: string) {
  if (!/^[a-z0-9-]{1,160}$/.test(slug))
    throw new ApiError("Notícia não encontrada.", 404, "NOT_FOUND");
  const row = await checked(
    createServerClient()
      .from("moon_news")
      .select(publicNewsColumns)
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .maybeSingle(),
  );
  if (!row) throw new ApiError("Notícia não encontrada.", 404, "NOT_FOUND");
  return row;
}
async function audit(db: MoonDb, actor: string, action: string, entity?: string) {
  await checked(
    db.from("moon_audit").insert({ actor_id: actor, action, entity_id: entity || null }),
  );
}
async function requireRow(db: MoonDb, table: string, id: string) {
  const row = await checked<Record<string, unknown>>(
    db.from(table).select("*").eq("id", id).maybeSingle(),
  );
  if (!row) throw new ApiError("Registro não encontrado.", 404, "NOT_FOUND");
  return row;
}

export async function handleMoonRequest(request: Request) {
  const body = requestSchema.parse(
    JSON.parse(new TextDecoder().decode(await boundedBody(request, 8 * 1024 * 1024))),
  );
  const payload = actionSchemas[body.action].parse(body.payload);
  if (body.action === "submissions.public.create") {
    const submission = payload as ReturnType<
      (typeof actionSchemas)["submissions.public.create"]["parse"]
    >;
    if (submission.website) return { ok: true };
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
      "unknown";
    const now = Date.now();
    const recent = publicSubmissionAttempts.get(ip) || 0;
    if (now - recent < 15_000)
      throw new ApiError("Aguarde um momento antes de enviar outra mensagem.", 429, "RATE_LIMITED");
    publicSubmissionAttempts.set(ip, now);
    if (publicSubmissionAttempts.size > 2000) {
      for (const [key, time] of publicSubmissionAttempts)
        if (now - time > 60_000) publicSubmissionAttempts.delete(key);
    }
    const db = createServerClient();
    await checked(
      db.from("moon_submissions").insert({
        category: submission.category,
        title: submission.title,
        description: submission.description,
        author_id: null,
      }),
    );
    return { ok: true };
  }
  const { db, user, membership } = await requireActor(request);
  if (body.action === "membership.me") return membership;
  if (membership.status !== "approved" || !membership.role)
    throw new ApiError("Sua solicitação ainda não foi aprovada.", 403, "APPROVAL_REQUIRED");
  const role = membership.role;
  const allow = (...roles: string[]) => {
    if (!roles.includes(role))
      throw new ApiError("Você não possui permissão para esta ação.", 403, "FORBIDDEN");
  };
  const data = payload as ParsedPayload;
  const id = data.id as string;
  let response: unknown = { ok: true };
  if (body.action === "dashboard.get") {
    const owner = role === "owner",
      staff = owner || role === "coach",
      player = role === "player",
      editor = owner || role === "editor";
    const offset = data.offset || 0;
    const own = await checked<{ id: string }>(
      db.from("moon_players").select("id").eq("user_id", user.id).maybeSingle(),
    );
    const list = async (table: string, enabled: boolean, filter?: [string, unknown]) => {
      if (!enabled) return [];
      let q = db
        .from(table)
        .select("*")
        .order(table === "moon_reports" ? "approved_at" : "created_at", { ascending: false });
      if (["moon_partners", "moon_socials"].includes(table))
        q = db.from(table).select("*").order("display_order");
      if (filter) q = q.eq(filter[0], filter[1]);
      return checked<Record<string, unknown>[]>(q.range(offset, offset + 99));
    };
    let instructionQuery = db
      .from("moon_instructions")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + 99);
    if (player)
      instructionQuery = instructionQuery.or(
        `target_player_ids.eq.{},target_player_ids.cs.{${own?.id || "00000000-0000-0000-0000-000000000000"}}`,
      );
    const [
      players,
      archetypes,
      games,
      reports,
      instructions,
      news,
      submissions,
      jobs,
      users,
      partners,
      socials,
      organization,
      scoring,
    ] = await Promise.all([
      loadPlayers(db, false, { staff, userId: user.id }),
      checked(db.from("moon_archetypes").select("*")),
      checked(db.from("moon_games").select("*")),
      list("moon_reports", staff || player, player ? ["player_id", own?.id] : undefined),
      staff || player ? checked(instructionQuery) : [],
      list("moon_news", editor, role === "editor" ? ["author_id", user.id] : undefined),
      list("moon_submissions", owner || player, player ? ["author_id", user.id] : undefined),
      list("moon_jobs", staff),
      list("moon_memberships", owner),
      owner ? checked(db.from("moon_partners").select("*").order("display_order")) : [],
      owner ? checked(db.from("moon_socials").select("*").order("display_order")) : [],
      checked(db.from("moon_organization").select("*").eq("id", "default").maybeSingle()),
      staff
        ? checked<{ config: unknown }>(
            db.from("moon_scoring").select("config").eq("id", "default").maybeSingle(),
          )
        : null,
    ]);
    return {
      membership,
      players,
      archetypes,
      games,
      reports,
      instructions,
      news,
      submissions,
      jobs,
      users,
      partners,
      socials,
      organization,
      scoring: scoring?.config || null,
    };
  }
  if (body.action === "users.update") {
    allow("owner");
    await checked(
      db.rpc("moon_manage_member", {
        actor_id: user.id,
        member_id: id,
        new_role: data.role,
        new_status: data.status,
      }),
    );
    return { ok: true };
  }
  if (body.action === "users.create") {
    allow("owner");
    const origin = new URL(request.url).origin;
    const { data: invitation, error } = await db.auth.admin.inviteUserByEmail(data.email, {
      data: { nick: data.nick },
      redirectTo: `${process.env.PUBLIC_APP_URL || process.env.APP_URL || origin}/team`,
    });
    if (error || !invitation.user)
      throw new ApiError(
        "Não foi possível enviar o convite. Confira a configuração de e-mail.",
        400,
        "INVITE_FAILED",
      );
    await checked(
      db.rpc("moon_manage_member", {
        actor_id: user.id,
        member_id: invitation.user.id,
        new_role: data.role,
        new_status: "approved",
      }),
    );
    return { ok: true };
  }
  if (body.action === "users.remove") {
    allow("owner");
    await checked(
      db.rpc("moon_manage_member", {
        actor_id: user.id,
        member_id: id,
        new_status: "suspended",
        new_role: null,
      }),
    );
    const { error } = await db.auth.admin.deleteUser(id);
    if (error)
      throw new ApiError(
        "Conta suspensa, mas a remoção no Auth falhou.",
        500,
        "AUTH_DELETE_FAILED",
      );
    await audit(db, user.id, body.action, id);
    return { ok: true };
  }
  if (body.action === "profile.update") {
    allow("owner", "coach", "editor", "player");
    if (data.photo_url) {
      const expected = `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL}/storage/v1/object/public/moon-avatars/${user.id}/`;
      if (!data.photo_url.startsWith(expected))
        throw new ApiError("Envie a imagem pelo seu perfil.", 400, "INVALID_AVATAR");
    }
    await checked(db.from("moon_players").update(data).eq("user_id", user.id));
    await checked(db.from("moon_memberships").update({ nick: data.nick }).eq("id", user.id));
    return { ok: true };
  }
  if (body.action === "players.update") {
    allow("owner", "coach");
    await requireRow(db, "moon_players", id);
    const { id: _, ...fields } = data;
    await checked(db.from("moon_players").update(fields).eq("id", id));
  } else if (body.action === "players.archetype") {
    allow("owner", "coach");
    const target = await requireRow(db, "moon_players", id);
    const member = await requireRow(db, "moon_memberships", target.user_id as string);
    if (member.role === "coach" || member.role === "owner")
      throw new ApiError(
        "O arquétipo de coaches e donos é definido pela função na equipe.",
        400,
        "FIXED_ARCHETYPE",
      );
    await checked(
      db.rpc("moon_change_archetype", {
        actor_id: user.id,
        player_id: id,
        archetype_id: data.archetype_id,
      }),
    );
    return { ok: true };
  } else if (body.action === "reports.feedback") {
    allow("owner", "coach");
    await requireRow(db, "moon_reports", id);
    const { id: _, ...fields } = data;
    await checked(db.from("moon_reports").update(fields).eq("id", id));
  } else if (body.action === "reports.create") {
    allow("owner");
    const target = await requireRow(db, "moon_players", data.player_id);
    const activePlayer = await checked<{ id: string } | null>(
      db
        .from("moon_memberships")
        .select("id")
        .eq("id", target.user_id as string)
        .in("role", ["player", "coach", "owner"])
        .eq("status", "approved")
        .maybeSingle(),
    );
    if (!activePlayer) throw new ApiError("Selecione um jogador ativo.", 400, "INVALID_PLAYER");
    const existing = await checked<{ id: string } | null>(
      db
        .from("moon_reports")
        .select("id")
        .eq("player_id", data.player_id)
        .eq("session_date", data.session_date)
        .maybeSingle(),
    );
    if (existing)
      throw new ApiError(
        "Este jogador já tem um relatório nessa data. Abra o relatório existente para editar o feedback.",
        409,
        "REPORT_EXISTS",
      );
    const emptyAttributes = Object.fromEntries(
      ["VEL", "FIN", "CRI", "DEF", "POS", "BST", "IMP"].map((attribute) => [attribute, null]),
    );
    await checked(
      db.from("moon_reports").insert({
        ...data,
        attributes: emptyAttributes,
        baseline_attributes: emptyAttributes,
        overall: null,
        approved_by: user.id,
        source_job_ids: [],
      }),
    );
  } else if (body.action === "reports.delete") {
    allow("owner");
    await requireRow(db, "moon_reports", id);
    await checked(db.rpc("moon_delete_report", { actor_id: user.id, target_report_id: id }));
    return { ok: true };
  } else if (body.action === "instructions.save") {
    allow("owner", "coach");
    if (data.target_player_ids.length) {
      const rows = await checked<{ id: string }[]>(
        db.from("moon_players").select("id").in("id", data.target_player_ids),
      );
      if (rows.length !== new Set(data.target_player_ids).size)
        throw new ApiError("Destinatário inválido.");
    }
    const existing = id ? await requireRow(db, "moon_instructions", id) : null;
    const existingImages = new Set(
      Array.isArray(existing?.media)
        ? (existing.media as { type: string; url: string }[])
            .filter((item) => item.type === "image")
            .map((item) => item.url)
        : [],
    );
    for (const item of data.media) {
      if (
        item.type === "image" &&
        !existingImages.has(item.url) &&
        !isUploadedInstructionImageUrl(
          item.url,
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        )
      )
        throw new ApiError(
          "Envie as imagens da instrução pelo campo de upload.",
          400,
          "IMAGE_UPLOAD_REQUIRED",
        );
    }
    const { id: _, ...fields } = data;
    if (id) {
      await checked(db.from("moon_instructions").update(fields).eq("id", id));
    } else await checked(db.from("moon_instructions").insert({ ...fields, author_id: user.id }));
  } else if (body.action === "instructions.delete") {
    allow("owner", "coach");
    await checked(db.from("moon_instructions").delete().eq("id", id));
  } else if (
    body.action === "news.save" ||
    body.action === "news.submit" ||
    body.action === "news.delete" ||
    body.action === "news.review"
  ) {
    allow("owner", "editor");
    const row = id ? await requireRow(db, "moon_news", id) : null;
    if (
      role === "editor" &&
      row &&
      (row.author_id !== user.id ||
        !["draft", "changes_requested", "rejected"].includes(row.status as string))
    )
      throw new ApiError("Edite somente seus rascunhos.", 403, "FORBIDDEN");
    if (body.action === "news.review") {
      allow("owner");
      await checked(
        db
          .from("moon_news")
          .update({
            status: data.status,
            review_note: data.review_note,
            reviewed_by: user.id,
            published_at: data.status === "published" ? new Date().toISOString() : null,
          })
          .eq("id", id),
      );
    } else if (body.action === "news.delete") {
      await checked(db.from("moon_news").delete().eq("id", id));
    } else if (body.action === "news.submit") {
      await checked(
        db.from("moon_news").update({ status: "pending", published_at: null }).eq("id", id),
      );
    } else {
      const { id: _, ...fields } = data;
      if (id)
        await checked(
          db
            .from("moon_news")
            .update({ ...fields, status: "draft", published_at: null })
            .eq("id", id),
        );
      else
        await checked(
          db.from("moon_news").insert({ ...fields, author_id: user.id, status: "draft" }),
        );
    }
  } else if (body.action === "submissions.create") {
    allow("player");
    await checked(db.from("moon_submissions").insert({ ...data, author_id: user.id }));
  } else if (body.action === "submissions.update") {
    allow("owner");
    await requireRow(db, "moon_submissions", id);
    await checked(
      db
        .from("moon_submissions")
        .update({ status: data.status, response: data.response })
        .eq("id", id),
    );
  } else if (body.action === "organization.save") {
    allow("owner");
    await checked(db.from("moon_organization").upsert({ ...data, id: "default" }));
  } else if (body.action.startsWith("scoring.reference.")) {
    allow("owner");
    const { scoringConfigSchema, DEFAULT_SCORING_SETTINGS } =
      await import("@/lib/gameplay-scouter/config");
    const { findReferencePlayer, loadReferencePreview, BaselineReferenceError } =
      await import("@/lib/gameplay-scouter/baseline.server");
    const saved = await checked<{ config: unknown } | null>(
      db.from("moon_scoring").select("config").eq("id", "default").maybeSingle(),
    );
    const config = scoringConfigSchema.parse(saved?.config ?? DEFAULT_SCORING_SETTINGS);
    try {
      if (body.action === "scoring.reference.clear") {
        await checked(
          db.from("moon_scoring").upsert({
            id: "default",
            config: { ...config, reference_player: null, baselines: [] },
            updated_at: new Date().toISOString(),
          }),
        );
      } else {
        const reference = await findReferencePlayer(db, data.player_id, data.min_samples);
        const next = { ...config, reference_player: reference };
        const preview = await loadReferencePreview(db, next);
        if (body.action === "scoring.reference.preview") return preview;
        await checked(
          db.from("moon_scoring").upsert({
            id: "default",
            config: { ...next, baselines: preview.baselines },
            updated_at: new Date().toISOString(),
          }),
        );
        await audit(db, user.id, body.action, reference.player_id);
        return preview;
      }
    } catch (error) {
      if (error instanceof BaselineReferenceError)
        throw new ApiError(error.message, 400, "INVALID_REFERENCE");
      throw error;
    }
  } else if (body.action === "scoring.save") {
    allow("owner");
    const { scoringConfigSchema } = await import("@/lib/gameplay-scouter/config");
    const config = scoringConfigSchema.parse(data.config);
    await checked(
      db
        .from("moon_scoring")
        .upsert({ id: "default", config, updated_at: new Date().toISOString() }),
    );
  } else if (body.action === "jobs.approve") {
    allow("owner", "coach");
    return checked(db.rpc("moon_approve_job", { actor_id: user.id, job_id: id }));
  } else if (body.action === "jobs.detail") {
    allow("owner", "coach");
    return {
      job: await requireRow(db, "moon_jobs", id),
      players: await checked(db.from("moon_job_players").select("*").eq("job_id", id)),
    };
  } else if (body.action === "jobs.process") {
    allow("owner", "coach");
    const { processReplayJob } = await import("@/lib/gameplay-scouter/pipeline.server");
    return processReplayJob(db, id, user.id);
  } else if (body.action === "jobs.discard") {
    allow("owner", "coach");
    const row = await requireRow(db, "moon_jobs", id);
    if (!["awaiting_review", "error", "pending"].includes(row.status as string))
      throw new ApiError("Este processamento não pode ser descartado.", 409, "JOB_STATE");
    await checked(
      db
        .from("moon_jobs")
        .update({
          status: "discarded",
          error_message: data.reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", row.status),
    );
  } else if (body.action === "jobs.reprocess") {
    allow("owner", "coach");
    const row = await requireRow(db, "moon_jobs", id);
    const stale =
      row.status === "processing" &&
      Date.now() - Date.parse(row.updated_at as string) > 5 * 60 * 1000;
    if (!stale && !["error", "discarded", "awaiting_review"].includes(row.status as string))
      throw new ApiError(
        "Reprocessar exige resultado não aprovado ou processamento parado há mais de cinco minutos.",
        409,
        "JOB_STATE",
      );
    await checked(
      db
        .from("moon_jobs")
        .update({
          status: "pending",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", row.status)
        .eq("attempt", row.attempt),
    );
    const { processReplayJob } = await import("@/lib/gameplay-scouter/pipeline.server");
    response = await processReplayJob(db, id, user.id);
  } else if (body.action === "audit.list") {
    allow("owner");
    return checked(
      db
        .from("moon_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .range(data.offset || 0, (data.offset || 0) + 99),
    );
  } else if (body.action === "media.upload") {
    if (data.purpose === "content") allow("owner", "coach", "editor");
    const bytes = Buffer.from(data.data, "base64");
    if (bytes.length !== data.bytes || !bytes.length || bytes.length > 5 * 1024 * 1024)
      throw new ApiError("Tamanho da imagem inválido.");
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    const extension =
      png && data.content_type === "image/png"
        ? "png"
        : jpeg && data.content_type === "image/jpeg"
          ? "jpg"
          : webp && data.content_type === "image/webp"
            ? "webp"
            : null;
    if (!extension) throw new ApiError("Formato real da imagem não corresponde ao tipo informado.");
    const bucket = data.purpose === "avatar" ? "moon-avatars" : "moon-content";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    await checked(
      db.storage
        .from(bucket)
        .upload(path, bytes, { contentType: data.content_type, upsert: false }),
    );
    return { url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl, path };
  } else {
    const tables: Record<string, string> = {
      partners: "moon_partners",
      socials: "moon_socials",
      games: "moon_games",
      archetypes: "moon_archetypes",
    };
    const [module, operation] = body.action.split(".");
    const table = tables[module];
    if (!table || !["save", "delete"].includes(operation)) throw new ApiError("Ação desconhecida.");
    allow("owner");
    if (operation === "delete") await checked(db.from(table).delete().eq("id", id));
    else {
      const { id: _, ...fields } = data;
      if (id) {
        await requireRow(db, table, id);
        await checked(db.from(table).update(fields).eq("id", id));
      } else await checked(db.from(table).insert(fields));
    }
  }
  await audit(db, user.id, body.action, id);
  return response;
}

export function apiResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export async function boundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiError("Envio excede o limite permitido.", 413, "UPLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
export function apiFailure(error: unknown) {
  if (error instanceof ApiError)
    return apiResponse({ error: error.message, code: error.code }, error.status);
  if (error && typeof error === "object" && "issues" in error)
    return apiResponse({ error: "Revise os campos enviados.", code: "VALIDATION_ERROR" }, 400);
  if (error instanceof SyntaxError)
    return apiResponse({ error: "Envio JSON inválido.", code: "VALIDATION_ERROR" }, 400);
  return apiResponse(
    { error: "Não foi possível concluir a solicitação.", code: "INTERNAL_ERROR" },
    500,
  );
}
