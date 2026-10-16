import type { PublicPlayer } from "./types";

export function playerArchetypeLabel(player: Pick<PublicPlayer, "role" | "archetype">) {
  return player.role === "coach" ? "Coach" : player.archetype?.name || "Arquétipo não definido";
}
