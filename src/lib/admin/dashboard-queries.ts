import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type ComplaintRow = Database["public"]["Tables"]["lead_complaints"]["Row"];

export type TicketWithLead = ComplaintRow & {
  leads: Pick<LeadRow, "id" | "full_name" | "email" | "phone" | "agent_id" | "source"> | null;
};

function normalizeLeadSourceRow(row: LeadRow): LeadRow {
  const src = row.source?.trim();
  return {
    ...row,
    source: src && src.length > 0 ? src : "unknown",
  };
}

function normalizeTicketRow(row: TicketWithLead): TicketWithLead {
  const pr = row.priority?.trim();
  const st = row.status?.trim();
  const notes = row.resolution_notes;
  return {
    ...row,
    status: st && st.length > 0 ? st : "open",
    priority: pr && pr.length > 0 ? pr : "normal",
    resolution_notes: notes ?? null,
    leads: row.leads
      ? {
          ...row.leads,
          source: row.leads.source?.trim() || "unknown",
        }
      : null,
  };
}

export type DashboardStats = {
  totalLeads: number;
  openTickets: number;
  conversationsToday: number;
};

function startOfUtcDayIso(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return x.toISOString();
}

function endOfUtcDayIso(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return x.toISOString();
}

export async function fetchDashboardStats(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<DashboardStats> {
  const { count: totalLeads } = await client
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);

  const { data: leadRows } = await client
    .from("leads")
    .select("id")
    .eq("agent_id", agentId);
  const leadIds = (leadRows ?? []).map((r) => r.id);

  let openTickets = 0;
  if (leadIds.length > 0) {
    const openQuery = await client
      .from("lead_complaints")
      .select("id,status", { count: "exact", head: true })
      .in("lead_id", leadIds)
      .in("status", ["open", "in_progress"]);

    if (openQuery.error) {
      console.warn("[dashboard-queries] open tickets count:", openQuery.error.message);
      openTickets = 0;
    } else {
      openTickets = openQuery.count ?? 0;
    }
  }

  const dayStart = startOfUtcDayIso();
  const dayEnd = endOfUtcDayIso();
  const { data: sessionsToday } = await client
    .from("messages")
    .select("session_id")
    .eq("agent_id", agentId)
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  const distinctSessions = new Set((sessionsToday ?? []).map((m) => m.session_id));
  const conversationsToday = distinctSessions.size;

  return {
    totalLeads: totalLeads ?? 0,
    openTickets,
    conversationsToday,
  };
}

export async function fetchLeadsForAgent(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<LeadRow[]> {
  const { data, error } = await client
    .from("leads")
    .select("id, agent_id, email, phone, full_name, last_question, session_id, source, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(normalizeLeadSourceRow);
}

export async function fetchTicketsForAgent(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<TicketWithLead[]> {
  const { data: leadRows } = await client
    .from("leads")
    .select("id")
    .eq("agent_id", agentId);
  const ids = (leadRows ?? []).map((r) => r.id);
  if (ids.length === 0) return [];

  const ticketSelect =
    "id, lead_id, content, status, resolution_notes, priority, created_at, leads(id, full_name, email, phone, agent_id, source)";

  const { data, error } = await client
    .from("lead_complaints")
    .select(ticketSelect)
    .in("lead_id", ids)
    .order("created_at", { ascending: false });

  if (!error && data) {
    return (data as TicketWithLead[]).map(normalizeTicketRow);
  }

  if (error) {
    console.warn("[dashboard-queries] fetchTicketsForAgent join:", error.message);
  }

  const { data: flat, error: flatErr } = await client
    .from("lead_complaints")
    .select("id, lead_id, content, status, resolution_notes, priority, created_at")
    .in("lead_id", ids)
    .order("created_at", { ascending: false });
  if (flatErr || !flat?.length) return [];

  const { data: leadsData } = await client
    .from("leads")
    .select("id, full_name, email, phone, agent_id, session_id, source")
    .in("id", ids);
  const byId = new Map((leadsData ?? []).map((l) => [l.id, l]));

  return flat.map((c) => {
    const status =
      typeof c.status === "string" && c.status.length > 0 ? c.status : "open";
    const leadRaw = byId.get(c.lead_id) ?? null;
    const lead = leadRaw
      ? {
          ...leadRaw,
          source: leadRaw.source?.trim() || "unknown",
        }
      : null;
    return normalizeTicketRow({
      ...c,
      status,
      resolution_notes: c.resolution_notes ?? null,
      priority:
        typeof c.priority === "string" && c.priority.trim().length > 0
          ? c.priority.trim()
          : "normal",
      leads: lead,
    } as TicketWithLead);
  });
}
