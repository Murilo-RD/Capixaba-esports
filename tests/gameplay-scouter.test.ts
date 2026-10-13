import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCORING_SETTINGS,
  ATTRIBUTES,
  emptyAttributes,
  scoringConfigSchema,
} from "../src/lib/gameplay-scouter/config";
import type { ScoringConfig } from "../src/lib/gameplay-scouter/config";
import {
  parseBallchasingReplay,
  ProviderPendingError,
  sessionNight,
} from "../src/lib/gameplay-scouter/parser";
import {
  BallchasingProvider,
  validateReplayFile,
} from "../src/lib/gameplay-scouter/ballchasing.server";
import {
  calculateOverall,
  consolidateNight,
  evaluateReplay,
  evolveNight,
  opponentAdjustment,
  rankPlayers,
  zScore,
} from "../src/lib/gameplay-scouter/scoring";
import type { Attributes, PublicPlayer } from "../src/lib/moonastery/types";

// Synthetic fixture is isolated in tests; it never seeds application cards or baselines.
function fixture() {
  return {
    id: "test-replay",
    status: "ok",
    date: "2026-10-13T01:30:00Z",
    date_has_timezone: true,
    duration: 300,
    play_duration: 300,
    playlist_id: "ranked-standard",
    match_guid: "match-test",
    blue: {
      players: [
        {
          name: "Same Nick",
          id: { platform: "steam", id: "765-test" },
          start_time: 0,
          end_time: 300,
          stats: {
            core: { shots: 4, goals: 2, assists: 1, saves: 3 },
            movement: {
              avg_speed: 1500,
              percent_supersonic_speed: 20,
              avg_powerslide_duration: 0.2,
            },
            positioning: {
              avg_distance_to_mates: 3000,
              percent_behind_ball: 75,
              percent_offensive_half: 45,
              goals_against_while_last_defender: 1,
            },
            boost: { amount_stolen: 400, count_collected_small: 50, amount_overfill: 300 },
            demo: { inflicted: 2 },
          },
        },
      ],
    },
    orange: {
      players: [
        {
          name: "Opponent",
          id: { platform: "epic", id: "opp-test" },
          stats: { core: { shots: 0, goals: 0 } },
        },
      ],
    },
  };
}
const registered = [{ id: "player-test", platform: "steam" as const, platform_id: "765-test" }];
function configuration(): ScoringConfig {
  const replay = parseBallchasingReplay(fixture());
  const config = structuredClone(DEFAULT_SCORING_SETTINGS);
  config.baseline = {
    version: "test-fixture-only",
    source: "synthetic fixture exclusively for tests",
    cohort: "SSL",
    playlist: "ranked-standard",
    min_samples: 30,
    metrics: {},
  };
  for (const metric of Object.values(config.attributes).flatMap((a) => a.metrics))
    config.baseline.metrics[metric.metric] = {
      mean: replay.players[0].metrics[metric.metric] ?? 0,
      stddev: 10,
      samples: 50,
    };
  return config;
}
const attrs = (value: number): Attributes =>
  Object.fromEntries(ATTRIBUTES.map((a) => [a, value])) as Attributes;
const confidence = Object.fromEntries(ATTRIBUTES.map((a) => [a, 1])) as Record<
  keyof Attributes,
  number
>;

