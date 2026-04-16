import { getAdminReadContext } from "@/lib/admin/server-context";
import type { FaqPair } from "@/lib/knowledge/faq-data";

/** Entrées `knowledge` issues des tickets (source `human_resolution`) pour l’agent courant. */
export async function fetchHumanResolutionKnowledge(
  agentId: string,
): Promise<FaqPair[]> {
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
    .from("knowledge")
    .select("question, answer")
    .eq("agent_id", agentId)
    .eq("source", "human_resolution")
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  return data.map((r) => ({
    question: (r.question ?? "").trim(),
    answer: (r.answer ?? "").trim(),
  }));
}
