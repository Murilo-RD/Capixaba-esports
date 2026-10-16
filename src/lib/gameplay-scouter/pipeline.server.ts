import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BallchasingProvider, validateReplayFile } from "./ballchasing.server";
import type { ReplayProvider } from "./ballchasing.server";
import { ProviderPendingError } from "./parser";
import { scoringConfigSchema } from "./config";
import { evaluateReplay } from "./scoring";
import { resolveScoringConfig } from "./baseline";
import { loadReferencePreview } from "./baseline.server";
import type { Player } from "../moonastery/types";

function checked(error: { message: string } | null, label: string): void {
  if (error) throw new Error(`${label}: operação de persistência não concluída.`);
}
async function requireProcessor(db: SupabaseClient, actorId: string): Promise<void> {
  const { data, error } = await db
    .from("moon_memberships")
    .select("status,role")
    .eq("id", actorId)
    .single();
  checked(error, "Autorização");
  if (data?.status !== "approved" || !["owner", "coach"].includes(data.role))
    throw new Error("Apenas coaches e owners aprovados podem processar replays.");
}
export async function ingestReplay(
  db: SupabaseClient,
  actorId: string,
  input: { bytes: Uint8Array; filename: string },
): Promise<{ job_id: string; replay_id: string; duplicate: boolean }> {
  await requireProcessor(db, actorId);
  validateReplayFile(input.bytes, input.filename);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const existing = await db.from("moon_replays").select("id").eq("sha256", sha256).maybeSingle();
  checked(existing.error, "Consulta de duplicidade");
  let replayId: string;
  let duplicate = Boolean(existing.data);
  if (existing.data) replayId = existing.data.id;
  else {
    replayId = randomUUID();
    const path = `${actorId}/${replayId}.replay`;
    const storage = await db.storage
      .from("moon-replays")
      .upload(path, input.bytes, { contentType: "application/octet-stream", upsert: false });
    checked(storage.error, "Upload privado");
    const inserted = await db
      .from("moon_replays")
      .insert({
        id: replayId,
        sha256,
        storage_path: path,
        filename: input.filename,
        byte_size: input.bytes.byteLength,
        created_by: actorId,
      })
      .select("id")
      .single();
    if (inserted.error) {
      const cleanup = await db.storage.from("moon-replays").remove([path]);
      checked(cleanup.error, "Limpeza de upload não associado");
      if (inserted.error.code !== "23505") checked(inserted.error, "Registro de replay");
      const raced = await db.from("moon_replays").select("id").eq("sha256", sha256).single();
      checked(raced.error, "Registro concorrente");
      replayId = raced.data!.id;
      duplicate = true;
    }
  }
  // Discarded files remain traceable and are not automatically revived by another upload.
  const job = await db
    .from("moon_jobs")
    .select("id")
    .eq("replay_id", replayId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  checked(job.error, "Consulta de processamento");
  if (job.data) return { job_id: job.data.id, replay_id: replayId, duplicate: true };
  const created = await db
    .from("moon_jobs")
    .insert({
      replay_id: replayId,
      status: "pending",
      logs: [{ event: "received", at: new Date().toISOString(), actor_id: actorId }],
    })
    .select("id")
    .single();
  if (created.error?.code === "23505") {
    const concurrent = await db
      .from("moon_jobs")
      .select("id")
      .eq("replay_id", replayId)
      .neq("status", "discarded")
      .single();
    checked(concurrent.error, "Processamento concorrente");
    return { job_id: concurrent.data!.id, replay_id: replayId, duplicate: true };
  }
  checked(created.error, "Fila de processamento");
  return { job_id: created.data!.id, replay_id: replayId, duplicate };
}
export interface ProcessResult {
  job_id: string;
  status: string;
  retry_after_ms?: number;
  error_message?: string;
}
export async function processReplayJob(
  db: SupabaseClient,
  jobId: string,
  actorId: string,
  options: { provider?: ReplayProvider } = {},
): Promise<ProcessResult> {
  await requireProcessor(db, actorId);
  const read = await db.from("moon_jobs").select("*").eq("id", jobId).single();
  checked(read.error, "Consulta de job");
  const job = read.data!;
  if (!["pending", "error"].includes(job.status)) return { job_id: jobId, status: job.status };
  const priorLogs = Array.isArray(job.logs) ? job.logs : [];
  const nextRetry = priorLogs
    .filter((log: Record<string, unknown>) => log.event === "provider_pending")
    .at(-1)?.retry_at;
  if (
    job.status === "pending" &&
    typeof nextRetry === "string" &&
    Date.parse(nextRetry) > Date.now()
  )
    return { job_id: jobId, status: "pending", retry_after_ms: Date.parse(nextRetry) - Date.now() };
  const attempt = Number(job.attempt) + 1;
  const logs = [
    ...priorLogs,
    { event: "processing", at: new Date().toISOString(), attempt, actor_id: actorId },
  ];
  const claim = await db
    .from("moon_jobs")
    .update({
      status: "processing",
      attempt,
      error_message: null,
      logs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", job.status)
    .eq("attempt", job.attempt)
    .select("id")
    .maybeSingle();
  checked(claim.error, "Reserva do processamento");
  if (!claim.data) return { job_id: jobId, status: "processing" };
  try {
    const provider =
      options.provider ?? new BallchasingProvider(process.env.BALLCHASING_API_TOKEN ?? "");
    let providerId = job.provider_replay_id as string | null;
    if (!providerId) {
      const replay = await db
        .from("moon_replays")
        .select("storage_path,filename")
        .eq("id", job.replay_id)
        .single();
      checked(replay.error, "Arquivo original");
      const file = await db.storage.from("moon-replays").download(replay.data!.storage_path);
      checked(file.error, "Download privado");
      if (!file.data) throw new Error("Arquivo do replay não encontrado.");
      const uploaded = await provider.upload(
        new Uint8Array(await file.data.arrayBuffer()),
        replay.data!.filename,
      );
      providerId = uploaded.id;
      const linked = await db
        .from("moon_jobs")
        .update({ provider_replay_id: providerId, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("attempt", attempt)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();
      if (linked.error?.code === "23505")
        throw new Error("Este replay já possui processamento associado no Ballchasing.");
      checked(linked.error, "Vínculo Ballchasing");
      if (!linked.data)
        throw new Error("Reserva de processamento expirou; execute novamente a tentativa atual.");
    }
    const parsed = await provider.getReplay(providerId);
    const [players, settings] = await Promise.all([
      db.from("moon_players").select("id,platform,platform_id").not("platform", "is", null),
      db.from("moon_scoring").select("config").eq("id", "default").maybeSingle(),
    ]);
    checked(players.error, "Identificação de jogadores");
    checked(settings.error, "Configuração de avaliação");
    let config = settings.data?.config ? scoringConfigSchema.parse(settings.data.config) : null;
    if (config?.reference_player) {
      const reference = await loadReferencePreview(db, config, parsed, { provider });
      config = { ...config, baselines: reference.baselines };
    }
    if (config) config = resolveScoringConfig(config, parsed.playlist, parsed.team_size);
    const evaluation = evaluateReplay(
      parsed,
      (players.data ?? []) as Pick<Player, "id" | "platform" | "platform_id">[],
      config,
    );
    const result = {
      ...evaluation,
      provider_replay_id: parsed.provider_replay_id,
      match_id: parsed.match_id,
      played_at: parsed.played_at,
      playlist: parsed.playlist,
      team_size: parsed.team_size,
      duration_seconds: parsed.duration_seconds,
      config_snapshot: config,
      logs: [
        ...logs,
        {
          event: "metrics_extracted",
          at: new Date().toISOString(),
          identified: evaluation.players.length,
        },
      ],
    };
    const saved = await db.rpc("moon_complete_processing", {
      target_job_id: jobId,
      target_attempt: attempt,
      processing_result: result,
    });
    if (saved.error?.code === "23505")
      throw new Error("Partida duplicada: um replay desta partida já foi registrado.");
    checked(saved.error, "Publicação transacional das métricas");
    return { job_id: jobId, status: "awaiting_review" };
  } catch (error) {
    const pending = error instanceof ProviderPendingError;
    // Validation messages contain fields only; provider errors never expose authorization headers.
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erro ao processar replay.";
    const failureLogs = [
      ...logs,
      {
        event: pending ? "provider_pending" : "processing_error",
        at: new Date().toISOString(),
        message,
        ...(pending ? { retry_at: new Date(Date.now() + error.retry_after_ms).toISOString() } : {}),
      },
    ];
    const updated = await db
      .from("moon_jobs")
      .update({
        status: pending ? "pending" : "error",
        error_message: message,
        logs: failureLogs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("attempt", attempt)
      .eq("status", "processing")
      .select("status")
      .maybeSingle();
    checked(updated.error, "Estado de erro do processamento");
    if (!updated.data) {
      const current = await db.from("moon_jobs").select("status").eq("id", jobId).single();
      checked(current.error, "Tentativa atual");
      return { job_id: jobId, status: current.data!.status };
    }
    return {
      job_id: jobId,
      status: pending ? "pending" : "error",
      error_message: message,
      ...(pending ? { retry_after_ms: error.retry_after_ms } : {}),
    };
  }
}
