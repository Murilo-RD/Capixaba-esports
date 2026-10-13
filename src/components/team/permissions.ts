import type { Membership, Role } from "@/lib/moonastery/types";

export type TeamModule =
  | "overview"
  | "ranking"
  | "reports"
  | "instructions"
  | "profile"
  | "submissions"
  | "players"
  | "scouter"
  | "news"
  | "users"
  | "partners"
  | "socials"
  | "settings";
export const moduleLabels: Record<TeamModule, string> = {
  overview: "Visão geral",
  ranking: "Ranking",
  reports: "Meus relatórios",
  instructions: "Instruções e planos",
  profile: "Meu perfil",
  submissions: "Denúncias e sugestões",
  players: "Jogadores",
  scouter: "GameplayScouter",
  news: "Notícias",
  users: "Usuários e permissões",
  partners: "Parceiros",
  socials: "Redes sociais",
  settings: "Configurações",
};
const access: Record<Role, TeamModule[]> = {
  owner: [
    "overview",
    "users",
    "players",
    "scouter",
    "reports",
    "ranking",
    "instructions",
    "news",
    "submissions",
    "partners",
    "socials",
    "settings",
    "profile",
  ],
  coach: ["overview", "players", "scouter", "reports", "ranking", "instructions", "profile"],
  editor: ["overview", "news", "profile"],
  player: ["overview", "ranking", "reports", "instructions", "submissions", "profile"],
};
export function permittedModules(membership: Membership): TeamModule[] {
  return membership.status === "approved" && membership.role ? access[membership.role] : [];
}
export function defaultModule(_role: Role | null): TeamModule {
  return "overview";
}
