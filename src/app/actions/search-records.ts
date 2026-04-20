"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

export type SearchRecordsHit = {
  title: string;
  description: string | null;
  value: string | null;
  category: string | null;
  metadata: Json | null;
};

export type SearchRecordsSuccess = { success: true; records: SearchRecordsHit[] };
export type SearchRecordsFailure = { success: false; error: string };
export type SearchRecordsResult = SearchRecordsSuccess | SearchRecordsFailure;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_FIELDS =
  "title, description, value, category, metadata" as const;

/**
 * Recherche plein texte sur `business_records.search_vector` (Postgres `tsvector`).
 * Propriétaire authentifié : client user + RLS. Widget anonyme : vérification de l’agent
 * puis client service role (même principe que le chat public).
 */
export async function searchRecords(
  agentId: string,
  query: string,
): Promise<SearchRecordsResult> {
  try {
    const aid = typeof agentId === "string" ? agentId.trim() : "";
    if (!UUID_RE.test(aid)) {
      return { success: false, error: "Identifiant d’agent invalide." };
    }

    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
      return { success: false, error: "Requête de recherche vide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return { success: false, error: `Session invalide : ${authError.message}` };
    }

    let client: ReturnType<typeof createClient> | ReturnType<typeof createServiceRoleClient<Database>>;

    if (user) {
      const { data: agent, error: agentError } = await supabase
        .from("agents")
        .select("id")
        .eq("id", aid)
        .eq("user_id", user.id)
        .maybeSingle();

      if (agentError) {
        return {
          success: false,
          error: `Impossible de vérifier l’agent : ${agentError.message}`,
        };
      }
      if (!agent) {
        return { success: false, error: "Agent introuvable ou accès refusé." };
      }
      client = supabase;
    } else {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!serviceKey) {
        return {
          success: false,
          error: "Accès refusé : session requise pour cette opération.",
        };
      }
      const admin = createServiceRoleClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
      );
      const { data: agent, error: agentError } = await admin
        .from("agents")
        .select("id")
        .eq("id", aid)
        .maybeSingle();

      if (agentError || !agent) {
        return { success: false, error: "Agent introuvable ou accès refusé." };
      }
      client = admin;
    }

    const { data, error } = await client
      .from("business_records")
      .select(SELECT_FIELDS)
      .eq("agent_id", aid)
      .textSearch("search_vector", q, {
        type: "websearch",
        config: "french",
      })
      .limit(5);

    if (error) {
      return {
        success: false,
        error: `Recherche catalogue : ${error.message}`,
      };
    }

    return { success: true, records: (data ?? []) as SearchRecordsHit[] };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de la recherche.";
    return { success: false, error: message };
  }
}
