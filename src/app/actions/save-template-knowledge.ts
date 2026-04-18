"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";
import { embedTextGemini, vectorToPgString } from "@/lib/ai/gemini-embedding-rest";
import type { PillarBlock } from "@/lib/knowledge/parse-pillars";

export type SaveTemplateKnowledgeResult =
  | { ok: true; inserted: number; agentId: string }
  | { ok: false; error: string };

const SOURCE = "template_upload";

/**
 * Persiste chaque bloc « Pilier » comme une entrée `knowledge` liée à l'agent
 * de l'utilisateur courant (cloisonnement par `agent_id`). Un embedding
 * Gemini (`gemini-embedding-001`, 768 dims) est calculé par bloc.
 *
 * Les entrées précédentes provenant du même template (`source='template_upload'`)
 * sont d'abord supprimées pour éviter les doublons lors d'un ré-onboarding.
 */
export async function saveTemplateKnowledge(
  piliers: PillarBlock[],
): Promise<SaveTemplateKnowledgeResult> {
  const blocks = (piliers ?? []).filter(
    (p) => p && typeof p.content === "string" && p.content.trim().length > 20,
  );
  if (blocks.length === 0) {
    return { ok: false, error: "Aucun bloc Pilier à enregistrer." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
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

  const rows: Array<{
    agent_id: string;
    question: string;
    answer: string;
    source: string;
    embedding: string;
  }> = [];

  for (const p of blocks) {
    const question = `PILIER ${p.index}${p.title ? ` : ${p.title}` : ""}`;
    const answer = p.content.trim();
    let emb: number[];
    try {
      emb = await embedTextGemini(apiKey, `${question}\n${answer}`);
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error ? e.message : "Génération d’embedding impossible.",
      };
    }
    rows.push({
      agent_id: agent.id,
      question,
      answer,
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
