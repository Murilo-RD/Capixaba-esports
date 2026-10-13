import type { Attribute, Attributes, Player, PublicPlayer } from "../moonastery/types";
import { ATTRIBUTES, emptyAttributes, scoringConfigSchema } from "./config";
import type { ScoringConfig } from "./config";
import type { ParsedReplay, ParsedParticipant } from "./parser";

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function zScore(
  value: number,
  mean: number,
  stddev: number,
  direction: "higher" | "lower" | "target" = "higher",
): number | null {
  if (![value, mean, stddev].every(Number.isFinite) || stddev <= 0) return null;
  const z = (value - mean) / stddev;
  if (!Number.isFinite(z)) return null;
  return direction === "lower" ? -z : direction === "target" ? -Math.abs(z) : z;
}
export function calculateOverall(
  attributes: Attributes,
  weights: Record<Attribute, number>,
): number | null {
  if (
    ATTRIBUTES.some((a) => !Number.isFinite(weights[a]) || weights[a] < 0) ||
    Math.abs(ATTRIBUTES.reduce((sum, a) => sum + weights[a], 0) - 1) > 0.00001
  )
    throw new Error("Pesos do arquétipo inválidos.");
  let sum = 0;
  for (const attribute of ATTRIBUTES) {
    const value = attributes[attribute];
    if (
      weights[attribute] > 0 &&
      (value === null || !Number.isFinite(value) || value < 0 || value > 99)
    )
      return null;
    if (value !== null) sum += value * weights[attribute];
  }
  return round(sum);
}
export interface OpponentAdjustment {
  known: boolean;
  multiplier: number;
  reason: string;
  identities: string[];
}
export function opponentAdjustment(
  replay: ParsedReplay,
  participant: ParsedParticipant,
  config: ScoringConfig,
): OpponentAdjustment {
  const opponents = replay.players.filter((p) => p.team !== participant.team);
  const identities = opponents.map(
    (p) => `${p.platform ?? "unknown"}:${p.platform_id ?? "unknown"}`,
  );
  const strengths: number[] = [];
  const played = new Date(replay.played_at).getTime();
  for (const opponent of opponents) {
    const candidates = config.opponent.evidence
      .filter(
        (e) =>
          e.platform === opponent.platform &&
          e.platform_id === opponent.platform_id &&
          new Date(e.verified_at).getTime() <= played,
      )
      .sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime());
    const evidence = candidates[0];
    if (
      !evidence ||
      played - new Date(evidence.verified_at).getTime() >
        config.opponent.max_evidence_age_days * 86400000
    )
      return {
        known: false,
        multiplier: 1,
        reason:
          "Força adversária desconhecida: ausência de rank verificado e contemporâneo de todos os adversários.",
        identities,
      };
    strengths.push(evidence.strength);
  }
  if (!strengths.length)
    return { known: false, multiplier: 1, reason: "Sem adversários identificados.", identities };
  return {
    known: true,
    multiplier: clamp(
      strengths.reduce((s, v) => s + v, 0) / strengths.length / config.opponent.reference_strength,
      config.opponent.minimum_multiplier,
      config.opponent.maximum_multiplier,
    ),
    reason: "Ranks externos verificados, com fonte e data, disponíveis para todos os adversários.",
    identities,
  };
}
export interface TacticalAlert {
  metric: string;
  value: number;
  z: number;
  message: string;
}
export interface PlayerEvaluation {
  player_id: string;
  attributes: Attributes;
  raw_metrics: Record<string, number | null>;
  confidence: Record<Attribute, number>;
  alerts: TacticalAlert[];
  config_snapshot: ScoringConfig | null;
  opponent: OpponentAdjustment;
  reasons: string[];
}
export interface ReplayEvaluation {
  session_date: string;
  players: PlayerEvaluation[];
  unmatched: { platform: string | null; platform_id: string | null; nick: string }[];
  warnings: string[];
}
export function evaluateReplay(
  replay: ParsedReplay,
  registered: Pick<Player, "id" | "platform" | "platform_id">[],
  input: ScoringConfig | null,
): ReplayEvaluation {
  const config = input === null ? null : scoringConfigSchema.parse(input);
  const result: ReplayEvaluation = {
    session_date: replay.session_date,
    players: [],
    unmatched: [],
    warnings: [],
  };
  const mapped = new Set<string>();
  for (const participant of replay.players) {
    const matches = registered.filter(
      (p) =>
        p.platform !== null &&
        p.platform_id !== null &&
        p.platform === participant.platform &&
        p.platform_id === participant.platform_id,
    );
    if (matches.length !== 1) {
      result.unmatched.push({
        platform: participant.platform,
        platform_id: participant.platform_id,
        nick: participant.nick,
      });
      continue;
    }
    const player = matches[0];
    if (mapped.has(player.id)) throw new Error("Identidade do jogador repetida.");
    mapped.add(player.id);
    const evaluation: PlayerEvaluation = {
      player_id: player.id,
      attributes: emptyAttributes(),
      raw_metrics: { ...participant.metrics },
      confidence: Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<Attribute, number>,
      alerts: [],
      config_snapshot: config,
      opponent: {
        known: false,
        multiplier: 1,
        reason: "Sem configuração de scoring.",
        identities: [],
      },
      reasons: [],
    };
    if (!config?.baseline) evaluation.reasons.push("Baseline SSL real não configurada.");
    else if (config.baseline.playlist !== replay.playlist)
      evaluation.reasons.push("Modalidade do replay não corresponde à baseline SSL.");
    else if (
      replay.duration_seconds < config.reliability.min_duration_seconds ||
      participant.duration_seconds < config.reliability.min_player_duration_seconds
    )
      evaluation.reasons.push("Duração abaixo do mínimo de confiabilidade.");
    else {
      evaluation.opponent = opponentAdjustment(replay, participant, config);
      for (const attribute of ATTRIBUTES) {
        const rule = config.attributes[attribute];
        let weight = 0,
          weighted = 0;
        for (const metric of rule.metrics) {
          const value = participant.metrics[metric.metric],
            baseline = config.baseline.metrics[metric.metric];
          if (
            value === null ||
            value === undefined ||
            !baseline ||
            baseline.samples < config.baseline.min_samples
          )
            continue;
          const z = zScore(value, baseline.mean, baseline.stddev, metric.direction);
          if (z === null) continue;
          weight += metric.weight;
          weighted += clamp(z, -config.scale.z_clip, config.scale.z_clip) * metric.weight;
          if (z <= -2 && !evaluation.alerts.some((a) => a.metric === metric.metric))
            evaluation.alerts.push({
              metric: metric.metric,
              value,
              z: round(z),
              message: `${metric.metric}: desvio desfavorável de ${round(Math.abs(z))} desvios-padrão em relação à baseline SSL; revisar contexto com o coach.`,
            });
        }
        evaluation.confidence[attribute] = round(weight);
        if (weight + 1e-9 < rule.minimum_coverage) {
          evaluation.reasons.push(
            `${attribute}: métricas/baselines insuficientes (${round(weight * 100)}% de cobertura).`,
          );
          continue;
        }
        const score = config.scale.center + (config.scale.points_per_z * weighted) / weight;
        evaluation.attributes[attribute] = round(
          clamp(score * evaluation.opponent.multiplier, 0, 99),
        );
      }
    }
    result.players.push(evaluation);
  }
  if (!result.players.length)
    result.warnings.push(
      "Nenhum participante corresponde a plataforma/id de um jogador cadastrado.",
    );
  if (result.unmatched.length)
    result.warnings.push(
      "Participantes não vinculados preservados para revisão; nick não foi usado como identidade.",
    );
  return result;
}

