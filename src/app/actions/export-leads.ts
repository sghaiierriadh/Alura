"use server";

import { fetchLeadsForCsv } from "@/lib/admin/analytics-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

export type ExportLeadsResult =
  | { ok: true; filename: string; csv: string; count: number }
  | { ok: false; error: string };

const CSV_HEADERS = [
  "date",
  "nom",
  "email",
  "telephone",
  "enseigne",
] as const;

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildFilename(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `alura-leads-${y}${m}${day}.csv`;
}

/**
 * Génère un CSV UTF-8 des leads de l'agent courant.
 * Le BOM UTF-8 est ajouté en tête pour qu'Excel affiche correctement les accents.
 */
export async function exportLeadsCsv(): Promise<ExportLeadsResult> {
  const agent = await loadMyAgent();
  if (!agent) return { ok: false, error: "Agent introuvable." };

  const ctx = await getAdminReadContext();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const leads = await fetchLeadsForCsv(ctx.client, agent.id);

  const lines: string[] = [];
  lines.push(CSV_HEADERS.join(","));
  for (const lead of leads) {
    const row = {
      date: lead.created_at,
      nom: lead.full_name,
      email: lead.email,
      telephone: lead.phone,
      enseigne: lead.partner_name,
    } as const;
    lines.push(
      CSV_HEADERS.map((key) => csvEscape(row[key] ?? null)).join(","),
    );
  }

  const bom = "\uFEFF";
  const csv = bom + lines.join("\r\n");
  return { ok: true, filename: buildFilename(), csv, count: leads.length };
}
