"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { toDbComplaintPriority } from "@/lib/ai/complaint-priority";
import { extractPartnerName } from "@/lib/ai/partner-extraction";
import {
  isMeaningfulComplaint,
  normalizeOptional,
  resolveComplaintText,
} from "@/lib/ai/complaint-text";
import type { Database, Json } from "@/types/database.types";
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

function parseMetadataObject(raw: unknown): Record<string, Json> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, Json>;
}

function withPartnerMetadata(raw: unknown, partnerName: string | null): Record<string, Json> {
  const base = parseMetadataObject(raw);
  if (!partnerName) return base;
  return {
    ...base,
    partner_name: partnerName,
  };
}

/**
 * Find-or-append d'un ticket ouvert pour un lead donné (optionnellement étendu
 * aux leads partageant le même `session_id`). Utilisé par `captureLead` pour
 * éviter les cas où le gate `outcome.created` laissait le ticket initial non créé
 * quand la session existait déjà (localStorage re-partagé entre tests).
 *
 * - Si un ticket `open` / `in_progress` existe déjà → append content (comme addLeadComplaint).
 * - Sinon → INSERT d'un nouveau ticket `open` / priority `normal`.
 *
 * Retourne `null` si tout s'est bien passé, ou un message d'erreur sinon (non bloquant côté appelant).
 */
async function upsertOpenComplaintForLead(
  client: SupabaseClient<Database>,
  params: {
    agentId: string;
    leadId: string;
    sessionId: string | null;
    content: string;
    partnerName: string | null;
  },
): Promise<string | null> {
  try {
    let existing: { id: string; content: string; metadata: Json | null } | null = null;

    if (params.sessionId) {
      const { data: sessionLeadRows } = await client
        .from("leads")
        .select("id")
        .eq("agent_id", params.agentId)
        .eq("session_id", params.sessionId);
      const sessionLeadIds = (sessionLeadRows ?? []).map((x) => x.id);
      if (sessionLeadIds.length > 0) {
        const { data: bySession } = await client
          .from("lead_complaints")
          .select("id, content, metadata")
          .in("lead_id", sessionLeadIds)
          .in("status", ["open", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bySession?.id) existing = bySession;
      }
    }

    if (!existing) {
      const { data: byLead } = await client
        .from("lead_complaints")
        .select("id, content, metadata")
        .eq("lead_id", params.leadId)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byLead?.id) existing = byLead;
    }

    if (existing?.id) {
      const nextContent = appendComplaintContent(existing.content, params.content);
      const nextMetadata = withPartnerMetadata(existing.metadata, params.partnerName);
      console.log("[Extraction] Entité détectée :", params.partnerName);
      const { error: updErr } = await client
        .from("lead_complaints")
        .update({ content: nextContent, metadata: nextMetadata })
        .eq("id", existing.id);
      if (updErr) {
        console.error("[captureLead] upsertOpenComplaintForLead update failed:", updErr.message);
        return updErr.message;
      }
      console.log(
        `[captureLead] TICKET UPDATED (initial upsert) complaintId=${existing.id} leadId=${params.leadId}`,
      );
      return null;
    }

    console.log("[Extraction] Entité détectée :", params.partnerName);
    const { error: insErr } = await client.from("lead_complaints").insert({
      lead_id: params.leadId,
      content: params.content,
      status: "open",
      priority: "normal",
      metadata: withPartnerMetadata(null, params.partnerName),
    });
    if (insErr) {
      console.error("[captureLead] upsertOpenComplaintForLead insert failed:", insErr.message);
      return insErr.message;
    }
    console.log(
      `[captureLead] TICKET CREATED (initial upsert) leadId=${params.leadId} sessionId=${params.sessionId ?? "(none)"}`,
    );
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Exception upsertOpenComplaintForLead.";
    console.error("[captureLead] upsertOpenComplaintForLead exception:", msg);
    return msg;
  }
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

/** Erreurs Postgres/Supabase indiquant un conflit d’unicité que l’on peut convertir en UPDATE. */
function isUniqueViolation(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toString();
  if (code === "23505") return true;
  if (code === "PGRST204") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("duplicate key value") ||
    msg.includes("unique constraint") ||
    msg.includes("conflict")
  );
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
    source: (payload.leadSource || existing.source || "widget") as
      | "widget"
      | "embed"
      | "dashboard"
      | "api"
      | "unknown",
    last_question: mergedQuestion,
  };
  const { error } = await client.from("leads").update(updatePayload).eq("id", leadId);
  return { ok: !error, error };
}

