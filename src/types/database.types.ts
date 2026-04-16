export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Types alignés sur le schéma Supabase public (à régénérer avec `supabase gen types typescript --linked`).
 * Colonnes récentes : `leads.session_id`, `leads.source`, `lead_complaints.status`,
 * `lead_complaints.priority` (low | normal | high), `lead_complaints.resolution_notes`.
 */
export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          user_id: string;
          company_name: string | null;
          sector: string | null;
          description: string | null;
          faq_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name?: string | null;
          sector?: string | null;
          description?: string | null;
          faq_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string | null;
          sector?: string | null;
          description?: string | null;
          faq_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          agent_id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          last_question: string | null;
          session_id: string | null;
          /** Peut être null sur d’anciennes lignes avant remplissage côté base */
          source: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          last_question?: string | null;
          session_id?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          last_question?: string | null;
          session_id?: string | null;
          source?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      lead_complaints: {
        Row: {
          id: string;
          lead_id: string;
          content: string;
          status: string;
          resolution_notes: string | null;
          priority: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          content: string;
          status?: string;
          resolution_notes?: string | null;
          priority?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          content?: string;
          status?: string;
          resolution_notes?: string | null;
          priority?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_complaints_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          agent_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          agent_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          agent_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge: {
        Row: {
          id: string;
          agent_id: string;
          question: string;
          answer: string;
          source: string;
          /** pgvector — sérialisé côté client comme chaîne `[v1,v2,…]` ou null */
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          question: string;
          answer: string;
          source?: string;
          embedding?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          question?: string;
          answer?: string;
          source?: string;
          embedding?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_knowledge: {
        Args: {
          p_agent_id: string;
          query_embedding: string;
          match_count?: number;
        };
        Returns: { question: string; answer: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
