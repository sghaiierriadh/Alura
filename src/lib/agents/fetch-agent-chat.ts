import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type AgentChatRow = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "user_id" | "company_name" | "description" | "faq_data"
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Charge l’agent par id pour le chat : session JWT (propriétaire) ou widget public
 * (service role, agent connu par id).
 */
export async function fetchAgentByIdForChat(
  agentId: string,
): Promise<AgentChatRow | null> {
  if (!UUID_RE.test(agentId)) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data, error } = await supabase
      .from("agents")
      .select("id, user_id, company_name, description, faq_data")
      .eq("id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
  const { data, error } = await admin
    .from("agents")
    .select("id, user_id, company_name, description, faq_data")
    .eq("id", agentId)
    .maybeSingle();
  if (error) return null;
  return data;
}
