"use server";

import { getAdminReadContext } from "@/lib/admin/server-context";

export type LeadConversationMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export type LoadLeadConversationResult =
  | {
      ok: true;
      messages: LeadConversationMessage[];
      contactName: string | null;
      hasSession: boolean;
    }
  | { ok: false; error: string };

function isSchemaOrCacheMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("could not find") ||
    (m.includes("column") && m.includes("does not exist"))
  );
}

/**
 * Historique messages pour un lead : `leads.session_id` → `messages.session_id`.
 */
export async function loadLeadConversation(leadId: string): Promise<LoadLeadConversationResult> {
  const id = leadId.trim();
  if (!id) {
    return { ok: false, error: "Identifiant lead requis." };
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
    return { ok: false, error: "Non authentifié." };
  }

  const { data: agent } = await ctx.client
    .from("agents")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!agent?.id) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { data: lead, error: leadErr } = await ctx.client
    .from("leads")
    .select("id, agent_id, full_name, session_id")
    .eq("id", id)
    .maybeSingle();

  if (leadErr) {
    if (isSchemaOrCacheMessage(leadErr.message)) {
      console.warn("[admin-leads] loadLeadConversation lead select:", leadErr.message);
      return {
        ok: true,
        messages: [],
        contactName: null,
        hasSession: false,
      };
    }
    return { ok: false, error: leadErr.message };
  }

  if (!lead) {
    return { ok: false, error: "Lead introuvable." };
  }

  if (lead.agent_id !== agent.id) {
    return { ok: false, error: "Accès refusé." };
  }

  const sid = typeof lead.session_id === "string" ? lead.session_id.trim() : "";
  if (!sid) {
    return {
      ok: true,
      messages: [],
      contactName: lead.full_name,
      hasSession: false,
    };
  }

  const { data: messages, error: msgErr } = await ctx.client
    .from("messages")
    .select("id, role, content, created_at")
    .eq("agent_id", agent.id)
    .eq("session_id", sid)
    .order("created_at", { ascending: true });

  if (msgErr) {
    if (isSchemaOrCacheMessage(msgErr.message)) {
      console.warn("[admin-leads] loadLeadConversation messages select:", msgErr.message);
      return {
        ok: true,
        messages: [],
        contactName: lead.full_name,
        hasSession: true,
      };
    }
    return { ok: false, error: msgErr.message };
  }

  return {
    ok: true,
    messages: (messages ?? []) as LeadConversationMessage[],
    contactName: lead.full_name,
    hasSession: true,
  };
}
