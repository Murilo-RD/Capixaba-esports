export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      application_messages: {
        Row: {
          application_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          available_slots: Json
          cidade: string | null
          created_at: string
          discord: string | null
          do_es: boolean | null
          entrar_servidor: boolean | null
          id: string
          idade: number | null
          interesse: string | null
          ja_participou_camp: boolean | null
          nick: string
          nome_equipe: string | null
          objetivo: string | null
          plataforma: string | null
          possui_equipe: boolean | null
          quick_request: boolean
          rank_atual: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_slots?: Json
          cidade?: string | null
          created_at?: string
          discord?: string | null
          do_es?: boolean | null
          entrar_servidor?: boolean | null
          id?: string
          idade?: number | null
          interesse?: string | null
          ja_participou_camp?: boolean | null
          nick: string
          nome_equipe?: string | null
          objetivo?: string | null
          plataforma?: string | null
          possui_equipe?: boolean | null
          quick_request?: boolean
          rank_atual?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_slots?: Json
          cidade?: string | null
          created_at?: string
          discord?: string | null
          do_es?: boolean | null
          entrar_servidor?: boolean | null
          id?: string
          idade?: number | null
          interesse?: string | null
          ja_participou_camp?: boolean | null
          nick?: string
          nome_equipe?: string | null
          objetivo?: string | null
          plataforma?: string | null
          possui_equipe?: boolean | null
          quick_request?: boolean
          rank_atual?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          competition: string
          created_at: string
          id: string
          notes: string | null
          our_score: number | null
          played_at: string
          rival_score: number | null
          rival_team_id: string
        }
        Insert: {
          competition: string
          created_at?: string
          id?: string
          notes?: string | null
          our_score?: number | null
          played_at?: string
          rival_score?: number | null
          rival_team_id: string
        }
        Update: {
          competition?: string
          created_at?: string
          id?: string
          notes?: string | null
          our_score?: number | null
          played_at?: string
          rival_score?: number | null
          rival_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_rival_team_id_fkey"
            columns: ["rival_team_id"]
            isOneToOne: false
            referencedRelation: "rival_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          meeting_at: string | null
          mmr_1v1: number | null
          mmr_2v2: number | null
          mmr_3v3: number | null
          nick: string | null
          platform: string | null
          rank_1v1: string | null
          rank_2v2: string | null
          rank_3v3: string | null
          rocket_league_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          tracker_synced_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          meeting_at?: string | null
          mmr_1v1?: number | null
          mmr_2v2?: number | null
          mmr_3v3?: number | null
          nick?: string | null
          platform?: string | null
          rank_1v1?: string | null
          rank_2v2?: string | null
          rank_3v3?: string | null
          rocket_league_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tracker_synced_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          meeting_at?: string | null
          mmr_1v1?: number | null
          mmr_2v2?: number | null
          mmr_3v3?: number | null
          nick?: string | null
          platform?: string | null
          rank_1v1?: string | null
          rank_2v2?: string | null
          rank_3v3?: string | null
          rocket_league_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          tracker_synced_at?: string | null
        }
        Relationships: []
      }
      rival_teams: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      training_videos: {
        Row: {
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          nivel: Database["public"]["Enums"]["training_level"]
          titulo: string
          updated_at: string
          youtube_id: string
          youtube_url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          nivel: Database["public"]["Enums"]["training_level"]
          titulo: string
          updated_at?: string
          youtube_id: string
          youtube_url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          nivel?: Database["public"]["Enums"]["training_level"]
          titulo?: string
          updated_at?: string
          youtube_id?: string
          youtube_url?: string
        }
        Relationships: []
      }
      trainings: {
        Row: {
          codigo: string
          created_at: string
          created_by: string
          id: string
          nivel: Database["public"]["Enums"]["training_level"]
          nome: string
        }
        Insert: {
          codigo: string
          created_at?: string
          created_by: string
          id?: string
          nivel: Database["public"]["Enums"]["training_level"]
          nome: string
        }
        Update: {
          codigo?: string
          created_at?: string
          created_by?: string
          id?: string
          nivel?: Database["public"]["Enums"]["training_level"]
          nome?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          consistencia: number | null
          created_at: string
          decisao: number | null
          evolucao: string | null
          freeplay: boolean
          id: string
          mecanica: number | null
          mecanicas: boolean
          melhorar: string | null
          mmr_atual: string | null
          nick: string
          nota_geral: number | null
          objetivo: string | null
          posicionamento: number | null
          rank_atual: string | null
          replay_review: boolean
          rotacao: number | null
          semana: string
          user_id: string
          variacao: Database["public"]["Enums"]["mmr_variacao"] | null
        }
        Insert: {
          consistencia?: number | null
          created_at?: string
          decisao?: number | null
          evolucao?: string | null
          freeplay?: boolean
          id?: string
          mecanica?: number | null
          mecanicas?: boolean
          melhorar?: string | null
          mmr_atual?: string | null
          nick: string
          nota_geral?: number | null
          objetivo?: string | null
          posicionamento?: number | null
          rank_atual?: string | null
          replay_review?: boolean
          rotacao?: number | null
          semana: string
          user_id: string
          variacao?: Database["public"]["Enums"]["mmr_variacao"] | null
        }
        Update: {
          consistencia?: number | null
          created_at?: string
          decisao?: number | null
          evolucao?: string | null
          freeplay?: boolean
          id?: string
          mecanica?: number | null
          mecanicas?: boolean
          melhorar?: string | null
          mmr_atual?: string | null
          nick?: string
          nota_geral?: number | null
          objetivo?: string | null
          posicionamento?: number | null
          rank_atual?: string | null
          replay_review?: boolean
          rotacao?: number | null
          semana?: string
          user_id?: string
          variacao?: Database["public"]["Enums"]["mmr_variacao"] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "player"
      application_status: "pendente" | "reuniao" | "aprovado" | "reprovado"
      mmr_variacao: "subiu" | "manteve" | "caiu"
      training_level:
        | "platina"
        | "diamante"
        | "champion"
        | "grand_champion"
        | "ssl"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "player"],
      application_status: ["pendente", "reuniao", "aprovado", "reprovado"],
      mmr_variacao: ["subiu", "manteve", "caiu"],
      training_level: [
        "platina",
        "diamante",
        "champion",
        "grand_champion",
        "ssl",
      ],
    },
  },
} as const
