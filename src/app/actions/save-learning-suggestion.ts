"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { parseFaqData, toFaqJsonb } from "@/lib/knowledge/faq-data";

import type { Database } from "@/types/database.types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_Q = 8000;
const MAX_A = 16000;
const TITLE_MAX = 500;

export type SaveLearningSuggestionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Insère une suggestion `pending` (appel typiquement après un live search réussi).
 * Utilise le service role pour fonctionner aussi depuis le widget sans session propriétaire.
 */
export async function saveLearningSuggestion(input: {
  agentId: string;
  userQuestion: string;
  suggestedAnswer: string;
  source?: string;
}): Promise<SaveLearningSuggestionResult> {
  console.log(">>> [LEARNING] saveLearningSuggestion — entrée fonction");
  try {
    const agentId = typeof input.agentId === "string" ? input.agentId.trim() : "";
    if (!UUID_RE.test(agentId)) {
      return { ok: false, error: "Identifiant d’agent invalide." };
    }

    const userQuestion =
      typeof input.userQuestion === "string"
        ? input.userQuestion.trim().slice(0, MAX_Q)
        : "";
    const suggestedAnswer =
      typeof input.suggestedAnswer === "string"
        ? input.suggestedAnswer.trim().slice(0, MAX_A)
        : "";

    if (!userQuestion || !suggestedAnswer) {
      return { ok: false, error: "Question ou réponse vide." };
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceKey) {
      console.error(
        ">>> [LEARNING] saveLearningSuggestion — SUPABASE_SERVICE_ROLE_KEY manquante (insert impossible).",
      );
      return {
        ok: false,
        error: "Configuration serveur : impossible d’enregistrer la suggestion.",
      };
    }

    const supabaseAdmin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    console.log(
      ">>> [LEARNING] saveLearningSuggestion — client supabaseAdmin (service role), agentId:",
      agentId,
    );

    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr || !agent) {
      console.error(
        ">>> [LEARNING] saveLearningSuggestion — agent introuvable ou erreur:",
        agentErr?.message ?? "(no row)",
      );
      return { ok: false, error: "Agent introuvable." };
    }

    const source =
      typeof input.source === "string" && input.source.trim()
        ? input.source.trim().slice(0, 120)
        : "live_search";

    console.log(">>> [LEARNING] saveLearningSuggestion — INSERT learning_suggestions via supabaseAdmin");

    const { error } = await supabaseAdmin.from("learning_suggestions").insert({
      agent_id: agentId,
      status: "pending",
      user_question: userQuestion,
      suggested_answer: suggestedAnswer,
      source,
    });

    if (error) {
      console.error(">>> [LEARNING] saveLearningSuggestion — erreur INSERT:", error.message, error);
      return { ok: false, error: error.message };
    }

    console.log(">>> [LEARNING] saveLearningSuggestion — INSERT réussi.");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de l’enregistrement de la suggestion.";
    return { ok: false, error: message };
  }
}

export type LearningSuggestionRow =
  Database["public"]["Tables"]["learning_suggestions"]["Row"];

export type ListPendingLearningSuggestionsResult =
  | { ok: true; suggestions: LearningSuggestionRow[] }
  | { ok: false; error: string };

export async function listPendingLearningSuggestions(
  agentId: string,
): Promise<ListPendingLearningSuggestionsResult> {
  try {
    const aid = agentId.trim();
    if (!UUID_RE.test(aid)) {
      return { ok: false, error: "Identifiant d’agent invalide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "Vous devez être connecté." };
    }

    const { data: owned, error: ownErr } = await supabase
      .from("agents")
      .select("id")
      .eq("id", aid)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownErr || !owned) {
      return { ok: false, error: "Agent introuvable ou accès refusé." };
    }

    const { data, error } = await supabase
      .from("learning_suggestions")
      .select("*")
      .eq("agent_id", aid)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, suggestions: data ?? [] };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors du chargement des suggestions.";
    return { ok: false, error: message };
  }
}

export type MutateLearningSuggestionResult = { ok: true } | { ok: false; error: string };

