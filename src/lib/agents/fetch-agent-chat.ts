import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type AgentChatRow = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "user_id" | "company_name" | "description" | "faq_data"
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getPocUserId(): string | null {
  const raw = process.env.POC_SAVE_AGENT_USER_ID?.trim();
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * Charge l’agent par id pour le chat : session JWT (propriétaire) ou mode POC (service role + user fixe).
 */
export async function fetchAgentByIdForChat(
  agentId: string,
): Promise<AgentChatRow | null> {
  if (!UUID_RE.test(agentId)) return null;

  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (pocUserId && serviceKey) {
    const admin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    const { data, error } = await admin
      .from("agents")
      .select("id, user_id, company_name, description, faq_data")
      .eq("id", agentId)
      .eq("user_id", pocUserId)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("agents")
    .select("id, user_id, company_name, description, faq_data")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}