test("z-scores respect higher, lower and target direction and reject zero variance", () => {
  assert.equal(zScore(120, 100, 10), 2);
  assert.equal(zScore(80, 100, 10, "lower"), 2);
  assert.equal(zScore(120, 100, 10, "target"), -2);
  assert.equal(zScore(100, 100, 0), null);
  assert.equal(zScore(NaN, 100, 10), null);
  assert.equal(zScore(1e308, -1e308, 1), null);
});
test("parser preserves provider identity, real zeros and unavailable metrics", () => {
  const replay = parseBallchasingReplay(fixture());
  assert.equal(replay.session_date, "2026-10-12");
  assert.equal(replay.players[0].platform_id, "765-test");
  assert.equal(replay.players[0].metrics["derived.shooting_conversion"], 50);
  assert.equal(replay.players[0].metrics["derived.goals_per_minute"], 0.4);
  assert.equal(replay.players[1].metrics["core.goals"], 0);
  assert.equal(replay.players[1].metrics["core.assists"], null);
  assert.equal(replay.players[1].metrics["derived.shooting_conversion"], null);
  assert.equal(replay.players[0].metrics["unavailable.last_man_mistakes"], null);
});
test("parser rejects provider pending/failed, missing timezone and duplicate identities", () => {
  assert.throws(() => parseBallchasingReplay({ status: "pending" }), ProviderPendingError);
  assert.throws(() => parseBallchasingReplay({ status: "failed" }), /não conseguiu/);
  const invalid = fixture();
  invalid.date_has_timezone = false;
  assert.throws(() => parseBallchasingReplay(invalid), /timezone/);
  const duplicate = fixture();
  duplicate.orange.players[0].id = { platform: "steam", id: "765-test" };
  assert.throws(() => parseBallchasingReplay(duplicate), /repetido/);
});
test("night boundary uses America/Sao_Paulo and rejects invalid calendar dates", () => {
  assert.equal(sessionNight("2026-10-13T02:59:59Z"), "2026-10-12");
  assert.equal(sessionNight("2026-10-13T03:00:00Z"), "2026-10-13");
  assert.throws(() => sessionNight("2026-02-30T03:00:00Z"), /inválida/);
  assert.throws(() => sessionNight("2026-10-13T03:00:00"), /timezone/);
});
test("SSL baseline is never fabricated, missing baseline leaves all attributes null", () => {
  const evaluation = evaluateReplay(
    parseBallchasingReplay(fixture()),
    registered,
    DEFAULT_SCORING_SETTINGS,
  );
  assert.deepEqual(evaluation.players[0].attributes, emptyAttributes());
  assert.match(evaluation.players[0].reasons[0], /Baseline SSL/);
});
test("only exact unique platform/id match identifies a registered player", () => {
  const replay = parseBallchasingReplay(fixture());
  assert.equal(
    evaluateReplay(
      replay,
      [{ id: "wrong", platform: "steam", platform_id: "wrong" }],
      configuration(),
    ).players.length,
    0,
  );
  assert.equal(
    evaluateReplay(replay, [...registered, { ...registered[0], id: "ambiguous" }], configuration())
      .players.length,
    0,
  );
});
test("configuration rejects malformed weights, zero stddev and missing provenance", () => {
  const config = configuration();
  assert.equal(scoringConfigSchema.safeParse(config).success, true);
  config.attributes.VEL.metrics[0].weight = 0.8;
  assert.equal(scoringConfigSchema.safeParse(config).success, false);
  const variance = configuration();
  variance.baseline!.metrics["movement.avg_speed"].stddev = 0;
  assert.equal(scoringConfigSchema.safeParse(variance).success, false);
});
test("baseline mean maps to center; scores clamp to 0..99", () => {
  const replay = parseBallchasingReplay(fixture()),
    config = configuration();
  assert.deepEqual(evaluateReplay(replay, registered, config).players[0].attributes, attrs(70));
  replay.players[0].metrics["movement.avg_speed"] = 1e9;
  replay.players[0].metrics["movement.percent_supersonic_speed"] = 1e9;
  const result = evaluateReplay(replay, registered, config).players[0];
  assert.equal(result.attributes.VEL, 94); // target metric remains neutral, 80% weight reaches z=3
  config.scale.points_per_z = 99;
  assert.equal(evaluateReplay(replay, registered, config).players[0].attributes.VEL, 99);
});
test("missing metrics and undersampled baseline reduce coverage rather than become zero", () => {
  const replay = parseBallchasingReplay(fixture()),
    config = configuration();
  replay.players[0].metrics["movement.avg_speed"] = null;
  const result = evaluateReplay(replay, registered, config).players[0];
  assert.equal(result.attributes.VEL, null);
  assert.equal(result.confidence.VEL, 0.5);
  config.baseline!.metrics["derived.goals_per_minute"].samples = 2;
  assert.equal(evaluateReplay(replay, registered, config).players[0].attributes.FIN, null);
});
test("short participation and playlist mismatch cannot generate ratings", () => {
  const replay = parseBallchasingReplay(fixture());
  replay.players[0].duration_seconds = 60;
  assert.deepEqual(
    evaluateReplay(replay, registered, configuration()).players[0].attributes,
    emptyAttributes(),
  );
  replay.players[0].duration_seconds = 300;
  replay.playlist = "ranked-duels";
  assert.deepEqual(
    evaluateReplay(replay, registered, configuration()).players[0].attributes,
    emptyAttributes(),
  );
});
test("lower boost waste raises score and tactical alerts cite observable data", () => {
  const replay = parseBallchasingReplay(fixture()),
    config = configuration();
  replay.players[0].metrics["derived.overfill_per_minute"] = 0;
  assert.ok(evaluateReplay(replay, registered, config).players[0].attributes.BST! > 70);
  replay.players[0].metrics["derived.overfill_per_minute"] = 200;
  const evaluation = evaluateReplay(replay, registered, config).players[0];
  assert.ok(evaluation.attributes.BST! < 70);
  assert.equal(evaluation.alerts[0].metric, "derived.overfill_per_minute");
  assert.ok(!evaluation.alerts.some((a) => a.metric.includes("last_man_mistakes")));
});
test("unknown ranks are neutral and flagged; verified weaker opponents apply multiplier", () => {
  const replay = parseBallchasingReplay(fixture()),
    config = configuration();
  const unknown = opponentAdjustment(replay, replay.players[0], config);
  assert.equal(unknown.known, false);
  assert.equal(unknown.multiplier, 1);
  config.opponent.evidence = [
    {
      platform: "epic",
      platform_id: "opp-test",
      strength: 11,
      source: "https://example.test/verified-rank",
      verified_at: "2026-10-12T00:00:00Z",
    },
  ];
  assert.equal(opponentAdjustment(replay, replay.players[0], config).multiplier, 0.75);
  assert.equal(evaluateReplay(replay, registered, config).players[0].attributes.VEL, 52.5);
  config.opponent.evidence[0].verified_at = "2026-10-14T00:00:00Z";
  assert.equal(opponentAdjustment(replay, replay.players[0], config).known, false);
});
test("overall uses archetype weights and remains null without all weighted attributes", () => {
  const weights = { VEL: 0.1, FIN: 0.3, CRI: 0.1, DEF: 0.1, POS: 0.1, BST: 0.1, IMP: 0.2 };
  const attributes = { ...attrs(50), FIN: 90 };
  assert.equal(calculateOverall(attributes, weights), 62);
  assert.equal(calculateOverall({ ...attributes, DEF: null }, weights), null);
  assert.throws(() => calculateOverall(attributes, { ...weights, FIN: 1 }), /Pesos/);
  assert.deepEqual(attributes, { ...attrs(50), FIN: 90 });
});
test("consolidation removes duplicate matches and only newest reprocess revision contributes", () => {
  const sample = {
    match_id: "match-a",
    revision: 1,
    session_date: "2026-10-12",
    attributes: attrs(80),
    confidence,
  };
  const input = [
    sample,
    sample,
    { ...sample, revision: 2, attributes: attrs(60) },
    { ...sample, match_id: "match-b", attributes: attrs(90) },
  ];
  const before = structuredClone(input);
  assert.deepEqual(consolidateNight(input, "2026-10-12"), attrs(75));
  assert.deepEqual(input, before);
  assert.throws(() => consolidateNight(input, "2026-10-13"), /diferentes/);
});
test("nightly +1 cap is applied once to consolidation with immutable anchor across approvals", () => {
  const anchor = attrs(50),
    config = DEFAULT_SCORING_SETTINGS.evolution;
  assert.deepEqual(evolveNight(anchor, attrs(99), config), attrs(51));
  assert.deepEqual(evolveNight(anchor, attrs(95), config), attrs(51)); // still same night's original anchor
  assert.deepEqual(anchor, attrs(50));
  assert.deepEqual(evolveNight(anchor, attrs(40), config), attrs(48));
  assert.deepEqual(evolveNight(anchor, emptyAttributes(), config), anchor);
  assert.deepEqual(evolveNight(emptyAttributes(), attrs(70), config), attrs(70));
});
test("ranking sorts overall then impact then nick/id, null last and leaves source untouched", () => {
  const player = (
    id: string,
    nick: string,
    overall: number | null,
    impact: number,
  ): PublicPlayer => ({
    id,
    nick,
    photo_url: null,
    bio: "",
    game_id: null,
    archetype_id: null,
    archetype: null,
    ranking_position: null,
    card: {
      attributes: { ...attrs(70), IMP: impact },
      overall,
      previous_overall: null,
      evolution: null,
      report_id: "report",
      approved_at: "2026-10-13",
    },
  });
  const players = [
    player("c", "Z", null, 99),
    player("b", "B", 80, 70),
    player("a", "A", 80, 70),
    player("d", "Z", 80, 80),
  ];
  assert.deepEqual(
    rankPlayers(players).map((p) => p.id),
    ["d", "a", "b", "c"],
  );
  assert.equal(players[0].id, "c");
});
function replayBinary() {
  const data = new Uint8Array(100);
  new DataView(data.buffer).setUint32(0, 20, true);
  return data;
}
test("replay upload validates file size, extension and binary header", () => {
  validateReplayFile(replayBinary(), "real.replay");
  assert.throws(() => validateReplayFile(replayBinary(), "fake.png"), /\.replay/);
  assert.throws(() => validateReplayFile(new Uint8Array(15), "small.replay"), /16 bytes/);
  assert.throws(() => validateReplayFile(new Uint8Array(100), "fake.replay"), /Cabeçalho/);
});
test("Ballchasing sends private multipart upload and recognizes provider duplicate 409", async () => {
  let path = "";
  let authorization = "";
  const provider = new BallchasingProvider("test-token-only", {
    fetcher: async (url, init) => {
      path = String(url);
      authorization = (init?.headers as Record<string, string>).Authorization;
      assert.ok(init?.body instanceof FormData);
      return new Response(JSON.stringify({ id: "existing-id" }), { status: 409 });
    },
  });
  assert.deepEqual(await provider.upload(replayBinary(), "real.replay"), {
    id: "existing-id",
    duplicate: true,
  });
  assert.match(path, /v2\/upload\?visibility=private$/);
  assert.equal(authorization, "test-token-only");
});
test("provider rate limit and pending response are async pending with retry metadata", async () => {
  const limited = new BallchasingProvider("test-token-only", {
    fetcher: async () => new Response("", { status: 429, headers: { "Retry-After": "5" } }),
  });
  await assert.rejects(
    () => limited.getReplay("test-replay"),
    (error: unknown) => error instanceof ProviderPendingError && error.retry_after_ms === 5000,
  );
  const pending = new BallchasingProvider("test-token-only", {
    fetcher: async () => new Response(JSON.stringify({ status: "pending" })),
  });
  await assert.rejects(() => pending.getReplay("test-replay"), ProviderPendingError);
});
test("provider fetches actual API schema and checks requested replay identity", async () => {
  const provider = new BallchasingProvider("test-token-only", {
    fetcher: async () => new Response(JSON.stringify(fixture())),
  });
  assert.equal((await provider.getReplay("test-replay")).players.length, 2);
  await assert.rejects(() => provider.getReplay("different-id"), /não corresponde/);
  assert.throws(() => new BallchasingProvider(""), /BALLCHASING_API_TOKEN/);
});
test("Ballchasing upload 201 returns newly created replay and invalid names never hit network", async () => {
  let calls = 0;
  const provider = new BallchasingProvider("test-token-only", {
    fetcher: async () => {
      calls++;
      return new Response(JSON.stringify({ id: "new-replay" }), { status: 201 });
    },
  });
  assert.deepEqual(await provider.upload(replayBinary(), "new.replay"), {
    id: "new-replay",
    duplicate: false,
  });
  await assert.rejects(() => provider.upload(replayBinary(), "../fake.replay"), /nome válido/);
  assert.equal(calls, 1);
});
test("provider retries transient 5xx once and never exposes token in terminal failures", async () => {
  let calls = 0;
  const provider = new BallchasingProvider("test-token-only", {
    fetcher: async () => {
      calls++;
      return calls === 1
        ? new Response("", { status: 503 })
        : new Response(JSON.stringify(fixture()));
    },
  });
  await provider.getReplay("test-replay");
  assert.equal(calls, 2);
  const failure = new BallchasingProvider("test-token-only", {
    fetcher: async () => {
      throw new Error("Internal fake error with test-token-only");
    },
  });
  await assert.rejects(
    () => failure.getReplay("test-replay"),
    (error: unknown) =>
      error instanceof Error &&
      /indisponível/.test(error.message) &&
      !error.message.includes("test-token-only"),
  );
});
test("opponent evidence ordering uses timestamps across explicit timezone offsets", () => {
  const replay = parseBallchasingReplay(fixture()),
    config = configuration();
  config.opponent.evidence = [
    {
      platform: "epic",
      platform_id: "opp-test",
      strength: 22,
      source: "https://example.test/rank-newer",
      verified_at: "2026-10-12T20:00:00-03:00",
    },
    {
      platform: "epic",
      platform_id: "opp-test",
      strength: 11,
      source: "https://example.test/rank-older",
      verified_at: "2026-10-12T22:00:00Z",
    },
  ];
  assert.equal(opponentAdjustment(replay, replay.players[0], config).multiplier, 1);
});