export async function rejectLearningSuggestion(
  suggestionId: string,
): Promise<MutateLearningSuggestionResult> {
  try {
    const sid = suggestionId.trim();
    if (!UUID_RE.test(sid)) {
      return { ok: false, error: "Identifiant invalide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "Vous devez être connecté." };
    }

    const { data: row, error: fetchErr } = await supabase
      .from("learning_suggestions")
      .select("id, agent_id, status")
      .eq("id", sid)
      .maybeSingle();

    if (fetchErr || !row) {
      return { ok: false, error: "Suggestion introuvable." };
    }
    if (row.status !== "pending") {
      return { ok: false, error: "Cette suggestion n’est plus en attente." };
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", row.agent_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agent) {
      return { ok: false, error: "Accès refusé." };
    }

    const { error } = await supabase
      .from("learning_suggestions")
      .update({ status: "rejected" })
      .eq("id", sid)
      .eq("status", "pending");

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors du rejet.";
    return { ok: false, error: message };
  }
}

export async function validateLearningSuggestionAsBusinessRecord(
  suggestionId: string,
): Promise<MutateLearningSuggestionResult> {
  try {
    const sid = suggestionId.trim();
    if (!UUID_RE.test(sid)) {
      return { ok: false, error: "Identifiant invalide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "Vous devez être connecté." };
    }

    const { data: sug, error: sErr } = await supabase
      .from("learning_suggestions")
      .select("id, agent_id, status, user_question, suggested_answer")
      .eq("id", sid)
      .maybeSingle();

    if (sErr || !sug) {
      return { ok: false, error: "Suggestion introuvable." };
    }
    if (sug.status !== "pending") {
      return { ok: false, error: "Cette suggestion n’est plus en attente." };
    }

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("id", sug.agent_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agent) {
      return { ok: false, error: "Accès refusé." };
    }

    const title = (sug.user_question ?? "").trim().slice(0, TITLE_MAX) || "Sans titre";
    const description = (sug.suggested_answer ?? "").trim() || null;

    const { error: insErr } = await supabase.from("business_records").insert({
      agent_id: sug.agent_id,
      title,
      description,
      value: null,
      category: null,
      metadata: {
        source: "learning_suggestion",
        suggestion_id: sug.id,
      },
    });

    if (insErr) {
      return { ok: false, error: insErr.message };
    }

    const { error: upErr } = await supabase
      .from("learning_suggestions")
      .update({ status: "validated" })
      .eq("id", sid)
      .eq("status", "pending");

    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de la validation.";
    return { ok: false, error: message };
  }
}

export async function validateLearningSuggestionAsFaq(
  suggestionId: string,
): Promise<MutateLearningSuggestionResult> {
  try {
    const sid = suggestionId.trim();
    if (!UUID_RE.test(sid)) {
      return { ok: false, error: "Identifiant invalide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "Vous devez être connecté." };
    }

    const { data: sug, error: sErr } = await supabase
      .from("learning_suggestions")
      .select("id, agent_id, status, user_question, suggested_answer")
      .eq("id", sid)
      .maybeSingle();

    if (sErr || !sug) {
      return { ok: false, error: "Suggestion introuvable." };
    }
    if (sug.status !== "pending") {
      return { ok: false, error: "Cette suggestion n’est plus en attente." };
    }

    const { data: agentRow, error: aErr } = await supabase
      .from("agents")
      .select("id, faq_data")
      .eq("id", sug.agent_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (aErr || !agentRow) {
      return { ok: false, error: "Accès refusé." };
    }

    const pairs = parseFaqData(agentRow.faq_data);
    pairs.push({
      question: (sug.user_question ?? "").trim().slice(0, MAX_Q),
      answer: (sug.suggested_answer ?? "").trim().slice(0, MAX_A),
    });

    const { error: faqErr } = await supabase
      .from("agents")
      .update({ faq_data: toFaqJsonb(pairs) })
      .eq("id", agentRow.id)
      .eq("user_id", user.id);

    if (faqErr) {
      return { ok: false, error: faqErr.message };
    }

    const { error: upErr } = await supabase
      .from("learning_suggestions")
      .update({ status: "validated" })
      .eq("id", sid)
      .eq("status", "pending");

    if (upErr) {
      return { ok: false, error: upErr.message };
    }

    revalidatePath("/settings");
    revalidatePath("/knowledge");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de la validation.";
    return { ok: false, error: message };
  }
}
