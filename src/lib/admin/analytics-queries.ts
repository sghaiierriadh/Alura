import type { SupabaseClient } from "@supabase/supabase-js";

import { detectPartnerFromKeywords } from "@/lib/ai/partner-extraction";
import type { Database, Json } from "@/types/database.types";

export type DashboardAnalytics = {
  totalLeads: number;
  totalConversations: number;
  totalTickets: number;
  resolvedTickets: number;
  knowledgeBoost: number;
  /** Pourcentage arrondi (0–100). 0 si aucun ticket. */
  resolutionRate: number;
  messagesByDay: MessagesByDayPoint[];
  ticketsByStatus: TicketsByStatus;
  topPartnersByComplaints: PartnerComplaintsPoint[];
};

export type MessagesByDayPoint = {
  /** Date ISO (YYYY-MM-DD). */
  date: string;
  /** Libellé court FR pour axe X (ex: "Lun 21"). */
  label: string;
  /** Nombre de messages agent + visiteur confondus. */
  count: number;
};

export type TicketsByStatus = {
  open: number;
  inProgress: number;
  resolved: number;
};

export type PartnerComplaintsPoint = {
  partner: string;
  count: number;
};

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDayLabel(d: Date): string {
  try {
    const dow = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d);
    return `${dow.replace(/\.$/, "")} ${d.getDate()}`;
  } catch {
    return formatIsoDay(d);
  }
}

/**
 * Calcule les analytics dashboard pour un agent.
 * Résilient aux erreurs Supabase : retourne des zéros plutôt que de crasher.
 */
export async function fetchDashboardAnalytics(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<DashboardAnalytics> {
  const empty: DashboardAnalytics = {
    totalLeads: 0,
    totalConversations: 0,
    totalTickets: 0,
    resolvedTickets: 0,
    knowledgeBoost: 0,
    resolutionRate: 0,
    messagesByDay: buildEmptyWeek(),
    ticketsByStatus: { open: 0, inProgress: 0, resolved: 0 },
    topPartnersByComplaints: [],
  };

  const { count: leadsCount, error: leadsErr } = await client
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  if (leadsErr) {
    console.warn("[analytics] leads count error:", leadsErr.message);
  }
  const totalLeads = leadsCount ?? 0;

  const { count: conversationsCount, error: conversationsErr } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  if (conversationsErr) {
    console.warn("[analytics] conversations count error:", conversationsErr.message);
  }
  const totalConversations = conversationsCount ?? 0;

  const { data: leadRows, error: leadRowsErr } = await client
    .from("leads")
    .select("id")
    .eq("agent_id", agentId);
  if (leadRowsErr) {
    console.warn("[analytics] leads ids error:", leadRowsErr.message);
  }
  const leadIds = (leadRows ?? []).map((r) => r.id);

  let ticketStatuses: string[] = [];
  let ticketsForPartner: Array<{
    id: string;
    content: string;
    metadata: Json | null;
  }> = [];
  if (leadIds.length > 0) {
    const { data: tickets, error: ticketsErr } = await client
      .from("lead_complaints")
      .select("id, status, content, metadata")
      .in("lead_id", leadIds);
    if (ticketsErr) {
      console.warn("[analytics] tickets status error:", ticketsErr.message);
    } else {
      ticketStatuses = (tickets ?? []).map((t) =>
        typeof t.status === "string" && t.status.trim() ? t.status : "open",
      );
      ticketsForPartner = (tickets ?? []).map((t) => ({
        id: t.id,
        content: typeof t.content === "string" ? t.content : "",
        metadata: (t.metadata as Json | null) ?? null,
      }));
    }
  }

  const totalTickets = ticketStatuses.length;
  const ticketsByStatus: TicketsByStatus = {
    open: ticketStatuses.filter((s) => s === "open").length,
    inProgress: ticketStatuses.filter((s) => s === "in_progress").length,
    resolved: ticketStatuses.filter((s) => s === "resolved").length,
  };
  const resolvedTickets = ticketsByStatus.resolved;
  const resolutionRate =
    totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 0;

  const { count: knowledgeBoostCount, error: knowledgeErr } = await client
    .from("knowledge")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("source", "human_resolution");
  if (knowledgeErr) {
    console.warn("[analytics] knowledge boost count error:", knowledgeErr.message);
  }
  const knowledgeBoost = knowledgeBoostCount ?? 0;

  const messagesByDay = await fetchMessagesByDay(client, agentId);
  const topPartnersByComplaints = await buildTopPartnersByComplaints(
    client,
    ticketsForPartner,
  );

  return {
    ...empty,
    totalLeads,
    totalConversations,
    totalTickets,
    resolvedTickets,
    knowledgeBoost,
    resolutionRate,
    messagesByDay,
    ticketsByStatus,
    topPartnersByComplaints,
  };
}

function asObject(raw: unknown): Record<string, Json> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, Json>;
}

