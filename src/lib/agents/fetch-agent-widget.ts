import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgentWidgetRow = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "company_name"
>;

/**
 * Charge un agent pour le widget embarqué (iframe) : lecture serveur via service role.
 * Nécessite SUPABASE_SERVICE_ROLE_KEY côté Next.js.
 */
export async function fetchAgentForWidget(
  agentId: string,
): Promise<AgentWidgetRow | null> {
  if (!UUID_RE.test(agentId.trim())) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return null;
  }

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data, error } = await admin
    .from("agents")
    .select("id, company_name")
    .eq("id", agentId.trim())
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
