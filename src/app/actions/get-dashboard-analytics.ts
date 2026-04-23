"use server";

import { fetchDashboardAnalytics } from "@/lib/admin/analytics-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

export type GetDashboardAnalyticsResult =
  | { ok: true; data: Awaited<ReturnType<typeof fetchDashboardAnalytics>> }
  | { ok: false; error: string };

/**
 * Server Action dédiée au dashboard ROI (données temps réel de l'agent courant).
 */
export async function getDashboardAnalytics(): Promise<GetDashboardAnalyticsResult> {
  const agent = await loadMyAgent();
  if (!agent) return { ok: false, error: "Agent introuvable." };

  const ctx = await getAdminReadContext();
  if (!ctx) return { ok: false, error: "Non authentifié." };

  const data = await fetchDashboardAnalytics(ctx.client, agent.id);
  return { ok: true, data };
}
