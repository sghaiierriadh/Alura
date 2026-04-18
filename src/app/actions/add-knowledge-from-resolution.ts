"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";
import { createClient } from "@/lib/supabase/server";
import { embedTextGemini, vectorToPgString } from "@/lib/ai/gemini-embedding-rest";

export type AddKnowledgeFromResolutionResult = { ok: true } | { ok: false; error: string };

/**
 * Insère une ligne `knowledge` avec `source = human_resolution` et **embedding** (Gemini text-embedding-004).
 * L’`agent_id` est celui du lead lié au ticket (aligné sur le propriétaire vérifié).
 */
export async function addKnowledgeFromResolution(
  complaintId: string,
  question: string,
  answer: string,
): Promise<AddKnowledgeFromResolutionResult> {
  const q = question.trim();
  const a = answer.trim();
  if (q.length < 2 || a.length < 4) {
    return { ok: false, error: "Question ou réponse trop courte." };
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

  const { data: agent } = await ctx.client
    .from("agents")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!agent?.id) {
    return { ok: false, error: "Agent introuvable." };
  }

  const id = complaintId.trim();
  const { data: complaint, error: cErr } = await ctx.client
    .from("lead_complaints")
    .select("id, lead_id")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !complaint) {
    return { ok: false, error: "Ticket introuvable." };
  }

  const { data: lead, error: lErr } = await ctx.client
    .from("leads")
    .select("agent_id")
    .eq("id", complaint.lead_id)
    .maybeSingle();
  if (lErr || !lead || lead.agent_id !== agent.id) {
    return { ok: false, error: "Accès refusé." };
  }

  const agentIdForKnowledge = lead.agent_id;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Configuration IA manquante (GEMINI_API_KEY)." };
  }

  let emb: number[];
  try {
    emb = await embedTextGemini(apiKey, `${q}\n${a}`);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Génération d’embedding impossible.",
    };
  }

  const { error: insErr } = await ctx.client.from("knowledge").insert({
    agent_id: agentIdForKnowledge,
    user_id: ctx.userId,
    question: q,
    answer: a,
    source: "human_resolution",
    embedding: vectorToPgString(emb),
  });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/knowledge");
  revalidatePath("/admin/tickets");
  return { ok: true };
}

/** Alias explicite : upsert = insert avec embedding (pas de doublon géré ici). */
export const upsertKnowledgeFromResolution = addKnowledgeFromResolution;
