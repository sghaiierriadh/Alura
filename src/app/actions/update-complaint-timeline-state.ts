"use server";

import { revalidatePath } from "next/cache";

import { getAdminReadContext } from "@/lib/admin/server-context";

export type TimelineMetadata = {
  handled: number[];
  internal_note: string | null;
  promoted: number[];
};

export type UpdateTimelineStateInput = {
  complaintId: string;
  /** Indices de blocs cochés « Traité ». */
  handled?: number[] | null;
  /** Note interne / réponse à préparer. `null` pour effacer. */
  internalNote?: string | null;
  /** Indices déjà promus en base de connaissance. */
  promoted?: number[] | null;
};

export type UpdateTimelineStateResult =
  | { ok: true; metadata: TimelineMetadata }
  | { ok: false; error: string };

function sanitizeIndices(input: number[] | null | undefined): number[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<number>();
  for (const raw of input) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < 10_000) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function sanitizeNote(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const t = raw.toString().trim();
  if (t.length === 0) return null;
  // garde-fou (évite d'écrire plusieurs Mo par accident)
  return t.slice(0, 20_000);
}

function readExistingMetadata(raw: unknown): TimelineMetadata {
  const base: TimelineMetadata = { handled: [], internal_note: null, promoted: [] };
  if (!raw || typeof raw !== "object") return base;
  const record = raw as Record<string, unknown>;
  return {
    handled: sanitizeIndices(record.handled as number[] | undefined),
    internal_note: sanitizeNote(record.internal_note as string | null | undefined),
    promoted: sanitizeIndices(record.promoted as number[] | undefined),
  };
}

/**
 * Persiste l'état « timeline » d'un ticket dans `lead_complaints.metadata` (jsonb).
 * Les champs non fournis sont conservés (merge non destructif).
 */
export async function updateComplaintTimelineState(
  input: UpdateTimelineStateInput,
): Promise<UpdateTimelineStateResult> {
  const id = input.complaintId?.trim();
  if (!id) return { ok: false, error: "Identifiant ticket requis." };

  const ctx = await getAdminReadContext();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const { data: agent } = await ctx.client
    .from("agents")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!agent?.id) return { ok: false, error: "Agent introuvable." };

  const { data: complaint, error: cErr } = await ctx.client
    .from("lead_complaints")
    .select("id, lead_id, metadata")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !complaint) return { ok: false, error: "Ticket introuvable." };

  const { data: lead, error: lErr } = await ctx.client
    .from("leads")
    .select("agent_id")
    .eq("id", complaint.lead_id)
    .maybeSingle();
  if (lErr || !lead || lead.agent_id !== agent.id) {
    return { ok: false, error: "Accès refusé." };
  }

  const current = readExistingMetadata(complaint.metadata);
  const next: TimelineMetadata = {
    handled:
      input.handled === undefined
        ? current.handled
        : sanitizeIndices(input.handled),
    internal_note:
      input.internalNote === undefined
        ? current.internal_note
        : sanitizeNote(input.internalNote),
    promoted:
      input.promoted === undefined
        ? current.promoted
        : sanitizeIndices(input.promoted),
  };

  const { error: updErr } = await ctx.client
    .from("lead_complaints")
    .update({ metadata: next })
    .eq("id", id);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/admin/tickets");
  return { ok: true, metadata: next };
}
