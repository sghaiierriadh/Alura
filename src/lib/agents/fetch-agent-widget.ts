import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { isWidgetAgentIdFormatValid } from "@/lib/agents/widget-agent-id";

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
  if (!isWidgetAgentIdFormatValid(agentId)) return null;

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
