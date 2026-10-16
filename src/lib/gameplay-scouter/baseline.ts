import { ATTRIBUTES } from "./config";
import type { Baseline, ReferencePlayer, ScoringConfig } from "./config";

export const PLAYLISTS = [
  ["ranked-duels", "1v1 ranqueado"],
  ["ranked-doubles", "2v2 ranqueado"],
  ["ranked-standard", "3v3 ranqueado"],
  ["unranked-duels", "1v1 casual"],
  ["unranked-doubles", "2v2 casual"],
  ["unranked-standard", "3v3 casual"],
  ["unranked-chaos", "4v4 casual"],
  ["ranked-hoops", "Hoops ranqueado"],
  ["hoops", "Hoops"],
  ["ranked-rumble", "Rumble ranqueado"],
  ["rumble", "Rumble"],
  ["ranked-dropshot", "Dropshot ranqueado"],
  ["dropshot", "Dropshot"],
  ["ranked-snowday", "Snow Day ranqueado"],
  ["snowday", "Snow Day"],
  ["private", "Partidas privadas / treinos"],
  ["tournament", "Torneios"],
  ["heatseeker", "Heatseeker"],
  ["rocketlabs", "Rocket Labs"],
  ["dropshot-rumble", "Dropshot Rumble"],
  ["ranked-solo-standard", "Solo Standard"],
  ["season", "Temporada offline"],
  ["offline", "Offline"],
] as const;
export const playlistLabel = (playlist: string) => {
  const [id, format] = playlist.split(":");
  const label = PLAYLISTS.find(([key]) => key === id)?.[1] ?? id;
  return format ? `${label} (${format})` : label;
};
export function baselineMode(playlist: string, teamSize?: number) {
  if (
    ["private", "tournament", "offline", "season", "rocketlabs", "heatseeker"].includes(playlist) &&
    teamSize &&
    teamSize > 0
  )
    return `${playlist}:${teamSize}v${teamSize}`;
  return playlist;
}

export interface ReferenceSample {
  match_id: string;
  playlist: string;
  revision: number;
  duration_seconds: number;
  player_duration_seconds?: number;
  metrics: Record<string, number | null>;
}
export interface ReferencePreview {
  reference: ReferencePlayer;
  baselines: Baseline[];
  modes: { playlist: string; matches: number; metrics: number; ready: boolean }[];
  legacy_samples: number;
  truncated: boolean;
}

export function buildPlayerBaselines(
  samples: ReferenceSample[],
  reference: ReferencePlayer,
  config: ScoringConfig,
): Omit<ReferencePreview, "truncated"> {
  // A reprocessed or duplicate match contributes only its newest revision.
  const newest = new Map<string, ReferenceSample>();
  for (const sample of samples) {
    const previous = newest.get(sample.match_id);
    if (!previous || sample.revision > previous.revision) newest.set(sample.match_id, sample);
  }
  const groups = new Map<string, ReferenceSample[]>();
  let legacy = 0;
  for (const sample of newest.values()) {
    if (
      !Number.isFinite(sample.duration_seconds) ||
      sample.duration_seconds < config.reliability.min_duration_seconds
    )
      continue;
    if (sample.player_duration_seconds === undefined) {
      // Old snapshots retain match duration only; never assume full participation.
      legacy++;
      continue;
    }
    if (
      !Number.isFinite(sample.player_duration_seconds) ||
      sample.player_duration_seconds < config.reliability.min_player_duration_seconds
    )
      continue;
    const group = groups.get(sample.playlist) ?? [];
    group.push(sample);
    groups.set(sample.playlist, group);
  }
  const baselines: Baseline[] = [];
  const modes: ReferencePreview["modes"] = [];
  const requiredMetrics = new Set([
    ...Object.values(config.attributes).flatMap((rule) =>
      rule.metrics.map((metric) => metric.metric),
    ),
    "positioning.avg_distance_to_ball",
  ]);
  for (const [playlist, group] of groups) {
    const metrics: Baseline["metrics"] = {};
    for (const metric of requiredMetrics) {
      const values = group
        .map((sample) => sample.metrics[metric])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (values.length < reference.min_samples) continue;
      // Welford's algorithm, sample standard deviation (n - 1).
      let mean = 0,
        m2 = 0;
      values.forEach((value, index) => {
        const delta = value - mean;
        mean += delta / (index + 1);
        m2 += delta * (value - mean);
      });
      const stddev = Math.sqrt(m2 / (values.length - 1));
      if (!Number.isFinite(stddev) || stddev <= 0) continue;
      metrics[metric] = { mean, stddev, samples: values.length };
    }
    const ready = group.length >= reference.min_samples && Object.keys(metrics).length > 0;
    modes.push({ playlist, matches: group.length, metrics: Object.keys(metrics).length, ready });
    if (ready)
      baselines.push({
        version: `player-${reference.player_id}-${group.length}-${Math.max(...group.map((s) => s.revision))}`,
        source: `Replays medidos de ${reference.nick} (${reference.platform}:${reference.platform_id}); referência individual, sem certificação de rank SSL.`,
        cohort: "PLAYER",
        playlist,
        min_samples: reference.min_samples,
        metrics,
        match_ids: group.map((sample) => sample.match_id).sort(),
      });
  }
  return {
    reference,
    baselines,
    modes: modes.sort((a, b) => a.playlist.localeCompare(b.playlist)),
    legacy_samples: legacy,
  };
}

export function resolveScoringConfig(
  config: ScoringConfig,
  playlist: string,
  teamSize?: number,
): ScoringConfig {
  const mode = baselineMode(playlist, teamSize);
  const generic =
    config.baseline?.cohort === "GENERIC"
      ? config.baseline
      : (config.baselines?.find((entry) => entry.cohort === "GENERIC") ?? null);
  const baseline =
    config.baselines?.find((entry) => entry.playlist === mode) ??
    (!config.reference_player &&
    (config.baseline?.playlist === playlist || config.baseline?.playlist === mode)
      ? config.baseline
      : null) ??
    generic;
  if (
    (!config.reference_player && baseline?.cohort !== "GENERIC") ||
    (!["ranked-duels", "unranked-duels"].includes(playlist) && !mode.endsWith(":1v1"))
  )
    return { ...config, baseline };
  const attributes = structuredClone(config.attributes);
  // Assists and teammate distance are not meaningful in solo play.
  for (const attribute of ATTRIBUTES) {
    if (attribute === "POS") {
      attributes.POS.metrics = [
        { metric: "positioning.avg_distance_to_ball", weight: 0.5, direction: "target" },
        { metric: "positioning.percent_behind_ball", weight: 0.5, direction: "target" },
      ];
      continue;
    }
    const applicable = attributes[attribute].metrics.filter(
      (m) =>
        m.metric !== "derived.assists_per_minute" &&
        m.metric !== "positioning.avg_distance_to_mates",
    );
    const total = applicable.reduce((sum, metric) => sum + metric.weight, 0);
    if (total > 0)
      attributes[attribute].metrics = applicable.map((metric) => ({
        ...metric,
        weight: metric.weight / total,
      }));
  }
  return { ...config, baseline, attributes };
}
