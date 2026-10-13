// Generated from the locally applied Moonastery migrations by scripts/database-verify.mjs --generate-types.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = {
  public: {
    Tables: {
      moon_archetypes: {
        Row: {
          id: string;
          name: string;
          description: string;
          weights: Json;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          weights: Json;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          weights?: Json;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      moon_attribute_history: {
        Row: {
          id: string;
          player_id: string;
          report_id: string;
          attributes: Json;
          overall: number | null;
          archetype_id: string | null;
          reason: string;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          report_id: string;
          attributes: Json;
          overall?: number | null;
          archetype_id?: string | null;
          reason: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          report_id?: string;
          attributes?: Json;
          overall?: number | null;
          archetype_id?: string | null;
          reason?: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_attribute_history_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_attribute_history_archetype_id_fkey";
            columns: ["archetype_id"];
            isOneToOne: false;
            referencedRelation: "moon_archetypes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_attribute_history_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "moon_players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_attribute_history_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "moon_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_audit: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          entity_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          entity_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string | null;
          action?: string;
          entity_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_audit_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_cards: {
        Row: {
          player_id: string;
          attributes: Json;
          overall: number | null;
          previous_overall: number | null;
          evolution: number | null;
          report_id: string;
          approved_at: string;
        };
        Insert: {
          player_id: string;
          attributes: Json;
          overall?: number | null;
          previous_overall?: number | null;
          evolution?: number | null;
          report_id: string;
          approved_at: string;
        };
        Update: {
          player_id?: string;
          attributes?: Json;
          overall?: number | null;
          previous_overall?: number | null;
          evolution?: number | null;
          report_id?: string;
          approved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_cards_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "moon_players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_cards_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "moon_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_games: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string;
          image_url: string | null;
          active: boolean;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string;
          image_url?: string | null;
          active?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string;
          image_url?: string | null;
          active?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      moon_instructions: {
        Row: {
          id: string;
          title: string;
          description: string;
          content: string;
          category: string;
          tactical: boolean;
          target_player_ids: string[];
          media: Json;
          author_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          content: string;
          category: string;
          tactical?: boolean;
          target_player_ids?: string[];
          media?: Json;
          author_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          content?: string;
          category?: string;
          tactical?: boolean;
          target_player_ids?: string[];
          media?: Json;
          author_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_instructions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_job_players: {
        Row: {
          id: string;
          job_id: string;
          player_id: string;
          attributes: Json;
          raw_metrics: Json;
          confidence: Json;
          alerts: Json;
          config_snapshot: Json | null;
        };
        Insert: {
          id?: string;
          job_id: string;
          player_id: string;
          attributes: Json;
          raw_metrics: Json;
          confidence?: Json;
          alerts?: Json;
          config_snapshot?: Json | null;
        };
        Update: {
          id?: string;
          job_id?: string;
          player_id?: string;
          attributes?: Json;
          raw_metrics?: Json;
          confidence?: Json;
          alerts?: Json;
          config_snapshot?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "moon_job_players_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "moon_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_job_players_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "moon_players";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_jobs: {
        Row: {
          id: string;
          replay_id: string;
          status: string;
          attempt: number;
          session_date: string | null;
          provider_replay_id: string | null;
          error_message: string | null;
          config_snapshot: Json | null;
          logs: Json;
          unmatched: Json;
          warnings: Json;
          created_at: string;
          updated_at: string;
          match_id: string | null;
        };
        Insert: {
          id?: string;
          replay_id: string;
          status?: string;
          attempt?: number;
          session_date?: string | null;
          provider_replay_id?: string | null;
          error_message?: string | null;
          config_snapshot?: Json | null;
          logs?: Json;
          unmatched?: Json;
          warnings?: Json;
          created_at?: string;
          updated_at?: string;
          match_id?: string | null;
        };
        Update: {
          id?: string;
          replay_id?: string;
          status?: string;
          attempt?: number;
          session_date?: string | null;
          provider_replay_id?: string | null;
          error_message?: string | null;
          config_snapshot?: Json | null;
          logs?: Json;
          unmatched?: Json;
          warnings?: Json;
          created_at?: string;
          updated_at?: string;
          match_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moon_jobs_replay_id_fkey";
            columns: ["replay_id"];
            isOneToOne: false;
            referencedRelation: "moon_replays";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_memberships: {
        Row: {
          id: string;
          email: string;
          nick: string;
          status: string;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          nick: string;
          status?: string;
          role?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nick?: string;
          status?: string;
          role?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_memberships_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_news: {
        Row: {
          id: string;
          title: string;
          slug: string;
          summary: string;
          content: string;
          cover_url: string | null;
          category: string;
          status: string;
          author_id: string | null;
          published_at: string | null;
          created_at: string;
          review_note: string;
          reviewed_by: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          summary?: string;
          content: string;
          cover_url?: string | null;
          category: string;
          status?: string;
          author_id?: string | null;
          published_at?: string | null;
          created_at?: string;
          review_note?: string;
          reviewed_by?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          summary?: string;
          content?: string;
          cover_url?: string | null;
          category?: string;
          status?: string;
          author_id?: string | null;
          published_at?: string | null;
          created_at?: string;
          review_note?: string;
          reviewed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moon_news_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_news_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_organization: {
        Row: {
          id: string;
          name: string;
          description: string;
          hero_title: string;
          hero_subtitle: string;
          contact_email: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          hero_title: string;
          hero_subtitle?: string;
          contact_email?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          hero_title?: string;
          hero_subtitle?: string;
          contact_email?: string | null;
        };
        Relationships: [];
      };
      moon_partners: {
        Row: {
          id: string;
          name: string;
          description: string;
          logo_url: string | null;
          url: string | null;
          active: boolean;
          display_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          logo_url?: string | null;
          url?: string | null;
          active?: boolean;
          display_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          logo_url?: string | null;
          url?: string | null;
          active?: boolean;
          display_order?: number;
        };
        Relationships: [];
      };
      moon_players: {
        Row: {
          id: string;
          user_id: string;
          nick: string;
          bio: string;
          photo_url: string | null;
          game_id: string | null;
          archetype_id: string | null;
          platform: string | null;
          platform_id: string | null;
          public_visible: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nick: string;
          bio?: string;
          photo_url?: string | null;
          game_id?: string | null;
          archetype_id?: string | null;
          platform?: string | null;
          platform_id?: string | null;
          public_visible?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nick?: string;
          bio?: string;
          photo_url?: string | null;
          game_id?: string | null;
          archetype_id?: string | null;
          platform?: string | null;
          platform_id?: string | null;
          public_visible?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_players_archetype_id_fkey";
            columns: ["archetype_id"];
            isOneToOne: false;
            referencedRelation: "moon_archetypes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_players_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "moon_games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_players_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_processing_history: {
        Row: { id: string; job_id: string; attempt: number; snapshot: Json; created_at: string };
        Insert: {
          id?: string;
          job_id: string;
          attempt: number;
          snapshot: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          attempt?: number;
          snapshot?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_processing_history_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "moon_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_replays: {
        Row: {
          id: string;
          sha256: string;
          storage_path: string;
          filename: string;
          byte_size: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sha256: string;
          storage_path: string;
          filename: string;
          byte_size: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sha256?: string;
          storage_path?: string;
          filename?: string;
          byte_size?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_replays_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_reports: {
        Row: {
          id: string;
          player_id: string;
          session_date: string;
          attributes: Json;
          baseline_attributes: Json;
          overall: number | null;
          previous_overall: number | null;
          baseline_overall: number | null;
          archetype_id: string | null;
          approved_at: string;
          approved_by: string | null;
          source_job_ids: string[];
          positives: string;
          improvements: string;
          instructions: string;
          objectives: string;
          recommendations: string;
          observations: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          session_date: string;
          attributes: Json;
          baseline_attributes: Json;
          overall?: number | null;
          previous_overall?: number | null;
          baseline_overall?: number | null;
          archetype_id?: string | null;
          approved_at?: string;
          approved_by?: string | null;
          source_job_ids?: string[];
          positives?: string;
          improvements?: string;
          instructions?: string;
          objectives?: string;
          recommendations?: string;
          observations?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          session_date?: string;
          attributes?: Json;
          baseline_attributes?: Json;
          overall?: number | null;
          previous_overall?: number | null;
          baseline_overall?: number | null;
          archetype_id?: string | null;
          approved_at?: string;
          approved_by?: string | null;
          source_job_ids?: string[];
          positives?: string;
          improvements?: string;
          instructions?: string;
          objectives?: string;
          recommendations?: string;
          observations?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_reports_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_reports_archetype_id_fkey";
            columns: ["archetype_id"];
            isOneToOne: false;
            referencedRelation: "moon_archetypes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moon_reports_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "moon_players";
            referencedColumns: ["id"];
          },
        ];
      };
      moon_scoring: {
        Row: { id: string; config: Json; updated_at: string };
        Insert: { id?: string; config: Json; updated_at?: string };
        Update: { id?: string; config?: Json; updated_at?: string };
        Relationships: [];
      };
      moon_socials: {
        Row: {
          id: string;
          platform: string;
          icon: string;
          url: string;
          active: boolean;
          display_order: number;
        };
        Insert: {
          id?: string;
          platform: string;
          icon?: string;
          url: string;
          active?: boolean;
          display_order?: number;
        };
        Update: {
          id?: string;
          platform?: string;
          icon?: string;
          url?: string;
          active?: boolean;
          display_order?: number;
        };
        Relationships: [];
      };
      moon_submissions: {
        Row: {
          id: string;
          author_id: string | null;
          category: string;
          title: string;
          description: string;
          status: string;
          response: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id?: string | null;
          category: string;
          title: string;
          description: string;
          status?: string;
          response?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string | null;
          category?: string;
          title?: string;
          description?: string;
          status?: string;
          response?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moon_submissions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "moon_memberships";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      moon_approve_job: { Args: { actor_id: string; job_id: string }; Returns: Json };
      moon_change_archetype: {
        Args: { actor_id: string; player_id: string; archetype_id: string };
        Returns: undefined;
      };
      moon_complete_processing: {
        Args: { target_job_id: string; target_attempt: number; processing_result: Json };
        Returns: undefined;
      };
      moon_manage_member: {
        Args: { actor_id: string; member_id: string; new_status: string; new_role: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export const Constants = { public: { Enums: {} } } as const;
