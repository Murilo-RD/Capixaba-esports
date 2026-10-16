import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  loadPlayerReplayJobs,
  recalculatePlayer,
} from "../src/lib/gameplay-scouter/recalculate.server";
import { ApiError, handleMoonRequest } from "../src/lib/moonastery/server";
import { actionSchemas } from "../src/lib/moonastery/schemas";
import { readFileSync } from "node:fs";
import type { ParsedReplay } from "../src/lib/gameplay-scouter/parser";

const playerId = "00000000-0000-4000-8000-000000000001";
const config = JSON.parse(readFileSync("docs/gameplay-scouter-generic-all-modes.json", "utf8"));
const job = (number: number) => ({
  job_id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
  moon_jobs: {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    attempt: 2,
    status: number === 1 ? "approved" : "awaiting_review",
    updated_at: "2026-10-16T10:00:00Z",
    session_date: "2026-10-16",
    match_id: `match-${number}`,
    provider_replay_id: `provider-${number}`,
  },
});
function fixture(
  options: {
    failReplay?: boolean;
    changedIdentity?: boolean;
    empty?: boolean;
    stale?: boolean;
  } = {},
) {
  const writes: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const db = createClient("https://fixture.supabase.co", "sb_secret_fixture", {
    auth: { persistSession: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/moon_players"))
          return Response.json({
            id: playerId,
            nick: "Player",
            platform: "steam",
            platform_id: "account",
            moon_memberships: { status: "approved", role: "player" },
          });
        if (url.pathname.endsWith("/moon_scoring")) return Response.json({ config });
        if (url.pathname.endsWith("/moon_job_players")) {
          assert.equal(url.searchParams.get("player_id"), `eq.${playerId}`);
          assert.equal(url.searchParams.get("moon_jobs.status"), "in.(approved,awaiting_review)");
          return Response.json(options.empty ? [] : [job(1), job(2)]);
        }
        assert(url.pathname.endsWith("/rpc/moon_recalculate_player"));
        writes.push(JSON.parse(String(init?.body)));
        return options.stale
          ? Response.json({ message: "RECALCULATION_STALE", code: "P0001" }, { status: 400 })
          : Response.json({ replays: 2, reports: 1 });
      },
    },
  });
  const provider = {
    upload: async () => ({ id: "unused", duplicate: false }),
    getReplay: async (id: string): Promise<ParsedReplay> => {
      calls.push(id);
      if (options.failReplay && calls.length === 2) throw new Error("Provider unavailable");
      return {
        provider_replay_id: id,
        match_id: id.replace("provider", "match"),
        played_at: "2026-10-16T10:00:00Z",
        session_date: "2026-10-16",
        playlist: calls.length === 1 ? "ranked-duels" : "hoops",
        team_size: calls.length === 1 ? 1 : 2,
        duration_seconds: 300,
        players: [
          {
            nick: "Same nick",
            platform: "steam",
            platform_id: options.changedIdentity ? "other" : "account",
            team: "blue",
            duration_seconds: 300,
            metrics: Object.fromEntries(
              Object.entries(config.baseline.metrics).map(([metric, reference]) => [
                metric,
                (reference as { mean: number }).mean,
              ]),
            ),
          },
        ],
      };
    },
  };
  return { db, provider, writes, calls, pause: async () => {} };
}

test("player recalculation evaluates all linked modes and commits only the selected player once", async () => {
  const f = fixture();
  assert.deepEqual(await recalculatePlayer(f.db, playerId, playerId, f), {
    replays: 2,
    reports: 1,
  });
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].expected_config, config);
  const results = f.writes[0].replay_results as {
    evaluation: {
      player_id: string;
      attributes: { VEL: number | null };
      config_snapshot: { baseline: { playlist: string } };
    };
  }[];
  assert(results.every((row) => row.evaluation.player_id === playerId));
  assert(results.every((row) => row.evaluation.attributes.VEL !== null));
  assert(results.every((row) => row.evaluation.config_snapshot.baseline.playlist === "*"));
});

test("provider failure, changed account and absent replays never publish partial results", async () => {
  for (const options of [{ failReplay: true }, { changedIdentity: true }, { empty: true }]) {
    const f = fixture(options);
    await assert.rejects(recalculatePlayer(f.db, playerId, playerId, f));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ stale: true });
  await assert.rejects(
    recalculatePlayer(f.db, playerId, playerId, f),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});

test("player replay lookup paginates instead of silently limiting recalculation", async () => {
  let pages = 0;
  const db = createClient("https://fixture.supabase.co", "sb_secret_fixture", {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get("offset"), String(pages * 500));
        const length = pages++ === 0 ? 500 : 1;
        return Response.json(Array.from({ length }, (_, i) => job((pages - 1) * 500 + i + 1)));
      },
    },
  });
  assert.equal((await loadPlayerReplayJobs(db, playerId)).length, 501);
  assert.equal(pages, 2);
});

test("recalculation rejects injected scores and denies nonstaff before accessing replays", async () => {
  assert(
    !actionSchemas["players.recalculate"].safeParse({ id: playerId, attributes: { VEL: 99 } })
      .success,
  );
  const previousFetch = globalThis.fetch;
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fixture";
  try {
    for (const [role, status] of [
      ["player", "approved"],
      ["editor", "approved"],
      ["owner", "suspended"],
      ["coach", "pending"],
    ]) {
      globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: playerId });
        assert(url.pathname.endsWith("/moon_memberships"));
        return Response.json({ id: playerId, role, status });
      };
      await assert.rejects(
        handleMoonRequest(
          new Request("https://fixture.test/api/moonastery", {
            method: "POST",
            headers: { Authorization: "Bearer fixture" },
            body: JSON.stringify({ action: "players.recalculate", payload: { id: playerId } }),
          }),
        ),
        (error: unknown) => error instanceof ApiError && error.status === 403,
      );
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (savedUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
});
