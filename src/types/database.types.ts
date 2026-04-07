export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Minimal types for RLS-backed tables. Regenerate with `supabase gen types` when the schema evolves.
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
