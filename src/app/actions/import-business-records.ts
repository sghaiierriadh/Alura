"use server";

import { createClient } from "@/lib/supabase/server";

import type { Database, Json } from "@/types/database.types";

export type ImportBusinessRecordsSuccess = { success: true; count: number };
export type ImportBusinessRecordsFailure = { success: false; error: string };
export type ImportBusinessRecordsResult =
  | ImportBusinessRecordsSuccess
  | ImportBusinessRecordsFailure;

type BusinessRecordInsert =
  Database["public"]["Tables"]["business_records"]["Insert"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INSERT_CHUNK_SIZE = 500;

function readField(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    if (!(key in row)) continue;
    const v = row[key];
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t.length > 0) return t;
    }
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
  }
  return null;
}

function normalizeMetadata(raw: unknown): Json | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Json;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Json;
      }
      return { _parsed: parsed } as unknown as Json;
    } catch {
      return { raw: trimmed } as unknown as Json;
    }
  }
  return { value: String(raw) } as unknown as Json;
}

function mapRow(agentId: string, record: unknown): BusinessRecordInsert | null {
  if (record === null || record === undefined) return null;
  if (typeof record !== "object" || Array.isArray(record)) return null;
  const r = record as Record<string, unknown>;

  const title = readField(r, ["title", "Title", "titre", "Titre", "name", "Name"]);
  if (!title) return null;

  const description = readField(r, [
    "description",
    "Description",
    "desc",
    "Desc",
    "details",
  ]);

  let valueOut: string | null = readField(r, [
    "value",
    "Value",
    "amount",
    "Amount",
    "valeur",
  ]);
  if (valueOut === null) {
    const v = r.value ?? r.Value ?? r.amount ?? r.Amount;
    if (v !== null && v !== undefined) {
      if (typeof v === "number" || typeof v === "boolean") {
        valueOut = String(v);
      } else if (typeof v === "object") {
        try {
          valueOut = JSON.stringify(v);
        } catch {
          valueOut = null;
        }
      } else if (typeof v === "string") {
        const t = v.trim();
        valueOut = t.length > 0 ? t : null;
      } else {
        valueOut = String(v);
      }
    }
  }

  const category = readField(r, [
    "category",
    "Category",
    "categorie",
    "catégorie",
    "Categorie",
    "type",
    "Type",
  ]);

  const metadata =
    normalizeMetadata(r.metadata ?? r.Metadata ?? r.meta ?? r.Meta) ??
    null;

  return {
    agent_id: agentId,
    title,
    description,
    value: valueOut,
    category,
    metadata,
  };
}

/**
 * Remplace tous les `business_records` de l’agent par un import groupé (CSV / tableau).
 * Vérifie que l’agent appartient à l’utilisateur connecté avant toute écriture.
 */
export async function importBusinessRecords(
  agentId: string,
  records: any[],
): Promise<ImportBusinessRecordsResult> {
  try {
    const aid = typeof agentId === "string" ? agentId.trim() : "";
    if (!UUID_RE.test(aid)) {
      return { success: false, error: "Identifiant d’agent invalide." };
    }
    if (!Array.isArray(records)) {
      return { success: false, error: "Le paramètre records doit être un tableau." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return {
        success: false,
        error: `Session invalide : ${authError.message}`,
      };
    }
    if (!user) {
      return {
        success: false,
        error: "Vous devez être connecté pour importer des enregistrements.",
      };
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", aid)
      .eq("user_id", user.id)
      .maybeSingle();

    if (agentError) {
      return {
        success: false,
        error: `Impossible de vérifier l’agent : ${agentError.message}`,
      };
    }
    if (!agent) {
      return {
        success: false,
        error: "Agent introuvable ou accès refusé.",
      };
    }

    const { error: deleteError } = await supabase
      .from("business_records")
      .delete()
      .eq("agent_id", aid);

    if (deleteError) {
      return {
        success: false,
        error: `Échec de la suppression des enregistrements existants : ${deleteError.message}`,
      };
    }

    const rows: BusinessRecordInsert[] = [];
    for (const rec of records) {
      const mapped = mapRow(aid, rec);
      if (mapped) rows.push(mapped);
    }

    if (rows.length === 0) {
      return { success: true, count: 0 };
    }

    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
      const { error: insertError } = await supabase
        .from("business_records")
        .insert(chunk);

      if (insertError) {
        return {
          success: false,
          error: `Échec de l’insertion (lot ${Math.floor(i / INSERT_CHUNK_SIZE) + 1}) : ${insertError.message}`,
        };
      }
    }

    return { success: true, count: rows.length };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’import.";
    return { success: false, error: message };
  }
}
