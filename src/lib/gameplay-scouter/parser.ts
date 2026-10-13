import { z } from "zod";

export class ProviderPendingError extends Error {
  readonly retry_after_ms: number;
  constructor(message = "Replay aguardando processamento do provedor.", retry_after_ms = 30000) {
    super(message);
    this.name = "ProviderPendingError";
    this.retry_after_ms = retry_after_ms;
  }
}
export interface ParsedParticipant {
  platform: string | null;
  platform_id: string | null;
  nick: string;
  team: "blue" | "orange";
  duration_seconds: number;
  metrics: Record<string, number | null>;
}
export interface ParsedReplay {
  provider_replay_id: string;
  match_id: string;
  played_at: string;
  session_date: string;
  playlist: string;
  duration_seconds: number;
  players: ParsedParticipant[];
}
const record = z.record(z.unknown());
const participantSchema = z
  .object({
    name: z.string(),
    id: z.object({ platform: z.string(), id: z.string() }).optional(),
    start_time: z.number().finite().optional(),
    end_time: z.number().finite().optional(),
    stats: record.optional(),
  })
  .passthrough();
const replaySchema = z
  .object({
    id: z.string().min(1),
    status: z.literal("ok"),
    date: z.string(),
    date_has_timezone: z.boolean().optional(),
    date_has_tz: z.boolean().optional(),
    duration: z.number().positive().finite(),
    play_duration: z.number().positive().finite().optional(),
    match_guid: z.string().optional(),
    rocket_league_id: z.string().optional(),
    playlist_id: z.string().min(1),
    blue: z.object({ players: z.array(participantSchema).min(1) }).passthrough(),
    orange: z.object({ players: z.array(participantSchema).min(1) }).passthrough(),
  })
  .passthrough();
export function sessionNight(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(iso))
    throw new Error("Data do replay precisa de timezone explícito.");
  const date = new Date(iso);
  const calendar = iso.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime()) || check.toISOString().slice(0, 10) !== calendar)
    throw new Error("Data de replay inválida.");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function numberMetric(stats: Record<string, unknown>, path: string): number | null {
  const [group, key] = path.split(".");
  const data = stats[group];
  const value =
    data && typeof data === "object" ? (data as Record<string, unknown>)[key] : undefined;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
const METRICS = [
  "core.shots",
  "core.goals",
  "core.assists",
  "core.saves",
  "core.score",
  "core.clears",
  "core.centers",
  "movement.avg_speed",
  "movement.percent_supersonic_speed",
  "movement.avg_powerslide_duration",
  "movement.count_powerslide",
  "positioning.avg_distance_to_mates",
  "positioning.avg_distance_to_ball",
  "positioning.percent_offensive_half",
  "positioning.percent_behind_ball",
  "positioning.goals_against_while_last_defender",
  "boost.amount_stolen",
  "boost.count_collected_small",
  "boost.amount_overfill",
  "boost.percent_zero_boost",
  "boost.amount_used_while_supersonic",
  "demo.inflicted",
  "demo.taken",
];
export function parseBallchasingReplay(payload: unknown): ParsedReplay {
  const status =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).status
      : undefined;
  if (status === "pending" || status === "processing") throw new ProviderPendingError();
  if (status === "failed") throw new Error("Ballchasing não conseguiu analisar o replay.");
  const replay = replaySchema.parse(payload);
  // Ballchasing may normalize the date to UTC (Z) even when the source replay had no timezone metadata.
  // Trust an explicit RFC3339 offset; sessionNight below still rejects timezone-naive dates.
  const session_date = sessionNight(replay.date);
  const duration = replay.play_duration ?? replay.duration;
  const seen = new Set<string>();
  const players = (["blue", "orange"] as const).flatMap((team) =>
    replay[team].players.map((player) => {
      const platform = player.id?.platform.toLowerCase() ?? null,
        platform_id = player.id?.id ?? null;
      const key = platform && platform_id ? `${platform}:${platform_id}` : null;
      if (key && seen.has(key)) throw new Error("Participante repetido no replay.");
      if (key) seen.add(key);
      const span =
        player.end_time !== undefined && player.start_time !== undefined
          ? player.end_time - player.start_time
          : duration;
      const seconds = Math.min(duration, Math.max(0, span));
      const metrics: Record<string, number | null> = Object.fromEntries(
        METRICS.map((path) => [path, numberMetric(player.stats ?? {}, path)]),
      );
      for (const key of Object.keys(metrics))
        if (key.includes(".percent_") && metrics[key]! > 100) metrics[key] = null;
      const perMinute = (value: number | null) => {
        if (value === null || seconds <= 0) return null;
        const rate = (value * 60) / seconds;
        return Number.isFinite(rate) ? rate : null;
      };
      metrics["derived.shooting_conversion"] =
        metrics["core.shots"] !== null &&
        metrics["core.shots"]! > 0 &&
        metrics["core.goals"] !== null &&
        metrics["core.goals"]! <= metrics["core.shots"]!
          ? (metrics["core.goals"]! / metrics["core.shots"]!) * 100
          : null;
      for (const [name, path] of Object.entries({
        goals: "core.goals",
        assists: "core.assists",
        saves: "core.saves",
        demos: "demo.inflicted",
        stolen_boost: "boost.amount_stolen",
        small_pads: "boost.count_collected_small",
        overfill: "boost.amount_overfill",
        last_defender_conceded: "positioning.goals_against_while_last_defender",
      }))
        metrics[`derived.${name}_per_minute`] = perMinute(metrics[path]);
      // These concepts cannot be inferred from the aggregate provider response.
      for (const unavailable of [
        "individual_possession",
        "assists_per_possession",
        "xg",
        "last_man_mistakes",
        "rotation_efficiency",
      ])
        metrics[`unavailable.${unavailable}`] = null;
      return { platform, platform_id, nick: player.name, team, duration_seconds: seconds, metrics };
    }),
  );
  return {
    provider_replay_id: replay.id,
    match_id: replay.match_guid ?? replay.rocket_league_id ?? replay.id,
    played_at: replay.date,
    session_date,
    playlist: replay.playlist_id,
    duration_seconds: duration,
    players,
  };
}
