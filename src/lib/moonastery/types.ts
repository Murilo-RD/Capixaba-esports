export type Role = "owner" | "editor" | "coach" | "player";
export type MembershipStatus = "pending" | "approved" | "rejected" | "suspended";
export type Attribute = "VEL" | "FIN" | "CRI" | "DEF" | "POS" | "BST" | "IMP";
export type Attributes = Record<Attribute, number | null>;
export type NewsStatus = "draft" | "pending" | "changes_requested" | "rejected" | "published";
export type JobStatus =
  "pending" | "processing" | "awaiting_review" | "approved" | "discarded" | "error";
export interface Membership {
  id: string;
  nick: string;
  email: string;
  status: MembershipStatus;
  role: Role | null;
  created_at: string;
}
export interface Archetype {
  id: string;
  name: string;
  description: string;
  weights: Record<Attribute, number>;
  active: boolean;
}
export interface PlayerCard {
  attributes: Attributes;
  overall: number | null;
  previous_overall: number | null;
  evolution: number | null;
  report_id: string;
  approved_at: string;
}
export interface PublicPlayer {
  id: string;
  user_id?: string;
  nick: string;
  photo_url: string | null;
  bio: string;
  game_id: string | null;
  archetype_id: string | null;
  archetype: Archetype | null;
  card: PlayerCard | null;
  ranking_position: number | null;
}
export interface Player extends PublicPlayer {
  user_id: string;
  platform: "steam" | "epic" | "ps4" | null;
  platform_id: string | null;
  public_visible: boolean;
}
export interface Game {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  active: boolean;
  display_order: number;
}
export interface News {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  cover_url: string | null;
  category: string;
  status: NewsStatus;
  author_id: string;
  published_at: string | null;
  created_at: string;
  review_note: string;
}
export type PublicNews = Omit<News, "author_id" | "review_note">;
export interface Partner {
  id: string;
  name: string;
  description: string;
  logo_url: string | null;
  url: string | null;
  active: boolean;
  display_order: number;
}
export interface SocialLink {
  id: string;
  platform: string;
  icon: string;
  url: string;
  active: boolean;
  display_order: number;
}
export interface Organization {
  id: string;
  name: string;
  description: string;
  hero_title: string;
  hero_subtitle: string;
  contact_email: string | null;
}
export interface PublicHome {
  organization: Organization | null;
  players: PublicPlayer[];
  games: Game[];
  news: PublicNews[];
  partners: Partner[];
  socials: SocialLink[];
}
export interface CoachFeedback {
  positives: string;
  improvements: string;
  instructions: string;
  objectives: string;
  recommendations: string;
  observations: string;
}
export interface Report extends CoachFeedback {
  id: string;
  player_id: string;
  session_date: string;
  attributes: Attributes;
  overall: number | null;
  previous_overall: number | null;
  approved_at: string;
  approved_by: string;
  source_job_ids: string[];
}
export interface Instruction {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tactical: boolean;
  target_player_ids: string[];
  media: { type: "image" | "video" | "link"; url: string }[];
  author_id: string;
  created_at: string;
}
export interface Submission {
  id: string;
  author_id: string | null;
  category: "suggestion" | "technical" | "complaint" | "other";
  title: string;
  description: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  response: string;
  created_at: string;
}
export interface ReplayJob {
  id: string;
  replay_id: string;
  status: JobStatus;
  attempt: number;
  session_date: string | null;
  provider_replay_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
export interface DashboardData {
  membership: Membership;
  players: Player[];
  archetypes: Archetype[];
  games: Game[];
  reports: Report[];
  instructions: Instruction[];
  news: News[];
  submissions: Submission[];
  jobs: ReplayJob[];
  users: Membership[];
  partners: Partner[];
  socials: SocialLink[];
  organization: Organization | null;
  scoring: Record<string, unknown> | null;
}
export interface ApiFailure {
  error: string;
  code: string;
}
