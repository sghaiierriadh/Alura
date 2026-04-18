"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";
import { createClient } from "@/lib/supabase/server";
import { embedTextGemini, vectorToPgString } from "@/lib/ai/gemini-embedding-rest";
import type { PillarBlock } from "@/lib/knowledge/parse-pillars";

export type SaveTemplateKnowledgeResult =
  | { ok: true; inserted: number; agentId: string }
  | { ok: false; error: string };

const DEFAULT_SOURCE = "template_upload";

/**
 * Persiste chaque bloc « Pilier » comme une entrée `knowledge` liée à l'agent
 * de l'utilisateur courant (cloisonnement par `agent_id`). Un embedding
 * Gemini (`gemini-embedding-001`, 768 dims) est calculé par bloc.
 *
 * Les entrées précédentes portant la même `source` pour cet agent sont supprimées
 * avant insertion (évite les doublons en ré-onboarding).
 *
 * @param piliers Blocs issus du template `PILIER`, ou de la réorganisation IA (`document_reorganized`).
 * @param knowledgeSource `template_upload` (défaut) ou `document_reorganized`.
 */
export async function saveTemplateKnowledge(
  piliers: PillarBlock[],
  knowledgeSource: string = DEFAULT_SOURCE,
): Promise<SaveTemplateKnowledgeResult> {
  const blocks = (piliers ?? []).filter(
    (p) => p && typeof p.content === "string" && p.content.trim().length > 20,
  );
  if (blocks.length === 0) {
    return { ok: false, error: "Aucun bloc Pilier à enregistrer." };
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
    .eq("source", knowledgeSource);
  if (delErr) {
    return { ok: false, error: delErr.message };
  }

  const rows: Array<{
    agent_id: string;
    user_id: string;
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
      user_id: ctx.userId,
      question,
      answer,
      source: knowledgeSource,
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
