import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_SCORING_SETTINGS,
  scoringConfigSchema,
  emptyAttributes,
} from "../src/lib/gameplay-scouter/config";
import type { ReferencePlayer } from "../src/lib/gameplay-scouter/config";
import {
  baselineMode,
  buildPlayerBaselines,
  resolveScoringConfig,
} from "../src/lib/gameplay-scouter/baseline";
import type { ReferenceSample } from "../src/lib/gameplay-scouter/baseline";
import {
  findReferencePlayer,
  loadReferencePreview,
} from "../src/lib/gameplay-scouter/baseline.server";
import { evaluateReplay } from "../src/lib/gameplay-scouter/scoring";
import { actionSchemas } from "../src/lib/moonastery/schemas";
import { handleMoonRequest, ApiError } from "../src/lib/moonastery/server";

const reference: ReferencePlayer = {
  player_id: "00000000-0000-4000-8000-000000000001",
  nick: "Reference",
  platform: "steam",
  platform_id: "765-reference",
  min_samples: 3,
};
const base = structuredClone(DEFAULT_SCORING_SETTINGS);
const sample = (id: string, value: number, playlist = "ranked-doubles"): ReferenceSample => ({
  match_id: id,
  revision: 1,
  playlist,
  duration_seconds: 300,
  player_duration_seconds: 300,
  metrics: { "movement.avg_speed": value, "derived.goals_per_minute": value - 1, constant: 0 },
});

test("reference distributions use measured sample mean/stddev, keep zero and separate all playlists", () => {
  const result = buildPlayerBaselines(
    [
      sample("a", 1),
      sample("b", 3),
      sample("c", 5),
      sample("d", 101, "ranked-standard"),
      sample("e", 103, "ranked-standard"),
      sample("f", 105, "ranked-standard"),
      sample("g", 10, "heatseeker"),
    ],
    reference,
    base,
  );
  assert.equal(result.baselines.length, 2);
  const doubles = result.baselines.find((entry) => entry.playlist === "ranked-doubles")!;
  assert.deepEqual(doubles.metrics["movement.avg_speed"], { mean: 3, stddev: 2, samples: 3 });
  assert.deepEqual(doubles.metrics["derived.goals_per_minute"], { mean: 2, stddev: 2, samples: 3 });
  assert.equal(doubles.cohort, "PLAYER");
  assert.deepEqual(doubles.match_ids, ["a", "b", "c"]);
  assert.equal(result.modes.find((mode) => mode.playlist === "heatseeker")?.ready, false);
  const config = { ...base, reference_player: reference, baselines: result.baselines };
  assert(scoringConfigSchema.safeParse(config).success);
  assert.equal(
    resolveScoringConfig(config, "ranked-standard").baseline?.metrics["movement.avg_speed"].mean,
    103,
  );
  assert.equal(
    resolveScoringConfig(config, "ranked-doubles").baseline?.metrics["movement.avg_speed"].mean,
    3,
  );
  assert.equal(resolveScoringConfig(config, "ranked-rumble").baseline, null);
  assert(!scoringConfigSchema.safeParse({ ...config, baselines: [doubles, doubles] }).success);
});

test("duplicates, stale revisions, missing participation, short games and constant metrics do not inflate references", () => {
  const samples = [
    sample("a", 999),
    { ...sample("a", 1), revision: 2 },
    sample("b", 3),
    sample("c", 5),
    { ...sample("short", 200), player_duration_seconds: 10 },
    { ...sample("short-match", 200), duration_seconds: 10 },
    { ...sample("legacy", 200), player_duration_seconds: undefined },
  ];
  for (const entry of samples) entry.metrics["movement.avg_powerslide_duration"] = 0.2;
  const result = buildPlayerBaselines(samples, reference, base);
  assert.equal(result.legacy_samples, 1);
  assert.equal(result.modes[0].matches, 3);
  assert.equal(result.baselines[0].metrics["movement.avg_speed"].mean, 3);
  assert(!("movement.avg_powerslide_duration" in result.baselines[0].metrics));
});

