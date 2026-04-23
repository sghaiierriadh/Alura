"use server";

import {
  setTicketStatus,
  type SetTicketStatusResult,
  type TicketLifecycleStatus,
} from "@/app/actions/admin-tickets";

export type UpdateLeadStatusInput = {
  complaintId: string;
  status: TicketLifecycleStatus;
  resolutionNotes?: string | null;
};

/**
 * Wrapper public orienté UI (Sheet de détail) : délègue à `setTicketStatus`
 * déjà testé (contrôles d'accès + gating de la note pour `resolved`).
 *
 * Séparer l'endpoint ici permet aux nouveaux composants (useOptimistic,
 * timeline auto-resolve…) d'importer une surface d'API nominale et
 * évolutive sans toucher aux anciens appels côté `ticket-status-editor`.
 */
export async function updateLeadStatus(
  input: UpdateLeadStatusInput,
): Promise<SetTicketStatusResult> {
  const id = input.complaintId?.trim();
  if (!id) return { ok: false, error: "Identifiant ticket requis." };
  return setTicketStatus(id, input.status, input.resolutionNotes ?? null);
}
