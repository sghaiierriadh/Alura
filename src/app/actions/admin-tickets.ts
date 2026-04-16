"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";
import { draftFaqFromResolution } from "@/lib/ai/draft-faq-from-resolution";
import type { Database } from "@/types/database.types";

export type TicketLifecycleStatus = "open" | "in_progress" | "resolved";

export type TicketPriorityValue = "low" | "normal" | "high";

export type SetTicketStatusResult = { ok: true } | { ok: false; error: string };

export type PreviewResolutionKnowledgeResult =
  | { ok: true; question: string; answer: string }
  | { ok: false; error: string };

/**
 * Génère uniquement l’aperçu FAQ (Gemini), sans modifier le ticket ni la base `knowledge`.
 */
export async function previewResolutionKnowledge(
  complaintId: string,
  resolutionNotesDraft: string,
): Promise<PreviewResolutionKnowledgeResult> {
  const id = complaintId.trim();
  const note = resolutionNotesDraft.trim();
  if (!id) {
    return { ok: false, error: "Identifiant ticket requis." };
  }
  if (note.length < 1) {
    return { ok: false, error: "Saisissez d’abord une note de résolution." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
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

  const { data: complaint, error: cErr } = await ctx.client
    .from("lead_complaints")
    .select("id, lead_id, content")
    .eq("id", id)
    .maybeSingle();

  if (cErr || !complaint?.content?.trim()) {
    return { ok: false, error: "Ticket introuvable ou contenu vide." };
  }

  const { data: lead, error: lErr } = await ctx.client
    .from("leads")
    .select("agent_id")
    .eq("id", complaint.lead_id)
    .maybeSingle();

  if (lErr || !lead || lead.agent_id !== agent.id) {
    return { ok: false, error: "Accès refusé." };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Configuration IA manquante (GEMINI_API_KEY)." };
  }

  try {
    const draft = await draftFaqFromResolution({
      apiKey,
      complaintContent: complaint.content,
      resolutionNotes: note,
    });
    if (!draft?.question?.trim() || !draft.answer?.trim()) {
      return {
        ok: false,
        error: "L’IA n’a pas pu proposer une question/réponse. Reformulez la note ou réessayez.",
      };
    }
    return {
      ok: true,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
    };
  } catch (e) {
    console.warn("[previewResolutionKnowledge]", e);
    return { ok: false, error: "Erreur lors de la génération de l’aperçu." };
  }
}

export async function setTicketStatus(
  complaintId: string,
  status: TicketLifecycleStatus,
  resolutionNotes?: string | null,
): Promise<SetTicketStatusResult> {
  const id = complaintId.trim();
  if (!id) {
    return { ok: false, error: "Identifiant ticket requis." };
  }
  if (status !== "open" && status !== "in_progress" && status !== "resolved") {
    return { ok: false, error: "Statut invalide." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
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

  let payload: Database["public"]["Tables"]["lead_complaints"]["Update"];
  if (status === "resolved") {
    const note = resolutionNotes?.trim() ?? "";
    if (note.length < 1) {
      return {
        ok: false,
        error: "La note de résolution est obligatoire pour marquer le ticket comme résolu.",
      };
    }
    payload = { status, resolution_notes: note };
  } else {
    payload = { status, resolution_notes: null };
  }

  const { error: updErr } = await ctx.client.from("lead_complaints").update(payload).eq("id", id);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin/tickets");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setTicketPriority(
  complaintId: string,
  priority: TicketPriorityValue,
): Promise<SetTicketStatusResult> {
  const id = complaintId.trim();
  if (!id) {
    return { ok: false, error: "Identifiant ticket requis." };
  }
  if (priority !== "low" && priority !== "normal" && priority !== "high") {
    return { ok: false, error: "Priorité invalide." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
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

  const { error: updErr } = await ctx.client
    .from("lead_complaints")
    .update({ priority })
    .eq("id", id);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  revalidatePath("/admin/tickets");
  revalidatePath("/dashboard");
  return { ok: true };
}
