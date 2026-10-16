import type { PublicPlayer } from "./types";

export function playerArchetypeLabel(player: Pick<PublicPlayer, "role" | "archetype">) {
  if (player.role === "owner") return "Dono";
  return player.role === "coach" ? "Coach" : player.archetype?.name || "Arquétipo não definido";
}