test("private/tournament formats and solo metrics stay distinct without overwriting legacy SSL configs", () => {
  assert.equal(baselineMode("private", 1), "private:1v1");
  assert.equal(baselineMode("private", 3), "private:3v3");
  assert.equal(baselineMode("tournament", 2), "tournament:2v2");
  const config = { ...base, reference_player: reference, baselines: [] };
  const solo = resolveScoringConfig(config, "ranked-duels");
  for (const rule of Object.values(solo.attributes)) {
    assert(
      !rule.metrics.some((m) =>
        ["derived.assists_per_minute", "positioning.avg_distance_to_mates"].includes(m.metric),
      ),
    );
    assert(Math.abs(rule.metrics.reduce((sum, m) => sum + m.weight, 0) - 1) < 1e-9);
  }
  assert(
    solo.attributes.POS.metrics.some(
      (metric) => metric.metric === "positioning.avg_distance_to_ball",
    ),
  );
  assert.deepEqual(base.attributes, DEFAULT_SCORING_SETTINGS.attributes);
  const manual = {
    version: "old",
    source: "measured SSL cohort",
    cohort: "SSL" as const,
    playlist: "ranked-doubles",
    min_samples: 2,
    metrics: {},
  };
  assert.equal(
    resolveScoringConfig({ ...base, baseline: manual }, "ranked-doubles").baseline?.version,
    "old",
  );
  assert.equal(
    resolveScoringConfig({ ...config, baseline: manual }, "ranked-standard").baseline,
    null,
  );
});

test("the selected player can be evaluated with per-mode baselines; missing modes stay unscored", () => {
  const metrics = Object.fromEntries(
    Object.values(base.attributes).flatMap((rule) => rule.metrics.map((m) => [m.metric, 3])),
  );
  const samples = [1, 3, 5].map((value, i) => ({
    ...sample(String(i), value),
    metrics: Object.fromEntries(Object.keys(metrics).map((key) => [key, value])),
  }));
  const preview = buildPlayerBaselines(samples, reference, base);
  const config = { ...base, reference_player: reference, baselines: preview.baselines };
  const replay = {
    provider_replay_id: "r",
    match_id: "new",
    played_at: "2026-10-16T10:00:00Z",
    session_date: "2026-10-16",
    playlist: "ranked-doubles",
    duration_seconds: 300,
    players: [
      {
        platform: "steam",
        platform_id: reference.platform_id,
        nick: "Reference",
        team: "blue" as const,
        duration_seconds: 300,
        metrics,
      },
    ],
  };
  const registered = [
    { id: reference.player_id, platform: reference.platform, platform_id: reference.platform_id },
  ];
  const evaluated = evaluateReplay(replay, registered, config).players[0];
  assert(Object.values(evaluated.attributes).every((value) => value === 70));
  assert.equal(evaluated.duration_seconds, 300);
  assert.equal(evaluated.config_snapshot?.baseline?.cohort, "PLAYER");
  const unavailable = evaluateReplay({ ...replay, playlist: "ranked-rumble" }, registered, config)
    .players[0];
  assert.deepEqual(unavailable.attributes, emptyAttributes());
  assert.match(unavailable.reasons[0], /amostras suficientes/);
});

function fixtureDb(history: unknown[], accountId = reference.platform_id) {
  return createClient("https://fixture.supabase.co", "fixture", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/moon_players"))
          return Response.json({
            id: reference.player_id,
            nick: reference.nick,
            platform: "steam",
            platform_id: accountId,
            moon_memberships: { status: "approved", role: "player" },
          });
        assert(url.pathname.endsWith("/moon_processing_history"));
        assert.equal(url.searchParams.get("moon_jobs.status"), "in.(approved,awaiting_review)");
        assert.equal(
          url.searchParams.get("snapshot->players"),
          `cs.[{"player_id":"${reference.player_id}"}]`,
        );
        return Response.json(history);
      },
    },
  });
}
const historyRow = (id: string, value: number) => ({
  job_id: id,
  attempt: 1,
  moon_jobs: { status: "awaiting_review", attempt: 1 },
  snapshot: {
    match_id: id,
    playlist: "ranked-doubles",
    duration_seconds: 300,
    provider_replay_id: `provider-${id}`,
    players: [
      {
        player_id: reference.player_id,
        duration_seconds: 300 as number | undefined,
        raw_metrics: { "movement.avg_speed": value },
      },
    ],
  },
});

test("reference queries use the chosen account and the current revision, ignoring discarded jobs", async () => {
  const stale = historyRow("stale", 1000);
  stale.moon_jobs.attempt = 2;
  const discarded = historyRow("discarded", 1000);
  discarded.moon_jobs.status = "discarded";
  const preview = await loadReferencePreview(
    fixtureDb([historyRow("a", 1), historyRow("b", 3), historyRow("c", 5), stale, discarded]),
    { ...base, reference_player: reference },
  );
  assert.equal(preview.baselines[0].metrics["movement.avg_speed"].mean, 3);
  await assert.rejects(
    loadReferencePreview(fixtureDb([], "changed-id"), { ...base, reference_player: reference }),
    /ID desse jogador mudou/,
  );
  assert.equal(
    (await findReferencePlayer(fixtureDb([]), reference.player_id, 5)).platform_id,
    reference.platform_id,
  );
});

