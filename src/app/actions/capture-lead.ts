"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import { toDbComplaintPriority } from "@/lib/ai/complaint-priority";
import {
  isMeaningfulComplaint,
  normalizeOptional,
  resolveComplaintText,
} from "@/lib/ai/complaint-text";
import type { Database } from "@/types/database.types";

export type CaptureLeadInput = {
  agentId: string;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  lastQuestion?: string | null;
  previousQuestion?: string | null;
  /** Session chat (messages) — pour lier le lead à la discussion côté admin */
  sessionId?: string | null;
  /** Origine du lead : widget, embed, dashboard, api, unknown */
  source?: string | null;
};

export type CaptureLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string };

export type AddLeadComplaintResult =
  | { ok: true; leadId: string; complaintId?: string; complaintText?: string; skipped?: boolean }
  | { ok: false; error: string };

const LEAD_SOURCES = new Set(["widget", "embed", "dashboard", "api", "unknown"]);

function getServiceRoleAdmin(): ReturnType<
  typeof createServiceRoleClient<Database>
> | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
}

/**
 * Valeur stockée en base (snake_case / minuscules). Défaut **widget** si non fourni (nouveaux leads).
 */
function normalizeLeadSource(value?: string | null): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "widget";
  const v = raw.toLowerCase();
  if (LEAD_SOURCES.has(v)) return v;
  if (v === "chat" || v === "app") return "dashboard";
  return "unknown";
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
  const sessionIdChat = normalizeOptional(input.sessionId);
  const leadSource = normalizeLeadSource(input.source);

  if (!agentId) {
    return { ok: false, error: "agentId requis." };
  }
  if (!email && !phone) {
    return { ok: false, error: "Email ou téléphone requis." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!authError && user) {
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
        session_id: sessionIdChat,
        source: leadSource,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      return { ok: false, error: error?.message ?? "Insertion lead échouée." };
    }

    if (isMeaningfulComplaint(lastQuestion)) {
      const admin = getServiceRoleAdmin();
      const complaintClient = admin ?? supabase;
      const { error: complaintErr } = await complaintClient.from("lead_complaints").insert({
        lead_id: inserted.id,
        content: lastQuestion,
        status: "open",
        priority: "normal",
      });
      if (complaintErr) {
        return { ok: false, error: complaintErr.message };
      }
    }

    return { ok: true, leadId: inserted.id };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data: agentRow, error: agentErr } = await admin
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentErr || !agentRow) {
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
      session_id: sessionIdChat,
      source: leadSource,
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
      status: "open",
      priority: "normal",
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
  /** low | normal | high — défaut normal si absent ou invalide */
  priority?: string | null;
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

  const complaintPriority = toDbComplaintPriority(input.priority);

  const admin = getServiceRoleAdmin();
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const insertPayload = {
    lead_id: leadId,
    content: lastQuestion,
    status: "open" as const,
    priority: complaintPriority,
  };

  if (admin) {
    const { data: row, error: fetchErr } = await admin
      .from("leads")
      .select("id, agent_id")
      .eq("id", leadId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { ok: false, error: "Lead introuvable." };
    }

    const { data: insertedComplaint, error: insertErr } = await admin
      .from("lead_complaints")
      .insert(insertPayload)
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
    .insert(insertPayload)
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
