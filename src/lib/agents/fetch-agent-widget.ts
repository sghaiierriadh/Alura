import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { isWidgetAgentIdFormatValid } from "@/lib/agents/widget-agent-id";

export type AgentWidgetRow = Pick<
  Database["public"]["Tables"]["agents"]["Row"],
  "id" | "company_name"
> & {
  chatbot_name: string | null;
  theme_color: string | null;
  text_color: string | null;
  welcome_message: string | null;
  avatar_url: string | null;
};

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
    .select("*")
    .eq("id", agentId.trim())
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    company_name: typeof row.company_name === "string" ? row.company_name : null,
    chatbot_name: typeof row.chatbot_name === "string" ? row.chatbot_name : null,
    theme_color: typeof row.theme_color === "string" ? row.theme_color : null,
    text_color: typeof row.text_color === "string" ? row.text_color : null,
    welcome_message:
      typeof row.welcome_message === "string" ? row.welcome_message : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}