test("historical participation can be recovered from the provider without altering the stored history", async () => {
  const legacy = historyRow("legacy-ref-test", 1);
  legacy.snapshot.players[0].duration_seconds = undefined;
  const original = structuredClone(legacy);
  const provider = {
    upload: async () => ({ id: "unused", duplicate: false }),
    getReplay: async () => ({
      provider_replay_id: legacy.snapshot.provider_replay_id,
      match_id: legacy.snapshot.match_id,
      playlist: "ranked-doubles",
      team_size: 2,
      played_at: "2026-10-16T10:00:00Z",
      session_date: "2026-10-16",
      duration_seconds: 300,
      players: [
        {
          nick: "Reference",
          platform: "steam",
          platform_id: reference.platform_id,
          duration_seconds: 300,
          team: "blue" as const,
          metrics: { "movement.avg_speed": 1 },
        },
      ],
    }),
  };
  const result = await loadReferencePreview(
    fixtureDb([legacy, historyRow("b", 3), historyRow("c", 5)]),
    { ...base, reference_player: reference },
    undefined,
    { provider },
  );
  assert.equal(result.legacy_samples, 0);
  assert.equal(result.baselines[0].metrics["movement.avg_speed"].samples, 3);
  assert.deepEqual(legacy, original);
});

test("reference actions validate IDs/sample limits and remain owner-only", async () => {
  assert(
    !actionSchemas["scoring.reference.save"].safeParse({ player_id: "nick-only", min_samples: 5 })
      .success,
  );
  assert(
    !actionSchemas["scoring.reference.save"].safeParse({
      player_id: reference.player_id,
      min_samples: 1,
    }).success,
  );
  const originalFetch = globalThis.fetch;
  const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
  try {
    for (const role of ["coach", "player", "editor"]) {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/auth/v1/user"))
          return Response.json({ id: reference.player_id });
        assert(url.pathname.endsWith("/moon_memberships"));
        return Response.json({
          id: reference.player_id,
          nick: "Fixture",
          role,
          status: "approved",
        });
      };
      const request = new Request("https://fixture.test/api/moonastery", {
        method: "POST",
        headers: { Authorization: "Bearer fixture" },
        body: JSON.stringify({
          action: "scoring.reference.save",
          payload: { player_id: reference.player_id, min_samples: 5 },
        }),
      });
      await assert.rejects(
        handleMoonRequest(request),
        (error: unknown) => error instanceof ApiError && error.status === 403,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnv.url;
    if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  }
});

test("owner can preview/save/clear a player reference without replacing scoring policy or rewriting reports", async () => {
  const originalFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture_only";
  let settings = { ...structuredClone(base), scale: { ...base.scale, center: 77 } };
  const writes: string[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/auth/v1/user")) return Response.json({ id: reference.player_id });
      if (path.endsWith("/moon_memberships"))
        return Response.json({
          id: reference.player_id,
          nick: "Owner",
          role: "owner",
          status: "approved",
        });
      if (path.endsWith("/moon_players"))
        return Response.json({
          id: reference.player_id,
          nick: reference.nick,
          platform: reference.platform,
          platform_id: reference.platform_id,
          moon_memberships: { status: "approved", role: "player" },
        });
      if (path.endsWith("/moon_processing_history"))
        return Response.json([historyRow("a", 1), historyRow("b", 3), historyRow("c", 5)]);
      if (path.endsWith("/moon_scoring")) {
        if (init?.method === "POST") {
          writes.push("settings");
          settings = JSON.parse(String(init.body)).config;
          return new Response(null, { status: 201 });
        }
        return Response.json({ config: settings });
      }
      assert(path.endsWith("/moon_audit"), `Unexpected mutation: ${path}`);
      writes.push("audit");
      return new Response(null, { status: 201 });
    };
    const request = (action: string, payload: object) =>
      new Request("https://fixture.test/api/moonastery", {
        method: "POST",
        headers: { Authorization: "Bearer fixture" },
        body: JSON.stringify({ action, payload }),
      });
    const payload = { player_id: reference.player_id, min_samples: 3 };
    const preview = (await handleMoonRequest(request("scoring.reference.preview", payload))) as {
      baselines: unknown[];
    };
    assert.equal(preview.baselines.length, 1);
    assert.deepEqual(writes, []);
    await handleMoonRequest(request("scoring.reference.save", payload));
    assert.equal(settings.scale.center, 77);
    const selected = scoringConfigSchema.parse(settings);
    assert.equal(selected.reference_player?.platform_id, reference.platform_id);
    assert.equal(selected.baselines?.[0].cohort, "PLAYER");
    await handleMoonRequest(request("scoring.reference.clear", {}));
    assert.equal(scoringConfigSchema.parse(settings).reference_player, null);
    assert.equal(settings.scale.center, 77);
    assert.deepEqual(writes, ["settings", "audit", "settings", "audit"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
