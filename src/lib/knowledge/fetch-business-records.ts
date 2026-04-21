import { getAdminReadContext } from "@/lib/admin/server-context";
import type { Database } from "@/types/database.types";

export type BusinessRecordListRow = Pick<
  Database["public"]["Tables"]["business_records"]["Row"],
  | "id"
  | "title"
  | "description"
  | "value"
  | "category"
  | "metadata"
  | "created_at"
>;

/** Lignes `business_records` de l’agent (hors `search_vector`) pour le dashboard. */
export async function fetchBusinessRecordsForAgent(
  agentId: string,
): Promise<BusinessRecordListRow[]> {
  const ctx = await getAdminReadContext();
  if (!ctx) return [];

  const { data: agent } = await ctx.client
    .from("agents")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("id", agentId)
    .maybeSingle();
  if (!agent?.id) return [];

  const { data, error } = await ctx.client
    .from("business_records")
    .select("id, title, description, value, category, metadata, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data?.length) return [];
  return data as BusinessRecordListRow[];
}
