import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadPlayers } from "../src/lib/moonastery/server";
import { playerArchetypeLabel } from "../src/lib/moonastery/player-card";
import type { Archetype, Player } from "../src/lib/moonastery/types";

const archetype: Archetype = {
  id: "striker",
  name: "Finalizador",
  description: "",
  active: true,
  weights: { VEL: 0.1, FIN: 0.15, CRI: 0.15, DEF: 0.15, POS: 0.2, BST: 0.1, IMP: 0.15 },
};

function fixtureDb() {
  const members = [
    { id: "athlete", role: "player", status: "approved" },
    { id: "trainer", role: "coach", status: "approved" },
    { id: "hidden", role: "coach", status: "approved" },
    { id: "pending", role: "coach", status: "pending" },
    { id: "suspended", role: "coach", status: "suspended" },
    { id: "editor", role: "editor", status: "approved" },
    { id: "owner", role: "owner", status: "approved" },
    { id: "hidden-owner", role: "owner", status: "approved" },
    { id: "pending-owner", role: "owner", status: "pending" },
    { id: "rejected-owner", role: "owner", status: "rejected" },
    { id: "suspended-owner", role: "owner", status: "suspended" },
  ];
  const rows: Record<string, Record<string, unknown>[]> = {
    moon_memberships: members,
    moon_players: members.map((member) => ({
      id: `profile-${member.id}`,
      user_id: member.id,
      nick: member.id,
      bio: "",
      photo_url: null,
      game_id: null,
      archetype_id: archetype.id,
      platform: "steam",
      platform_id: `private-${member.id}`,
      public_visible: !member.id.startsWith("hidden"),
    })),
    moon_archetypes: [archetype],
    moon_cards: [{ player_id: "profile-athlete", overall: 85, attributes: { IMP: 85 } }],
  };
  return createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1)!;
        assert(table in rows, `Unexpected table: ${table}`);
        let result = rows[table].filter((row) =>
          [...url.searchParams].every(([key, filter]) => {
            if (filter.startsWith("eq.")) return String(row[key]) === filter.slice(3);
            if (filter.startsWith("in.("))
              return filter.slice(4, -1).split(",").includes(String(row[key]));
            return true;
          }),
        );
        const columns = url.searchParams.get("select");
        if (columns && columns !== "*")
          result = result.map((row) =>
            Object.fromEntries(columns.split(",").map((key) => [key, row[key]])),
          );
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
}

test("public cards include approved visible coaches and owners without leaking account identifiers", async () => {
  const players = await loadPlayers(fixtureDb(), true);
  assert.deepEqual(
    players.map((player) => player.nick),
    ["athlete", "owner", "trainer"],
  );
  const coach = players.find((player) => player.role === "coach")!;
  assert(coach);
  assert.equal(coach.card, null);
  assert.equal(coach.ranking_position, null);
  assert.equal(playerArchetypeLabel(coach), "Coach");
  const owner = players.find((player) => player.role === "owner")!;
  assert(owner);
  assert.equal(owner.card, null);
  assert.equal(playerArchetypeLabel(owner), "Dono");
  assert.equal(playerArchetypeLabel(players[0]), "Finalizador");
  for (const player of players) {
    for (const key of ["user_id", "platform", "platform_id", "email"])
      assert(!Object.hasOwn(player, key), `Public card exposes ${key}`);
  }
});

test("internal cards include coaches and owners and preserve account visibility restrictions", async () => {
  const players = (await loadPlayers(fixtureDb(), false, {
    staff: false,
    userId: "athlete",
  })) as Player[];
  assert.deepEqual(
    new Set(players.map((player) => player.nick)),
    new Set(["athlete", "trainer", "hidden", "owner", "hidden-owner"]),
  );
  assert.equal(
    players.find((player) => player.user_id === "athlete")?.platform_id,
    "private-athlete",
  );
  assert.equal(players.find((player) => player.user_id === "trainer")?.platform_id, null);
  const staffPlayers = (await loadPlayers(fixtureDb(), false, {
    staff: true,
    userId: "trainer",
  })) as Player[];
  assert.equal(
    staffPlayers.find((player) => player.user_id === "trainer")?.platform_id,
    "private-trainer",
  );
});

test("staff labels override a previous player archetype and handle missing archetypes", () => {
  assert.equal(playerArchetypeLabel({ role: "coach", archetype }), "Coach");
  assert.equal(playerArchetypeLabel({ role: "coach", archetype: null }), "Coach");
  assert.equal(playerArchetypeLabel({ role: "owner", archetype }), "Dono");
  assert.equal(playerArchetypeLabel({ role: "owner", archetype: null }), "Dono");
  assert.equal(playerArchetypeLabel({ role: "player", archetype: null }), "Arquétipo não definido");
});
