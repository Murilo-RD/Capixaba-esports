import { DEFAULT_SCORING_SETTINGS } from "./config";
import type { Baseline, ScoringConfig } from "./config";

// Illustrative policy centers and comparison scales, not empirical distributions.
// Zero samples explicitly records that no player or SSL replays were collected.
const parameters: Record<string, [number, number]> = {
  "movement.avg_speed": [1400, 300],
  "movement.percent_supersonic_speed": [15, 10],
  "movement.avg_powerslide_duration": [0.25, 0.15],
  "derived.shooting_conversion": [30, 20],
  "derived.goals_per_minute": [0.3, 0.4],
  "derived.assists_per_minute": [0.2, 0.3],
  "derived.demos_per_minute": [0.2, 0.3],
  "positioning.percent_offensive_half": [45, 20],
  "derived.saves_per_minute": [0.4, 0.5],
  "derived.last_defender_conceded_per_minute": [0.2, 0.3],
  "positioning.percent_behind_ball": [60, 25],
  "positioning.avg_distance_to_mates": [3000, 1600],
  "positioning.avg_distance_to_ball": [2200, 1200],
  "derived.stolen_boost_per_minute": [80, 70],
  "derived.small_pads_per_minute": [3.5, 3],
  "derived.overfill_per_minute": [90, 100],
};

export function genericBaseline(): Baseline {
  return {
    version: "generic-temporary-all-modes-v1",
    source:
      "Parâmetros hipotéticos provisórios para todos os modos. Centros e escalas definidos como política inicial; não são médias/desvios medidos, não representam SSL e não têm replays coletados (samples=0).",
    cohort: "GENERIC",
    playlist: "*",
    min_samples: 0,
    metrics: Object.fromEntries(
      Object.entries(parameters).map(([metric, [mean, stddev]]) => [
        metric,
        { mean, stddev, samples: 0 },
      ]),
    ),
  };
}

export function withGenericBaseline(
  config: ScoringConfig = DEFAULT_SCORING_SETTINGS,
): ScoringConfig {
  const next = structuredClone(config);
  const measured = (next.baselines ?? []).filter((entry) => entry.cohort !== "GENERIC");
  if (
    next.baseline &&
    next.baseline.cohort !== "GENERIC" &&
    !measured.some((entry) => entry.playlist === next.baseline!.playlist)
  )
    measured.push(next.baseline);
  return { ...next, baseline: genericBaseline(), baselines: measured };
}

export function withoutGenericBaseline(config: ScoringConfig): ScoringConfig {
  return {
    ...config,
    baseline: config.baseline?.cohort === "GENERIC" ? null : config.baseline,
    baselines: config.baselines?.filter((entry) => entry.cohort !== "GENERIC"),
  };
}
