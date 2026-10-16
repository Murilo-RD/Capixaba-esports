import type { Attributes, PublicPlayer, Role } from "./types";

export function playerArchetypeLabel(player: Pick<PublicPlayer, "role" | "archetype">) {
  if (player.role === "owner") return "Dono";
  return player.role === "coach" ? "Coach" : player.archetype?.name || "Arquétipo não definido";
}

/** Owners and coaches have fixed role labels instead of an editable archetype. */
export function staffCardOverall(
  role: Role,
  archetype: PublicPlayer["archetype"],
  attributes: Attributes,
): number | null {
  if ((role !== "owner" && role !== "coach") || archetype?.active) return null;
  const values = Object.values(attributes);
  if (values.length !== 7 || values.some((value) => value == null || !Number.isFinite(value)))
    return null;
  return Math.round((values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 7) * 100) / 100;
}