function normalizePartner(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s+/g, " ").slice(0, 80);
  return compact || null;
}

function readPartnerName(metadata: Record<string, Json>): string | null {
  const partnerName = normalizePartner(metadata.partner_name);
  if (partnerName) return partnerName;
  // Compatibilité ancienne clé
  return normalizePartner(metadata.partner);
}

async function buildTopPartnersByComplaints(
  client: SupabaseClient<Database>,
  tickets: Array<{ id: string; content: string; metadata: Json | null }>,
): Promise<PartnerComplaintsPoint[]> {
  const counts = new Map<string, number>();
  const updates: Array<{ id: string; metadata: Record<string, Json> }> = [];

  for (const ticket of tickets) {
    const metadata = asObject(ticket.metadata);
    let partner = readPartnerName(metadata);
    if (!partner) {
      partner = detectPartnerFromKeywords(ticket.content);
      if (partner) {
        updates.push({
          id: ticket.id,
          metadata: {
            ...metadata,
            partner_name: partner,
          },
        });
      }
    }
    if (!partner) continue;
    counts.set(partner, (counts.get(partner) ?? 0) + 1);
  }

  for (const update of updates) {
    const { error } = await client
      .from("lead_complaints")
      .update({ metadata: update.metadata })
      .eq("id", update.id);
    if (error) {
      console.warn("[analytics] retro-tag partner metadata failed:", error.message);
    }
  }

  return Array.from(counts.entries())
    .map(([partner, count]) => ({ partner, count }))
    .sort((a, b) => b.count - a.count || a.partner.localeCompare(b.partner))
    .slice(0, 5);
}

function buildEmptyWeek(): MessagesByDayPoint[] {
  const today = startOfLocalDay(new Date());
  const start = addDays(today, -6);
  const points: MessagesByDayPoint[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(start, i);
    points.push({ date: formatIsoDay(d), label: shortDayLabel(d), count: 0 });
  }
  return points;
}

async function fetchMessagesByDay(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<MessagesByDayPoint[]> {
  const base = buildEmptyWeek();
  const today = startOfLocalDay(new Date());
  const start = addDays(today, -6);
  const endExclusive = addDays(today, 1);

  const { data, error } = await client
    .from("messages")
    .select("created_at")
    .eq("agent_id", agentId)
    .gte("created_at", start.toISOString())
    .lt("created_at", endExclusive.toISOString());

  if (error) {
    console.warn("[analytics] messages by day error:", error.message);
    return base;
  }

  const byDay = new Map<string, number>();
  for (const point of base) byDay.set(point.date, 0);

  for (const row of data ?? []) {
    if (!row.created_at) continue;
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = formatIsoDay(startOfLocalDay(d));
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return base.map((p) => ({ ...p, count: byDay.get(p.date) ?? 0 }));
}

export type LeadCsvRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  partner_name: string | null;
};

export async function fetchLeadsForCsv(
  client: SupabaseClient<Database>,
  agentId: string,
): Promise<LeadCsvRow[]> {
  const { data, error } = await client
    .from("leads")
    .select("id, full_name, email, phone, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[analytics] export leads error:", error.message);
    return [];
  }

  const leads = (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
  }>;
  const leadIds = leads.map((x) => x.id);
  if (leadIds.length === 0) return [];

  const { data: complaints, error: complaintsErr } = await client
    .from("lead_complaints")
    .select("lead_id, content, metadata, created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  if (complaintsErr) {
    console.warn("[analytics] export leads complaints error:", complaintsErr.message);
  }

  const partnerByLead = new Map<string, string | null>();
  for (const row of complaints ?? []) {
    if (partnerByLead.has(row.lead_id)) continue;
    const metadata = asObject(row.metadata);
    const fromMetadata = readPartnerName(metadata);
    const fromContent = fromMetadata ?? detectPartnerFromKeywords(row.content);
    partnerByLead.set(row.lead_id, fromContent ?? null);
  }

  return leads.map((lead) => ({
    ...lead,
    partner_name: partnerByLead.get(lead.id) ?? null,
  }));
}
