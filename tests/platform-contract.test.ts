import test from "node:test";
import assert from "node:assert/strict";
import { actionSchemas, requestSchema } from "../src/lib/moonastery/schemas";
import { permittedModules, defaultModule } from "../src/components/team/permissions";
import type { Membership, Role } from "../src/lib/moonastery/types";

const id = "00000000-0000-4000-8000-000000000001";
const member = (role: Role | null, status: Membership["status"] = "approved"): Membership => ({
  id,
  role,
  status,
  nick: "Fixture",
  email: "fixture@example.test",
  created_at: "2026-10-13T00:00:00Z",
});

test("pending/rejected/suspended accounts have no internal modules regardless of supplied role", () => {
  for (const status of ["pending", "rejected", "suspended"] as const)
    for (const role of ["owner", "editor", "coach", "player"] as const)
      assert.deepEqual(permittedModules(member(role, status)), []);
  assert.deepEqual(permittedModules(member(null)), []);
});
test("role navigation restricts editor, coach and player administrative modules", () => {
  assert(permittedModules(member("editor")).includes("news"));
  for (const module of ["users", "scouter", "settings", "reports"] as const)
    assert(!permittedModules(member("editor")).includes(module));
  assert(permittedModules(member("coach")).includes("scouter"));
  assert(!permittedModules(member("coach")).includes("users"));
  assert(permittedModules(member("player")).includes("reports"));
  assert(!permittedModules(member("player")).includes("scouter"));
  assert(permittedModules(member("owner")).includes("users"));
  assert.equal(defaultModule("editor"), "news");
  assert.equal(defaultModule("coach"), "scouter");
});
test("profile update rejects privilege and approval field injection", () => {
  const input = { nick: "Fixture", bio: "", photo_url: null };
  assert(actionSchemas["profile.update"].safeParse(input).success);
  assert(!actionSchemas["profile.update"].safeParse({ ...input, role: "owner" }).success);
  assert(!actionSchemas["profile.update"].safeParse({ ...input, status: "approved" }).success);
  assert(!actionSchemas["profile.update"].safeParse({ ...input, user_id: id }).success);
});
test("approval needs explicit role and request envelope rejects unknown actions", () => {
  assert(!actionSchemas["users.update"].safeParse({ id, status: "approved", role: null }).success);
  assert(
    actionSchemas["users.update"].safeParse({ id, status: "approved", role: "player" }).success,
  );
  assert(!requestSchema.safeParse({ action: "users.selfApprove", payload: {} }).success);
  assert(!requestSchema.safeParse({ action: "membership.me", payload: {}, admin: true }).success);
});
test("coach feedback cannot carry manually edited numeric attributes", () => {
  const feedback = {
    id,
    positives: "",
    improvements: "",
    instructions: "",
    objectives: "",
    recommendations: "",
    observations: "",
  };
  assert(actionSchemas["reports.feedback"].safeParse(feedback).success);
  assert(!actionSchemas["reports.feedback"].safeParse({ ...feedback, overall: 99 }).success);
  assert(
    !actionSchemas["reports.feedback"].safeParse({ ...feedback, attributes: { VEL: 99 } }).success,
  );
});
test("news save cannot bypass approval or replace author", () => {
  const draft = {
    title: "Fixture",
    slug: "fixture",
    summary: "",
    content: "Test only",
    cover_url: null,
    category: "Equipe",
  };
  assert(actionSchemas["news.save"].safeParse(draft).success);
  assert(!actionSchemas["news.save"].safeParse({ ...draft, status: "published" }).success);
  assert(!actionSchemas["news.save"].safeParse({ ...draft, author_id: id }).success);
});
test("public external links reject script schemes; uploaded media bounds enforced", () => {
  const social = {
    platform: "Fixture",
    icon: "other",
    url: "https://example.test",
    active: true,
    display_order: 1,
  };
  assert(actionSchemas["socials.save"].safeParse(social).success);
  assert(
    !actionSchemas["socials.save"].safeParse({ ...social, url: "javascript:alert(1)" }).success,
  );
  assert(
    !actionSchemas["media.upload"].safeParse({
      purpose: "avatar",
      filename: "x.svg",
      content_type: "image/svg+xml",
      bytes: 10,
      data: "fixture",
    }).success,
  );
  assert(
    !actionSchemas["media.upload"].safeParse({
      purpose: "avatar",
      filename: "x.png",
      content_type: "image/png",
      bytes: 6 * 1024 * 1024,
      data: "fixture",
    }).success,
  );
});
test("archetype weights must sum to one and contain exactly seven attributes", () => {
  const weights = { VEL: 0.1, FIN: 0.15, CRI: 0.15, DEF: 0.15, POS: 0.2, BST: 0.1, IMP: 0.15 };
  const archetype = { name: "Fixture", description: "", weights, active: true };
  assert(actionSchemas["archetypes.save"].safeParse(archetype).success);
  assert(
    !actionSchemas["archetypes.save"].safeParse({ ...archetype, weights: { ...weights, IMP: 0.5 } })
      .success,
  );
  assert(
    !actionSchemas["archetypes.save"].safeParse({ ...archetype, weights: { ...weights, MMR: 0 } })
      .success,
  );
});
