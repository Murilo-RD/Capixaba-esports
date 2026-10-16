import { z } from "zod";
import type { Attribute, Attributes } from "../moonastery/types";

export const ATTRIBUTES: Attribute[] = ["VEL", "FIN", "CRI", "DEF", "POS", "BST", "IMP"];
export const emptyAttributes = (): Attributes => ({
  VEL: null,
  FIN: null,
  CRI: null,
  DEF: null,
  POS: null,
  BST: null,
  IMP: null,
});
const metricRule = z
  .object({
    metric: z.string().min(1).max(100),
    weight: z.number().positive().max(1),
    direction: z.enum(["higher", "lower", "target"]),
  })
  .strict();
const attributeRule = z
  .object({
    metrics: z.array(metricRule).min(1).max(30),
    minimum_coverage: z.number().min(0.1).max(1),
  })
  .strict()
  .refine(
    (v) => Math.abs(v.metrics.reduce((s, m) => s + m.weight, 0) - 1) < 0.00001,
    "Os pesos das métricas devem somar 1.",
  )
  .refine(
    (v) => new Set(v.metrics.map((m) => m.metric)).size === v.metrics.length,
    "Métricas repetidas.",
  );
export const baselineSchema = z
  .object({
    version: z.string().min(1).max(100),
    source: z.string().min(1).max(2000),
    cohort: z.enum(["SSL", "PLAYER"]),
    playlist: z.string().min(1).max(100),
    min_samples: z.number().int().min(2),
    metrics: z.record(
      z
        .object({
          mean: z.number().finite(),
          stddev: z.number().finite().positive(),
          samples: z.number().int().min(2),
        })
        .strict(),
    ),
    match_ids: z.array(z.string().min(1).max(200)).max(200).optional(),
  })
  .strict();
export const referencePlayerSchema = z
  .object({
    player_id: z.string().uuid(),
    nick: z.string().min(1).max(200),
    platform: z.enum(["steam", "epic", "ps4"]),
    platform_id: z.string().min(1).max(200),
    min_samples: z.number().int().min(2).max(100),
  })
  .strict();
export const scoringConfigSchema = z
  .object({
    version: z.string().min(1).max(100),
    baseline: baselineSchema.nullable(),
    baselines: z
      .array(baselineSchema)
      .max(64)
      .refine(
        (entries) => new Set(entries.map((entry) => entry.playlist)).size === entries.length,
        "Use apenas uma baseline por modo de jogo.",
      )
      .optional(),
    reference_player: referencePlayerSchema.nullable().optional(),
    attributes: z
      .object({
        VEL: attributeRule,
        FIN: attributeRule,
        CRI: attributeRule,
        DEF: attributeRule,
        POS: attributeRule,
        BST: attributeRule,
        IMP: attributeRule,
      })
      .strict(),
    scale: z
      .object({
        center: z.number().min(0).max(99),
        points_per_z: z.number().positive().max(99),
        z_clip: z.number().positive().max(10),
      })
      .strict(),
    reliability: z
      .object({
        min_duration_seconds: z.number().positive(),
        min_player_duration_seconds: z.number().positive(),
        minimum_overall_coverage: z.literal(1),
      })
      .strict(),
    evolution: z
      .object({
        smoothing: z.number().positive().max(1),
        maximum_nightly_increase: z.number().min(0).max(1),
      })
      .strict(),
    opponent: z
      .object({
        reference_strength: z.number().positive(),
        minimum_multiplier: z.number().positive().max(1),
        maximum_multiplier: z.number().min(1).max(2),
        max_evidence_age_days: z.number().int().positive(),
        evidence: z
          .array(
            z
              .object({
                platform: z.string().min(1),
                platform_id: z.string().min(1),
                strength: z.number().positive(),
                source: z.string().url(),
                verified_at: z.string().datetime({ offset: true }),
              })
              .strict(),
          )
          .max(1000),
      })
      .strict(),
  })
  .strict();
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type Baseline = z.infer<typeof baselineSchema>;
export type ReferencePlayer = z.infer<typeof referencePlayerSchema>;

// These are proposed policy weights, never a fabricated SSL distribution.
const rules = (
  metrics: [string, number, "higher" | "lower" | "target"][],
  minimum_coverage = 0.75,
) => ({
  metrics: metrics.map(([metric, weight, direction]) => ({ metric, weight, direction })),
  minimum_coverage,
});
export const DEFAULT_SCORING_SETTINGS: ScoringConfig = {
  version: "moonastery-zscore-v1",
  baseline: null,
  attributes: {
    VEL: rules([
      ["movement.avg_speed", 0.5, "higher"],
      ["movement.percent_supersonic_speed", 0.3, "higher"],
      ["movement.avg_powerslide_duration", 0.2, "target"],
    ]),
    FIN: rules([
      ["derived.shooting_conversion", 0.6, "higher"],
      ["derived.goals_per_minute", 0.4, "higher"],
    ]),
    CRI: rules([
      ["derived.assists_per_minute", 0.5, "higher"],
      ["derived.demos_per_minute", 0.25, "higher"],
      ["positioning.percent_offensive_half", 0.25, "higher"],
    ]),
    DEF: rules([
      ["derived.saves_per_minute", 0.5, "higher"],
      ["derived.last_defender_conceded_per_minute", 0.25, "lower"],
      ["positioning.percent_behind_ball", 0.25, "target"],
    ]),
    POS: rules([
      ["positioning.avg_distance_to_mates", 0.5, "target"],
      ["positioning.percent_behind_ball", 0.5, "target"],
    ]),
    BST: rules([
      ["derived.stolen_boost_per_minute", 0.3, "higher"],
      ["derived.small_pads_per_minute", 0.3, "higher"],
      ["derived.overfill_per_minute", 0.4, "lower"],
    ]),
    IMP: rules([
      ["derived.goals_per_minute", 0.4, "higher"],
      ["derived.assists_per_minute", 0.3, "higher"],
      ["derived.saves_per_minute", 0.3, "higher"],
    ]),
  },
  scale: { center: 70, points_per_z: 10, z_clip: 3 },
  reliability: {
    min_duration_seconds: 120,
    min_player_duration_seconds: 120,
    minimum_overall_coverage: 1,
  },
  evolution: { smoothing: 0.2, maximum_nightly_increase: 1 },
  opponent: {
    reference_strength: 22,
    minimum_multiplier: 0.75,
    maximum_multiplier: 1.1,
    max_evidence_age_days: 30,
    evidence: [],
  },
};
