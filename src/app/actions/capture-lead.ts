"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { toDbComplaintPriority } from "@/lib/ai/complaint-priority";
import {
  isMeaningfulComplaint,
  normalizeOptional,
  resolveComplaintText,
} from "@/lib/ai/complaint-text";
import type { Database } from "@/types/database.types";
import { sendLeadAlertEmail } from "./send-lead-alert";

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
  | {
      ok: true;
      leadId: string;
      complaintId?: string;
      complaintText?: string;
      skipped?: boolean;
      action?: "created" | "updated";
    }
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

function mergeLeadQuestion(existing: string | null, incoming: string | null): string | null {
  const base = normalizeOptional(existing);
  const add = normalizeOptional(incoming);
  if (!base && !add) return null;
  if (!base) return add;
  if (!add) return base;
  if (base.includes(add)) return base;
  return `${base}\n\n[Update ${new Date().toISOString()}]\n${add}`;
}

function appendComplaintContent(existing: string, incoming: string): string {
  const base = normalizeOptional(existing) ?? "";
  const add = normalizeOptional(incoming) ?? "";
  if (!base) return add;
  if (!add || base.includes(add)) return base;
  return `${base}\n\n[Update ${new Date().toISOString()}]\n${add}`;
}

async function findLeadBySession(
  client: SupabaseClient<Database>,
  agentId: string,
  sessionIdChat: string,
) {
  const { data } = await client
    .from("leads")
    .select("id, email, phone, full_name, last_question, session_id, source, created_at")
    .eq("agent_id", agentId)
    .eq("session_id", sessionIdChat)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function updateExistingLead(
  client: SupabaseClient<Database>,
  leadId: string,
  payload: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    lastQuestion: string | null;
    sessionIdChat: string | null;
    leadSource: string;
  },
  existing: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    last_question: string | null;
    session_id: string | null;
    source: string | null;
  },
) {
  const mergedQuestion = mergeLeadQuestion(existing.last_question, payload.lastQuestion);
  const updatePayload: Database["public"]["Tables"]["leads"]["Update"] = {
    full_name: payload.fullName || existing.full_name,
    email: payload.email || existing.email,
    phone: payload.phone || existing.phone,
    session_id: payload.sessionIdChat || existing.session_id,
    source: payload.leadSource || existing.source || "widget",
    last_question: mergedQuestion,
  };
  const { error } = await client.from("leads").update(updatePayload).eq("id", leadId);
  return { ok: !error, error };
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
  if (!sessionIdChat) {
    return { ok: false, error: "sessionId requis pour capturer/mettre à jour le lead." };
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

    const recentLead = await findLeadBySession(supabase, agentId, sessionIdChat);
    if (recentLead?.id) {
      console.log(`Session ID reçu: ${sessionIdChat} - Action: UPDATE`);
      const upd = await updateExistingLead(
        supabase,
        recentLead.id,
        { fullName, email, phone, lastQuestion, sessionIdChat, leadSource },
        recentLead,
      );
      if (!upd.ok) {
        return { ok: false, error: upd.error?.message ?? "Mise à jour lead échouée." };
      }
      return { ok: true, leadId: recentLead.id };
    }
    console.log(`Session ID reçu: ${sessionIdChat} - Action: INSERT`);

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
    console.log("[captureLead] lead created", { leadId: inserted.id, agentId, sessionIdChat });

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

    const alert = await sendLeadAlertEmail({
      agentId,
      leadId: inserted.id,
      fullName,
      email,
      phone,
      source: leadSource,
      lastQuestion,
    });
    if (!alert.ok) {
      console.error("[captureLead] lead created but email notification failed:", alert.error);
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

  const recentLead = await findLeadBySession(admin, agentId, sessionIdChat);
  if (recentLead?.id) {
    console.log(`Session ID reçu: ${sessionIdChat} - Action: UPDATE`);
    const upd = await updateExistingLead(
      admin,
      recentLead.id,
      { fullName, email, phone, lastQuestion, sessionIdChat, leadSource },
      recentLead,
    );
    if (!upd.ok) {
      return { ok: false, error: upd.error?.message ?? "Mise à jour lead échouée." };
    }
    return { ok: true, leadId: recentLead.id };
  }
  console.log(`Session ID reçu: ${sessionIdChat} - Action: INSERT`);

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
  console.log("[captureLead] lead created (service)", { leadId: inserted.id, agentId, sessionIdChat });

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

  const alert = await sendLeadAlertEmail({
    agentId,
    leadId: inserted.id,
    fullName,
    email,
    phone,
    source: leadSource,
    lastQuestion,
  });
  if (!alert.ok) {
    console.error("[captureLead] lead created but email notification failed:", alert.error);
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
      .select("id, agent_id, session_id")
      .eq("id", leadId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (fetchErr || !row) {
      return { ok: false, error: "Lead introuvable." };
    }

    let existingOpen: { id: string; content: string; status: string; priority: string } | null =
      null;
    const sid = normalizeOptional(row.session_id);
    if (sid) {
      const { data: sessionLeadRows } = await admin
        .from("leads")
        .select("id")
        .eq("agent_id", agentId)
        .eq("session_id", sid);
      const sessionLeadIds = (sessionLeadRows ?? []).map((x) => x.id);
      if (sessionLeadIds.length > 0) {
        const { data: bySessionOpen } = await admin
          .from("lead_complaints")
          .select("id, content, status, priority")
          .in("lead_id", sessionLeadIds)
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bySessionOpen?.id) {
          existingOpen = bySessionOpen;
        }
      }
    }
    if (!existingOpen) {
      const { data: byLeadOpen } = await admin
        .from("lead_complaints")
        .select("id, content, status, priority")
        .eq("lead_id", leadId)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingOpen = byLeadOpen ?? null;
    }

    if (existingOpen?.id) {
      const nextContent = appendComplaintContent(existingOpen.content, lastQuestion);
      const { error: updErr } = await admin
        .from("lead_complaints")
        .update({
          content: nextContent,
          priority: complaintPriority,
        })
        .eq("id", existingOpen.id);
      if (updErr) {
        console.error("[capture-lead] addLeadComplaint update (service role) failed:", {
          message: updErr.message,
          code: updErr.code,
          details: updErr.details,
          hint: updErr.hint,
        });
        return { ok: false, error: updErr.message };
      }
      return {
        ok: true,
        leadId,
        complaintId: existingOpen.id,
        complaintText: lastQuestion,
        action: "updated",
      };
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
      action: "created",
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
    .select("id, agent_id, session_id")
    .eq("id", leadId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: "Lead introuvable." };
  }

  let existingOpen: { id: string; content: string; status: string; priority: string } | null = null;
  const sid = normalizeOptional(row.session_id);
  if (sid) {
    const { data: sessionLeadRows } = await supabase
      .from("leads")
      .select("id")
      .eq("agent_id", agentId)
      .eq("session_id", sid);
    const sessionLeadIds = (sessionLeadRows ?? []).map((x) => x.id);
    if (sessionLeadIds.length > 0) {
      const { data: bySessionOpen } = await supabase
        .from("lead_complaints")
        .select("id, content, status, priority")
        .in("lead_id", sessionLeadIds)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bySessionOpen?.id) {
        existingOpen = bySessionOpen;
      }
    }
  }
  if (!existingOpen) {
    const { data: byLeadOpen } = await supabase
      .from("lead_complaints")
      .select("id, content, status, priority")
      .eq("lead_id", leadId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingOpen = byLeadOpen ?? null;
  }

  if (existingOpen?.id) {
    const nextContent = appendComplaintContent(existingOpen.content, lastQuestion);
    const { error: updErr } = await supabase
      .from("lead_complaints")
      .update({
        content: nextContent,
        priority: complaintPriority,
      })
      .eq("id", existingOpen.id);
    if (updErr) {
      console.error("[capture-lead] addLeadComplaint update (session) failed:", {
        message: updErr.message,
        code: updErr.code,
        details: updErr.details,
        hint: updErr.hint,
      });
      return { ok: false, error: updErr.message };
    }
    return {
      ok: true,
      leadId,
      complaintId: existingOpen.id,
      complaintText: lastQuestion,
      action: "updated",
    };
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
    action: "created",
  };
}
