import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import { embedTextGemini, vectorToPgString } from "@/lib/ai/gemini-embedding-rest";
import type { FaqPair } from "@/lib/knowledge/faq-data";
import type { Database } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fallbackRecentKnowledge(
  client: ReturnType<typeof createServiceRoleClient<Database>>,
  agentId: string,
): Promise<FaqPair[]> {
  const { data, error } = await client
    .from("knowledge")
    .select("question, answer")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data?.length) return [];
  return data.map((r) => ({
    question: (r.question ?? "").trim(),
    answer: (r.answer ?? "").trim(),
  }));
}

/**
 * Récupère les entrées `knowledge` les plus pertinentes pour le message courant (similarité cosinus).
 */
export async function fetchKnowledgeMatchesForChat(
  agentId: string,
  queryText: string,
): Promise<FaqPair[]> {
  if (!UUID_RE.test(agentId) || !queryText.trim()) return [];
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];

  let emb: number[];
  try {
    emb = await embedTextGemini(apiKey, queryText);
  } catch (e) {
    console.warn("[fetchKnowledgeMatchesForChat] embed:", e);
    return [];
  }
  const vecStr = vectorToPgString(emb);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: agent, error: aErr } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (aErr || !agent) return [];

    const { data, error } = await supabase.rpc("match_knowledge", {
      p_agent_id: agentId,
      query_embedding: vecStr,
      match_count: 5,
    });
    if (error) {
      console.warn("[fetchKnowledgeMatchesForChat] rpc (session):", error.message);
      const { data: rows } = await supabase
        .from("knowledge")
        .select("question, answer")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(5);
      return (rows ?? []).map((r) => ({
        question: (r.question ?? "").trim(),
        answer: (r.answer ?? "").trim(),
      }));
    }
    return (data ?? []).map((r) => ({
      question: (r.question ?? "").trim(),
      answer: (r.answer ?? "").trim(),
    }));
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return [];

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
  const { data: agent, error: aErr } = await admin
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();
  if (aErr || !agent) return [];

  const { data, error } = await admin.rpc("match_knowledge", {
    p_agent_id: agentId,
    query_embedding: vecStr,
    match_count: 5,
  });
  if (error) {
    console.warn("[fetchKnowledgeMatchesForChat] rpc:", error.message);
    return fallbackRecentKnowledge(admin, agentId);
  }
  const rows = data ?? [];
  if (rows.length > 0) {
    return rows.map((r) => ({
      question: (r.question ?? "").trim(),
      answer: (r.answer ?? "").trim(),
    }));
  }
  return fallbackRecentKnowledge(admin, agentId);
}
