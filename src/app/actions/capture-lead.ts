"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type CaptureLeadInput = {
  agentId: string;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  lastQuestion?: string | null;
  previousQuestion?: string | null;
};

export type CaptureLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string };

export type AddLeadComplaintResult =
  | { ok: true; leadId: string; complaintId?: string; complaintText?: string; skipped?: boolean }
  | { ok: false; error: string };

function getPocUserId(): string | null {
  const raw = process.env.POC_SAVE_AGENT_USER_ID?.trim();
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

function normalizeOptional(value?: string | null): string | null {
  const v = value?.trim() ?? "";
  return v.length > 0 ? v : null;
}

function looksLikeWeakQuestion(text: string | null): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (cleaned.length < 12) return true;
  const tokens = cleaned.split(/\s+/);
  if (tokens.length <= 2) return true;
  return !/[?]/.test(cleaned) && cleaned.length < 20;
}

function resolveComplaintText(
  lastQuestion: string | null,
  previousQuestion: string | null,
): string | null {
  if (!looksLikeWeakQuestion(lastQuestion)) return lastQuestion;
  if (!looksLikeWeakQuestion(previousQuestion)) return previousQuestion;
  return lastQuestion ?? previousQuestion;
}

function isMeaningfulComplaint(text: string | null): text is string {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length < 8) return false;
  const trivial = new Set([
    "ok",
    "okay",
    "merci",
    "thanks",
    "thx",
    "super",
    "d'accord",
    "dak",
    "c bon",
  ]);
  if (trivial.has(normalized)) return false;
  return !looksLikeWeakQuestion(normalized);
}

export async function captureLead(input: CaptureLeadInput): Promise<CaptureLeadResult> {
  const agentId = normalizeOptional(input.agentId);
  const email = normalizeOptional(input.email);
  const phone = normalizeOptional(input.phone);
  const fullName = normalizeOptional(input.fullName);
  const lastQuestion = resolveComplaintText(
    normalizeOptional(input.lastQuestion),
    normalizeOptional(input.previousQuestion),
  );

  if (!agentId) {
    return { ok: false, error: "agentId requis." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Email ou téléphone requis." };
  }

  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (pocUserId && serviceKey) {
    const admin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    const { data: ownedAgent, error: ownedAgentError } = await admin
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", pocUserId)
      .maybeSingle();

    if (ownedAgentError || !ownedAgent) {
      return { ok: false, error: "Agent introuvable." };
    }

    const { data: inserted, error } = await admin
      .from("leads")
      .insert({
        agent_id: agentId,
        email,
        phone,
        full_name: fullName,
        last_question: lastQuestion,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      return { ok: false, error: error?.message ?? "Insertion lead échouée." };
    }

    if (isMeaningfulComplaint(lastQuestion)) {
      const { error: complaintErr } = await admin.from("lead_complaints").insert({
        lead_id: inserted.id,
        content: lastQuestion,
      });
      if (complaintErr) {
        return { ok: false, error: complaintErr.message };
      }
    }

    return { ok: true, leadId: inserted.id };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const { data: ownedAgent, error: ownedAgentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedAgentError || !ownedAgent) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      agent_id: agentId,
      email,
      phone,
      full_name: fullName,
      last_question: lastQuestion,
    })
    .select("id")
    .single();

  if (error || !inserted?.id) {
    return { ok: false, error: error?.message ?? "Insertion lead échouée." };
  }

  if (isMeaningfulComplaint(lastQuestion)) {
    const { error: complaintErr } = await supabase.from("lead_complaints").insert({
      lead_id: inserted.id,
      content: lastQuestion,
    });
    if (complaintErr) {
      return { ok: false, error: complaintErr.message };
    }
  }

  return { ok: true, leadId: inserted.id };
}

export type AddLeadComplaintInput = {
  agentId: string;
  leadId: string;
  lastQuestion: string | null;
  previousQuestion?: string | null;
};

export async function addLeadComplaint(
  input: AddLeadComplaintInput,
): Promise<AddLeadComplaintResult> {
  const agentId = normalizeOptional(input.agentId);
  const leadId = normalizeOptional(input.leadId);
  const lastQuestion = resolveComplaintText(
    normalizeOptional(input.lastQuestion),
    normalizeOptional(input.previousQuestion),
  );

  if (!agentId) {
    return { ok: false, error: "agentId requis." };
  }
  if (!leadId) {
    return { ok: false, error: "leadId requis." };
  }
  if (!isMeaningfulComplaint(lastQuestion)) {
    return { ok: true, leadId, skipped: true };
  }

  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (pocUserId && serviceKey) {
    const admin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    const { data: row, error: fetchErr } = await admin
      .from("leads")
      .select("id, agent_id")
      .eq("id", leadId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { ok: false, error: "Lead introuvable." };
    }

    const { data: ownedAgent, error: ownedAgentError } = await admin
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", pocUserId)
      .maybeSingle();

    if (ownedAgentError || !ownedAgent) {
      return { ok: false, error: "Agent introuvable." };
    }

    const { data: insertedComplaint, error: insertErr } = await admin
      .from("lead_complaints")
      .insert({ lead_id: leadId, content: lastQuestion })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[capture-lead] addLeadComplaint insert (service role) failed:", {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
      });
      return { ok: false, error: insertErr.message };
    }

    return {
      ok: true,
      leadId,
      complaintId: insertedComplaint?.id,
      complaintText: lastQuestion,
    };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const { data: ownedAgent, error: ownedAgentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedAgentError || !ownedAgent) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("leads")
    .select("id, agent_id")
    .eq("id", leadId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: "Lead introuvable." };
  }

  const { data: insertedComplaint, error: insertErr } = await supabase
    .from("lead_complaints")
    .insert({ lead_id: leadId, content: lastQuestion })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[capture-lead] addLeadComplaint insert (session) failed:", {
      message: insertErr.message,
      code: insertErr.code,
      details: insertErr.details,
      hint: insertErr.hint,
    });
    return { ok: false, error: insertErr.message };
  }

  return {
    ok: true,
    leadId,
    complaintId: insertedComplaint?.id,
    complaintText: lastQuestion,
  };
}