export interface NightSample {
  match_id: string;
  revision: number;
  session_date: string;
  attributes: Attributes;
  confidence: Record<Attribute, number>;
}
/** Call on the entire approved night, not once per replay. Newest revision replaces a duplicate match. */
export function consolidateNight(samples: NightSample[], night: string): Attributes {
  const unique = new Map<string, NightSample>();
  for (const sample of samples) {
    if (sample.session_date !== night)
      throw new Error("Sessões de noites diferentes não podem ser consolidadas juntas.");
    if (!Number.isInteger(sample.revision) || sample.revision < 1 || !sample.match_id)
      throw new Error("Amostra sem identidade/revisão válida.");
    const existing = unique.get(sample.match_id);
    if (!existing || sample.revision > existing.revision) unique.set(sample.match_id, sample);
  }
  const attributes = emptyAttributes();
  for (const attribute of ATTRIBUTES) {
    let weighted = 0,
      total = 0;
    for (const sample of unique.values()) {
      const value = sample.attributes[attribute],
        weight = sample.confidence[attribute];
      if (
        value !== null &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 99 &&
        Number.isFinite(weight) &&
        weight > 0 &&
        weight <= 1
      ) {
        weighted += value * weight;
        total += weight;
      }
    }
    if (total > 0) attributes[attribute] = round(weighted / total);
  }
  return attributes;
}
/** Anchor is the card BEFORE this night's first approval, persisted transactionally by the backend. */
export function evolveNight(
  anchor: Attributes,
  target: Attributes,
  config: ScoringConfig["evolution"],
): Attributes {
  if (
    !Number.isFinite(config.smoothing) ||
    config.smoothing <= 0 ||
    config.smoothing > 1 ||
    !Number.isFinite(config.maximum_nightly_increase) ||
    config.maximum_nightly_increase < 0 ||
    config.maximum_nightly_increase > 1
  )
    throw new Error("Configuração de evolução inválida.");
  const next = emptyAttributes();
  for (const attribute of ATTRIBUTES) {
    const before = anchor[attribute],
      raw = target[attribute];
    if (
      (before !== null && (!Number.isFinite(before) || before < 0 || before > 99)) ||
      (raw !== null && (!Number.isFinite(raw) || raw < 0 || raw > 99))
    )
      throw new Error("Atributo fora de 0 a 99.");
    next[attribute] =
      raw === null
        ? before
        : before === null
          ? round(raw)
          : round(
              clamp(
                before +
                  Math.min(config.maximum_nightly_increase, config.smoothing * (raw - before)),
                0,
                99,
              ),
            );
  }
  return next;
}
export function rankPlayers<T extends Pick<PublicPlayer, "id" | "nick" | "card">>(
  players: T[],
): T[] {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...players].sort(
    (a, b) =>
      (b.card?.overall ?? -1) - (a.card?.overall ?? -1) ||
      (b.card?.attributes.IMP ?? -1) - (a.card?.attributes.IMP ?? -1) ||
      compare(a.nick.toLowerCase(), b.nick.toLowerCase()) ||
      compare(a.id, b.id),
  );
}