type UpsertLeadPayload = {
  agentId: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  lastQuestion: string | null;
  sessionIdChat: string;
  leadSource: string;
};

type UpsertLeadOutcome =
  | { ok: true; leadId: string; created: boolean }
  | { ok: false; error: string };

async function upsertLeadBySession(
  client: SupabaseClient<Database>,
  payload: UpsertLeadPayload,
): Promise<UpsertLeadOutcome> {
  const existing = await findLeadBySession(client, payload.agentId, payload.sessionIdChat);
  if (existing?.id) {
    console.log(
      `[captureLead] UPDATE lead (session found) sessionId=${payload.sessionIdChat} leadId=${existing.id}`,
    );
    const upd = await updateExistingLead(
      client,
      existing.id,
      {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        lastQuestion: payload.lastQuestion,
        sessionIdChat: payload.sessionIdChat,
        leadSource: payload.leadSource,
      },
      existing,
    );
    if (!upd.ok) {
      return { ok: false, error: upd.error?.message ?? "Mise à jour lead échouée." };
    }
    return { ok: true, leadId: existing.id, created: false };
  }

  console.log(
    `[captureLead] INSERT lead (session new) sessionId=${payload.sessionIdChat} agentId=${payload.agentId}`,
  );
  const { data: inserted, error } = await client
    .from("leads")
    .insert({
      agent_id: payload.agentId,
      email: payload.email,
      phone: payload.phone,
      full_name: payload.fullName,
      last_question: payload.lastQuestion,
      session_id: payload.sessionIdChat,
      source: (payload.leadSource || "widget") as
        | "widget"
        | "embed"
        | "dashboard"
        | "api"
        | "unknown",
    })
    .select("id")
    .single();

  if (!error && inserted?.id) {
    return { ok: true, leadId: inserted.id, created: true };
  }

  if (isUniqueViolation(error)) {
    console.log(
      `[captureLead] conflit d'unicité détecté (agent_id + session_id) — bascule en UPDATE silencieux sessionId=${payload.sessionIdChat}`,
    );
    const retry = await findLeadBySession(client, payload.agentId, payload.sessionIdChat);
    if (retry?.id) {
      const upd = await updateExistingLead(
        client,
        retry.id,
        {
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          lastQuestion: payload.lastQuestion,
          sessionIdChat: payload.sessionIdChat,
          leadSource: payload.leadSource,
        },
        retry,
      );
      if (!upd.ok) {
        return { ok: false, error: upd.error?.message ?? "Mise à jour lead échouée." };
      }
      return { ok: true, leadId: retry.id, created: false };
    }
  }

  return { ok: false, error: error?.message ?? "Insertion lead échouée." };
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
  const extractedPartner = await extractPartnerName({ complaintText: lastQuestion });

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

    const outcome = await upsertLeadBySession(supabase, {
      agentId,
      email,
      phone,
      fullName,
      lastQuestion,
      sessionIdChat,
      leadSource,
    });
    if (!outcome.ok) return outcome;

    if (isMeaningfulComplaint(lastQuestion)) {
      const admin = getServiceRoleAdmin();
      const complaintClient = admin ?? supabase;
      await upsertOpenComplaintForLead(complaintClient, {
        agentId,
        leadId: outcome.leadId,
        sessionId: sessionIdChat,
        content: lastQuestion,
        partnerName: extractedPartner,
      });
    }

    if (outcome.created) {
      const alert = await sendLeadAlertEmail({
        agentId,
        leadId: outcome.leadId,
        fullName,
        email,
        phone,
        source: leadSource,
        lastQuestion,
      });
      if (!alert.ok) {
        console.error("[captureLead] lead created but email notification failed:", alert.error);
      }
    } else {
      console.log(
        `[captureLead] mise à jour silencieuse (pas d'email) sessionId=${sessionIdChat} leadId=${outcome.leadId}`,
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/admin/leads");
    revalidatePath("/admin/tickets");
    return { ok: true, leadId: outcome.leadId };
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

  const outcome = await upsertLeadBySession(admin, {
    agentId,
    email,
    phone,
    fullName,
    lastQuestion,
    sessionIdChat,
    leadSource,
  });
  if (!outcome.ok) return outcome;

  if (isMeaningfulComplaint(lastQuestion)) {
    await upsertOpenComplaintForLead(admin, {
      agentId,
      leadId: outcome.leadId,
      sessionId: sessionIdChat,
      content: lastQuestion,
      partnerName: extractedPartner,
    });
  }

  if (outcome.created) {
    const alert = await sendLeadAlertEmail({
      agentId,
      leadId: outcome.leadId,
      fullName,
      email,
      phone,
      source: leadSource,
      lastQuestion,
    });
    if (!alert.ok) {
      console.error("[captureLead] lead created but email notification failed:", alert.error);
    }
  } else {
    console.log(
      `[captureLead] mise à jour silencieuse service-role (pas d'email) sessionId=${sessionIdChat} leadId=${outcome.leadId}`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/tickets");
  return { ok: true, leadId: outcome.leadId };
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
  const extractedPartner = await extractPartnerName({ complaintText: lastQuestion });

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

    let existingOpen:
      | { id: string; content: string; status: string; priority: string; metadata: Json | null }
      | null =
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
          .select("id, content, status, priority, metadata")
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
        .select("id, content, status, priority, metadata")
        .eq("lead_id", leadId)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingOpen = byLeadOpen ?? null;
    }

    if (existingOpen?.id) {
      const nextContent = appendComplaintContent(existingOpen.content, lastQuestion);
      const nextMetadata = withPartnerMetadata(existingOpen.metadata, extractedPartner);
      console.log("[Extraction] Entité détectée :", extractedPartner);
      const { error: updErr } = await admin
        .from("lead_complaints")
        .update({
          content: nextContent,
          priority: complaintPriority,
          metadata: nextMetadata,
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

    console.log("[Extraction] Entité détectée :", extractedPartner);
    const { data: insertedComplaint, error: insertErr } = await admin
      .from("lead_complaints")
      .insert({
        ...insertPayload,
        metadata: withPartnerMetadata(null, extractedPartner),
      })
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
  let existingMetadata: Json | null = null;
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
        .select("id, content, status, priority, metadata")
        .in("lead_id", sessionLeadIds)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (bySessionOpen?.id) {
        existingOpen = bySessionOpen;
        existingMetadata = bySessionOpen.metadata;
      }
    }
  }
  if (!existingOpen) {
    const { data: byLeadOpen } = await supabase
      .from("lead_complaints")
      .select("id, content, status, priority, metadata")
      .eq("lead_id", leadId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingOpen = byLeadOpen ?? null;
    existingMetadata = byLeadOpen?.metadata ?? null;
  }

  if (existingOpen?.id) {
    const nextContent = appendComplaintContent(existingOpen.content, lastQuestion);
    console.log("[Extraction] Entité détectée :", extractedPartner);
    const { error: updErr } = await supabase
      .from("lead_complaints")
      .update({
        content: nextContent,
        priority: complaintPriority,
        metadata: withPartnerMetadata(existingMetadata, extractedPartner),
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

  console.log("[Extraction] Entité détectée :", extractedPartner);
  const { data: insertedComplaint, error: insertErr } = await supabase
    .from("lead_complaints")
    .insert({
      ...insertPayload,
      metadata: withPartnerMetadata(null, extractedPartner),
    })
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
