import { z } from "zod";
import { ApiError } from "../moonastery/server";
import type { MoonDb } from "../moonastery/server";
import { BallchasingProvider } from "./ballchasing.server";
import type { ReplayProvider } from "./ballchasing.server";
import { findReferencePlayer, loadReferencePreview } from "./baseline.server";
import { scoringConfigSchema } from "./config";
import { evaluateReplay } from "./scoring";

const replayJobSchema = z.object({
  job_id: z.string().uuid(),
  moon_jobs: z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "awaiting_review"]),
    attempt: z.number().int(),
    updated_at: z.string(),
    match_id: z.string(),
    provider_replay_id: z.string(),
    session_date: z.string(),
  }),
});

export async function loadPlayerReplayJobs(db: MoonDb, playerId: string) {
  const jobs: z.infer<typeof replayJobSchema>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("moon_job_players")
      .select(
        "job_id,moon_jobs!inner(id,status,attempt,updated_at,match_id,provider_replay_id,session_date)",
      )
      .eq("player_id", playerId)
      .in("moon_jobs.status", ["approved", "awaiting_review"])
      .order("job_id")
      .range(offset, offset + 499);
    if (error) throw new ApiError("Não foi possível consultar os replays do jogador.");
    jobs.push(...z.array(replayJobSchema).parse(data ?? []));
    if (!data || data.length < 500) return jobs;
  }
}

/** Compute everything first; one database transaction publishes only this player's results. */
export async function recalculatePlayer(
  db: MoonDb,
  actorId: string,
  playerId: string,
  options: { provider?: ReplayProvider; pause?: () => Promise<void> } = {},
) {
  const [jobs, settings] = await Promise.all([
    loadPlayerReplayJobs(db, playerId),
    db.from("moon_scoring").select("config").eq("id", "default").maybeSingle(),
  ]);
  if (settings.error) throw new ApiError("Não foi possível consultar a configuração atual.");
  if (!jobs.length)
    throw new ApiError("Este jogador ainda não tem replays analisados para recalcular.");
  const expectedConfig = settings.data?.config;
  if (!expectedConfig) throw new ApiError("Configure o baseline antes de recalcular as métricas.");
  let config = scoringConfigSchema.parse(expectedConfig);
  const provider =
    options.provider ?? new BallchasingProvider(process.env.BALLCHASING_API_TOKEN ?? "");
  if (config.reference_player) {
    const reference = await loadReferencePreview(db, config, undefined, { provider });
    config = { ...config, baselines: reference.baselines };
  }
  const results = [];
  for (const { moon_jobs: job } of jobs) {
    if (results.length)
      await (options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 550))))();
    const replay = await provider.getReplay(job.provider_replay_id);
    if (
      replay.provider_replay_id !== job.provider_replay_id ||
      replay.match_id !== job.match_id ||
      replay.session_date !== job.session_date
    )
      throw new ApiError("Os dados do replay não correspondem à análise salva. Nada foi alterado.");
    const evaluation = evaluateReplay(
      replay,
      [
        {
          id: playerId,
          platform: player.platform,
          platform_id: player.platform_id,
        },
      ],
      config,
    ).players[0];
    if (!evaluation)
      throw new ApiError(
        "A conta atual do jogador não foi identificada em um replay. Confira a plataforma e o ID; nada foi alterado.",
      );
    results.push({
      job_id: job.id,
      attempt: job.attempt,
      status: job.status,
      updated_at: job.updated_at,
      account: { platform: player.platform, platform_id: player.platform_id },
      evaluation,
    });
  }
  if (!results.some((result) => result.evaluation.config_snapshot?.baseline))
    throw new ApiError(
      "Nenhum dos modos deste jogador tem baseline disponível. Configure uma referência antes de recalcular.",
    );
  const { data, error } = await db.rpc("moon_recalculate_player", {
    actor_id: actorId,
    target_player_id: playerId,
    expected_config: expectedConfig,
    scoring_config: config,
    replay_results: results,
  });
  if (error) {
    if (error.message.includes("RECALCULATION_STALE"))
      throw new ApiError(
        "Os replays ou a configuração mudaram durante o recálculo. Tente novamente.",
        409,
      );
    throw new ApiError(
      "Não foi possível salvar o recálculo. Nenhuma alteração deste recálculo foi aplicada.",
    );
  }
  return data as { replays: number; reports: number };
}
