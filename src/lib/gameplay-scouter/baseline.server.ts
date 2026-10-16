import { z } from "zod";
import type { MoonDb } from "../moonastery/server";
import type { ParsedReplay } from "./parser";
import type { ReferencePlayer, ScoringConfig } from "./config";
import { baselineMode, buildPlayerBaselines } from "./baseline";
import type { ReferencePreview, ReferenceSample } from "./baseline";
import { BallchasingProvider } from "./ballchasing.server";
import type { ReplayProvider } from "./ballchasing.server";

export class BaselineReferenceError extends Error {}
const historySchema = z.object({
  job_id: z.string(),
  attempt: z.number(),
  moon_jobs: z.object({ status: z.string(), attempt: z.number() }),
  snapshot: z.object({
    match_id: z.string().min(1),
    playlist: z.string().min(1),
    team_size: z.number().int().positive().optional(),
    duration_seconds: z.number(),
    provider_replay_id: z.string(),
    players: z.array(
      z.object({
        player_id: z.string(),
        duration_seconds: z.number().optional(),
        raw_metrics: z.record(z.number().nullable()),
      }),
    ),
  }),
});
const replayCache = new Map<string, { expires: number; replay: Promise<ParsedReplay> }>();
async function cachedReplay(provider: ReplayProvider, id: string): Promise<ParsedReplay> {
  const cached = replayCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.replay;
  if (replayCache.size >= 200) replayCache.delete(replayCache.keys().next().value!);
  const replay = provider.getReplay(id).catch((error) => {
    replayCache.delete(id);
    throw error;
  });
  replayCache.set(id, { replay, expires: Date.now() + 10 * 60_000 });
  return replay;
}

export async function findReferencePlayer(
  db: MoonDb,
  playerId: string,
  minSamples: number,
): Promise<ReferencePlayer> {
  const { data, error } = await db
    .from("moon_players")
    .select("id,nick,platform,platform_id,moon_memberships!inner(status,role)")
    .eq("id", playerId)
    .maybeSingle();
  if (error)
    throw new BaselineReferenceError("Não foi possível consultar o jogador de referência.");
  const membership = z
    .object({ status: z.string(), role: z.string() })
    .safeParse(data?.moon_memberships);
  if (
    !data ||
    !membership.success ||
    membership.data.status !== "approved" ||
    !["owner", "coach", "player"].includes(membership.data.role) ||
    !data.platform ||
    !data.platform_id
  )
    throw new BaselineReferenceError(
      "Escolha um jogador aprovado com plataforma e ID cadastrados no perfil.",
    );
  return {
    player_id: data.id,
    nick: data.nick,
    platform: data.platform,
    platform_id: data.platform_id,
    min_samples: minSamples,
  };
}

export async function loadReferencePreview(
  db: MoonDb,
  config: ScoringConfig,
  currentReplay?: ParsedReplay,
  options: { provider?: ReplayProvider } = {},
): Promise<ReferencePreview> {
  const reference = config.reference_player;
  if (!reference) throw new BaselineReferenceError("Escolha um jogador de referência.");
  const current = await findReferencePlayer(db, reference.player_id, reference.min_samples);
  if (current.platform !== reference.platform || current.platform_id !== reference.platform_id)
    throw new BaselineReferenceError(
      "O ID desse jogador mudou. Selecione e salve a referência novamente.",
    );
  const { data, error } = await db
    .from("moon_processing_history")
    .select("job_id,attempt,snapshot,moon_jobs!inner(status,attempt)")
    .contains("snapshot->players", JSON.stringify([{ player_id: reference.player_id }]))
    .in("moon_jobs.status", ["approved", "awaiting_review"])
    .order("created_at", { ascending: false })
    .limit(201);
  if (error) throw new BaselineReferenceError("Não foi possível consultar os replays do jogador.");
  const samples: ReferenceSample[] = [];
  const seen = new Set<string>();
  let hydrated = 0;
  let provider = options.provider;
  for (const row of data ?? []) {
    const parsed = historySchema.safeParse(row);
    if (!parsed.success) continue;
    const { snapshot, attempt, moon_jobs: job } = parsed.data;
    if (
      !["approved", "awaiting_review"].includes(job.status) ||
      attempt !== job.attempt ||
      seen.has(snapshot.match_id) ||
      samples.length >= 199
    )
      continue;
    seen.add(snapshot.match_id);
    const player = snapshot.players.find((item) => item.player_id === reference.player_id);
    if (!player) continue;
    let metrics = player.raw_metrics;
    let duration = player.duration_seconds;
    let teamSize = snapshot.team_size;
    // Legacy snapshots did not retain participation time. Recover the original
    // provider data instead of assuming that a player stayed for the whole match.
    const cached = replayCache.get(snapshot.provider_replay_id);
    const cachedAvailable = cached && cached.expires > Date.now();
    if (
      duration === undefined &&
      (cachedAvailable || hydrated < 20) &&
      (provider || process.env.BALLCHASING_API_TOKEN)
    ) {
      provider ??= new BallchasingProvider(process.env.BALLCHASING_API_TOKEN!);
      try {
        if (!cachedAvailable) {
          if (hydrated > 0) await new Promise((resolve) => setTimeout(resolve, 550));
          hydrated++;
        }
        const replay = await cachedReplay(provider, snapshot.provider_replay_id);
        const participant = replay.players.find(
          (item) =>
            item.platform === reference.platform && item.platform_id === reference.platform_id,
        );
        if (
          replay.match_id === snapshot.match_id &&
          replay.playlist === snapshot.playlist &&
          participant
        ) {
          duration = participant.duration_seconds;
          teamSize = replay.team_size;
          metrics = participant.metrics;
        }
      } catch {
        // The preview reports unresolved legacy samples; no invented values.
      }
    }
    samples.push({
      match_id: snapshot.match_id,
      playlist: baselineMode(snapshot.playlist, teamSize),
      revision: attempt,
      duration_seconds: snapshot.duration_seconds,
      player_duration_seconds: duration,
      metrics,
    });
  }
  if (currentReplay) {
    const participant = currentReplay.players.find(
      (item) => item.platform === reference.platform && item.platform_id === reference.platform_id,
    );
    if (participant) {
      // Current provider data supersedes an earlier revision of this match.
      const existing = samples.findIndex((sample) => sample.match_id === currentReplay.match_id);
      if (existing >= 0) samples.splice(existing, 1);
      samples.unshift({
        match_id: currentReplay.match_id,
        playlist: baselineMode(currentReplay.playlist, currentReplay.team_size),
        revision: Number.MAX_SAFE_INTEGER,
        duration_seconds: currentReplay.duration_seconds,
        player_duration_seconds: participant.duration_seconds,
        metrics: participant.metrics,
      });
    }
  }
  return {
    ...buildPlayerBaselines(samples, reference, config),
    truncated: (data?.length ?? 0) > 199,
  };
}
