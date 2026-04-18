import { createClient } from "@/lib/supabase/server";

import type { Database } from "@/types/database.types";

export type AgentRow = Database["public"]["Tables"]["agents"]["Row"];

/** Charge l’agent de l’utilisateur courant (session JWT). */
export async function loadMyAgent(): Promise<AgentRow | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}
