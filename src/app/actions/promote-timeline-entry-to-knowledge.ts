"use server";

import { revalidatePath } from "next/cache";

import { addKnowledgeFromResolution } from "@/app/actions/add-knowledge-from-resolution";
import { getAdminReadContext } from "@/lib/admin/server-context";
import type { Database, Json } from "@/types/database.types";

export type PromoteTimelineEntryInput = {
  complaintId: string;
  /** Index de l'entrée timeline à promouvoir. */
  entryIndex: number;
  /** Texte du message client (question). */
  question: string;
  /** Note interne / réponse que l'on veut apprendre. */
  answer: string;
};

export type PromoteTimelineEntryResult =
  | { ok: true; promoted: number[] }
  | { ok: false; error: string };

type ComplaintMetadata = {
  handled?: number[];
  internal_note?: string | null;
  promoted?: number[];
};

function sanitizeIndices(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<number>();
  for (const raw of input) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < 10_000) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function readMetadata(raw: unknown): ComplaintMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as ComplaintMetadata;
}

/**
 * Promeut un bloc timeline d'un ticket en entrée de la base de connaissance,
 * puis met à jour `lead_complaints.metadata.promoted` pour éviter les doublons
 * d'apprentissage côté UI.
 */
export async function promoteTimelineEntryToKnowledge(
  input: PromoteTimelineEntryInput,
): Promise<PromoteTimelineEntryResult> {
  const id = input.complaintId?.trim();
  if (!id) return { ok: false, error: "Identifiant ticket requis." };
  if (!Number.isInteger(input.entryIndex) || input.entryIndex < 0) {
    return { ok: false, error: "Index de timeline invalide." };
  }

  const q = input.question?.trim() ?? "";
  const a = input.answer?.trim() ?? "";
  if (q.length < 2 || a.length < 4) {
    return {
      ok: false,
      error: "Le message client et la note de résolution doivent être suffisamment détaillés.",
    };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const { data: complaint, error: cErr } = await ctx.client
    .from("lead_complaints")
    .select("id, metadata")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !complaint) return { ok: false, error: "Ticket introuvable." };

  // Publication dans la Knowledge Base (avec embedding + contrôles d'accès).
  const r = await addKnowledgeFromResolution(id, q, a);
  if (!r.ok) return { ok: false, error: r.error };

  const current = readMetadata(complaint.metadata);
  const promotedSet = new Set<number>(sanitizeIndices(current.promoted));
  promotedSet.add(input.entryIndex);
  const nextPromoted = Array.from(promotedSet).sort((a1, b1) => a1 - b1);

  const nextMetadata: Database["public"]["Tables"]["lead_complaints"]["Update"]["metadata"] = {
    ...(current as Record<string, Json>),
    promoted: nextPromoted,
  };

  const { error: updErr } = await ctx.client
    .from("lead_complaints")
    .update({ metadata: nextMetadata })
    .eq("id", id);
  if (updErr) {
    // Knowledge créée mais flag non persisté : on ne bloque pas l'UX.
    console.warn("[promoteTimelineEntry] metadata update failed:", updErr.message);
  }

  revalidatePath("/knowledge");
  revalidatePath("/admin/tickets");
  revalidatePath("/dashboard");
  return { ok: true, promoted: nextPromoted };
}
