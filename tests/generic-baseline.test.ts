import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  genericBaseline,
  withGenericBaseline,
  withoutGenericBaseline,
} from "../src/lib/gameplay-scouter/generic-baseline";
import {
  DEFAULT_SCORING_SETTINGS,
  scoringConfigSchema,
  emptyAttributes,
} from "../src/lib/gameplay-scouter/config";
import { PLAYLISTS, resolveScoringConfig } from "../src/lib/gameplay-scouter/baseline";
import { evaluateReplay } from "../src/lib/gameplay-scouter/scoring";
import type { Baseline } from "../src/lib/gameplay-scouter/config";
import { handleMoonRequest, ApiError } from "../src/lib/moonastery/server";

const playerId = "00000000-0000-4000-8000-000000000001";
function replay(playlist = "ranked-doubles", teamSize = 2) {
  return {
    provider_replay_id: "generic-fixture",
    match_id: "generic-fixture",
    playlist,
    team_size: teamSize,
    played_at: "2026-10-16T10:00:00Z",
    session_date: "2026-10-16",
    duration_seconds: 300,
    players: [
      {
        platform: "steam",
        platform_id: "reference",
        nick: "Fixture",
        team: "blue" as const,
        duration_seconds: 300,
        metrics: Object.fromEntries(
          Object.entries(genericBaseline().metrics).map(([key, value]) => [key, value.mean]),
        ),
      },
    ],
  };
}
const registered = [{ id: playerId, platform: "steam" as const, platform_id: "reference" }];
const measured: Baseline = {
  version: "measured-test",
  source: "synthetic test fixture only",
  cohort: "PLAYER",
  playlist: "ranked-doubles",
  min_samples: 2,
  metrics: { "movement.avg_speed": { mean: 1600, stddev: 100, samples: 3 } },
};

test("generic configuration is valid, reports zero collected samples and matches the downloadable artifacts", () => {
  const config = withGenericBaseline();
  assert(scoringConfigSchema.safeParse(config).success);
  assert.equal(config.baseline?.cohort, "GENERIC");
  assert.equal(config.baseline?.min_samples, 0);
  assert(Object.values(config.baseline!.metrics).every((metric) => metric.samples === 0));
  for (const path of [
    "docs/gameplay-scouter-generic-all-modes.json",
    "public/config/gameplay-scouter-generic-all-modes.json",
  ])
    assert.deepEqual(
      JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")),
      config,
    );
  const relabeled = structuredClone(config);
  relabeled.baseline!.cohort = "SSL";
  assert(
    !scoringConfigSchema.safeParse(relabeled).success,
    "zero-sample generic parameters cannot pass as measured SSL data",
  );
  const fakeSampleCount = structuredClone(config);
  fakeSampleCount.baseline!.metrics["movement.avg_speed"].samples = 30;
  assert(!scoringConfigSchema.safeParse(fakeSampleCount).success);
});

test("generic parameters apply to every playlist and private format, including future mode names", () => {
  const config = withGenericBaseline();
  for (const playlist of [...PLAYLISTS.map(([id]) => id), "future-mode"]) {
    const parsed = replay(playlist, playlist.includes("duels") ? 1 : 3);
    const result = evaluateReplay(parsed, registered, config);
    assert(
      Object.values(result.players[0].attributes).every((value) => value === 70),
      `${playlist} must use generic parameters`,
    );
    assert.equal(result.players[0].config_snapshot?.baseline?.cohort, "GENERIC");
    assert.match(result.warnings[0], /provisória/);
  }
  for (const teamSize of [1, 2, 3, 4])
    assert.equal(resolveScoringConfig(config, "private", teamSize).baseline?.cohort, "GENERIC");
});

test("measured per-mode references replace the generic fallback while missing modes remain usable", () => {
  const config = withGenericBaseline({
    ...structuredClone(DEFAULT_SCORING_SETTINGS),
    baseline: measured,
    reference_player: {
      player_id: playerId,
      nick: "Reference",
      platform: "steam",
      platform_id: "reference",
      min_samples: 5,
    },
  });
  assert.equal(resolveScoringConfig(config, "ranked-doubles").baseline?.version, "measured-test");
  assert.equal(resolveScoringConfig(config, "ranked-standard").baseline?.cohort, "GENERIC");
  const without = withoutGenericBaseline(config);
  assert.equal(resolveScoringConfig(without, "ranked-doubles").baseline?.version, "measured-test");
  assert.equal(resolveScoringConfig(without, "ranked-standard").baseline, null);
  assert.equal(without.reference_player?.player_id, playerId);
});

test("generic activation preserves policy and original data; missing metrics and short participation remain unscored", () => {
  const original = structuredClone(DEFAULT_SCORING_SETTINGS);
  original.scale.center = 77;
  const before = structuredClone(original);
  const config = withGenericBaseline(original);
  assert.equal(config.scale.center, 77);
  assert.deepEqual(original, before);
  const missing = replay();
  missing.players[0].metrics = {};
  assert.deepEqual(
    evaluateReplay(missing, registered, config).players[0].attributes,
    emptyAttributes(),
  );
  const short = replay();
  short.players[0].duration_seconds = 10;
  assert.deepEqual(
    evaluateReplay(short, registered, config).players[0].attributes,
    emptyAttributes(),
  );
  const result = evaluateReplay(replay(), registered, config).players[0];
  assert.equal(result.opponent.multiplier, 1);
  assert.equal(result.opponent.known, false);
  assert.match(result.opponent.reason, /genérica/);
});

test("generic controls are owner-only and write configuration/audit without changing cards or reports", async () => {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
  let role = "coach";
  let config = {
    ...structuredClone(DEFAULT_SCORING_SETTINGS),
    baseline: measured,
    scale: { ...DEFAULT_SCORING_SETTINGS.scale, center: 77 },
  };
  const writes: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/v1/user")) return Response.json({ id: playerId });
      if (path.endsWith("/moon_memberships"))
        return Response.json({ id: playerId, nick: "Fixture", role, status: "approved" });
      if (path.endsWith("/moon_scoring")) {
        if (init?.method === "POST") {
          writes.push("config");
          config = JSON.parse(String(init.body)).config;
          return new Response(null, { status: 201 });
        }
        return Response.json({ config });
      }
      assert(path.endsWith("/moon_audit"), `Unexpected mutation: ${path}`);
      writes.push("audit");
      return new Response(null, { status: 201 });
    };
    const request = (action: string) =>
      new Request("https://fixture.test/api/moonastery", {
        method: "POST",
        headers: { Authorization: "Bearer fixture" },
        body: JSON.stringify({ action, payload: {} }),
      });
    for (role of ["coach", "editor", "player"])
      await assert.rejects(
        handleMoonRequest(request("scoring.generic.enable")),
        (error: unknown) => error instanceof ApiError && error.status === 403,
      );
    assert.deepEqual(writes, []);
    role = "owner";
    await handleMoonRequest(request("scoring.generic.enable"));
    assert.equal(config.baseline?.cohort, "GENERIC");
    assert.equal(config.scale.center, 77);
    assert.equal(resolveScoringConfig(config, "ranked-doubles").baseline?.version, "measured-test");
    await handleMoonRequest(request("scoring.generic.disable"));
    assert.equal(config.baseline, null);
    assert.equal(config.scale.center, 77);
    assert.deepEqual(writes, ["config", "audit", "config", "audit"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
