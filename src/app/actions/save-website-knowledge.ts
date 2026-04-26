"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";
import { createClient } from "@/lib/supabase/server";
import { embedTextGemini, vectorToPgString } from "@/lib/ai/gemini-embedding-rest";
import type { CuratedFact } from "@/lib/ingestion/website-scraper";
import type { Database } from "@/types/database.types";

type KnowledgeSource = Database["public"]["Enums"]["knowledge_source"];
type KnowledgeInsert = Database["public"]["Tables"]["knowledge"]["Insert"];

export type SaveWebsiteKnowledgeResult =
  | { ok: true; inserted: number; agentId: string }
  | { ok: false; error: string };

const SOURCE: KnowledgeSource = "website_scraping";

/**
 * Indexe une liste de faits curés (issus du scraping web) dans `public.knowledge`
 * pour l’agent courant. Génère un embedding `gemini-embedding-001` (768 dims)
 * par bloc. Les anciennes entrées `source='website_scraping'` du même agent
 * sont supprimées au préalable pour éviter les doublons en cas de ré-ingestion.
 */
export async function saveWebsiteKnowledge(
  facts: CuratedFact[],
): Promise<SaveWebsiteKnowledgeResult> {
  const blocks = (facts ?? []).filter(
    (f) =>
      f &&
      typeof f.topic === "string" &&
      typeof f.content === "string" &&
      f.topic.trim().length >= 2 &&
      f.content.trim().length >= 30,
  );
  if (blocks.length === 0) {
    return { ok: false, error: "Aucun fait exploitable à indexer." };
  }

  const supabaseAuth = createClient();
  const {
    data: { user: sessionUser },
    error: sessionErr,
  } = await supabaseAuth.auth.getUser();
  if (sessionErr || !sessionUser) {
    return { ok: false, error: "Non authentifié." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx || ctx.userId !== sessionUser.id) {
    return { ok: false, error: "Non authentifié." };
  }

  const { data: agent, error: agentErr } = await ctx.client
    .from("agents")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (agentErr || !agent?.id) {
    return {
      ok: false,
      error: agentErr?.message ?? "Agent introuvable pour cet utilisateur.",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Configuration IA manquante (GEMINI_API_KEY)." };
  }

  const { error: delErr } = await ctx.client
    .from("knowledge")
    .delete()
    .eq("agent_id", agent.id)
    .eq("source", SOURCE);
  if (delErr) {
    return { ok: false, error: delErr.message };
  }

  const rows: KnowledgeInsert[] = [];

  for (const f of blocks) {
    const topic = f.topic.trim();
    const content = f.content.trim();
    let emb: number[];
    try {
      emb = await embedTextGemini(apiKey, `${topic}\n${content}`);
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error ? e.message : "Génération d’embedding impossible.",
      };
    }
    rows.push({
      agent_id: agent.id,
      user_id: ctx.userId,
      question: topic,
      answer: content,
      source: SOURCE,
      embedding: vectorToPgString(emb),
    });
  }

  const { error: insErr } = await ctx.client.from("knowledge").insert(rows);
  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/knowledge");
  revalidatePath("/onboarding");
  return { ok: true, inserted: rows.length, agentId: agent.id };
}
