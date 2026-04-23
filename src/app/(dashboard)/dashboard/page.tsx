import { redirect } from "next/navigation";

import { AnimatedStatsCards } from "@/components/dashboard/AnimatedStatsCards";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { ExportLeadsButton } from "@/components/dashboard/ExportLeadsButton";
import { MessagesActivityChart } from "@/components/dashboard/MessagesActivityChart";
import { PartnersBarChart } from "@/components/dashboard/PartnersBarChart";
import { TicketsStatusDonut } from "@/components/dashboard/TicketsStatusDonut";
import { fetchDashboardAnalytics } from "@/lib/admin/analytics-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const DEFAULT_THEME_COLOR = "#6366f1";

function resolveThemeColor(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_THEME_COLOR;
  const trimmed = raw.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return DEFAULT_THEME_COLOR;
}

function resolveAgentDisplayName(agent: {
  company_name: string | null;
} & Record<string, unknown>): string | null {
  const fromBranding =
    typeof agent.chatbot_name === "string" ? agent.chatbot_name.trim() : "";
  if (fromBranding) return fromBranding;
  const fromCompany =
    typeof agent.company_name === "string" ? agent.company_name.trim() : "";
  return fromCompany || null;
}

export default async function DashboardPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
    redirect("/onboarding");
  }

  const analytics = await fetchDashboardAnalytics(ctx.client, agent.id);
  const themeColor = resolveThemeColor(
    (agent as Record<string, unknown>).theme_color,
  );
  const displayName = resolveAgentDisplayName(agent);
  const hasAnyData =
    analytics.totalLeads > 0 ||
    analytics.totalConversations > 0 ||
    analytics.totalTickets > 0 ||
    analytics.knowledgeBoost > 0 ||
    analytics.topPartnersByComplaints.length > 0 ||
    analytics.messagesByDay.some((p) => p.count > 0);

  return (
    <div className="relative font-sans">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 -z-10 mx-auto h-72 max-w-5xl rounded-full opacity-50 blur-3xl"
        style={{
          background: `radial-gradient(ellipse at center, ${themeColor}33, transparent 70%)`,
        }}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tableau de bord
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Indicateurs en temps réel pour votre agent{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {displayName ?? "—"}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 transition hover:border-emerald-300/50 dark:text-emerald-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            LIVE
          </span>
          <ExportLeadsButton
            themeColor={themeColor}
            disabled={analytics.totalLeads === 0}
          />
        </div>
      </header>

      <div className="mt-8">
        <AnimatedStatsCards
          totalLeads={analytics.totalLeads}
          totalConversations={analytics.totalConversations}
          resolutionRate={analytics.resolutionRate}
          knowledgeBoost={analytics.knowledgeBoost}
          themeColor={themeColor}
        />
      </div>

      {hasAnyData ? (
        <div className="mt-6 space-y-4">
          <MessagesActivityChart
            data={analytics.messagesByDay}
            themeColor={themeColor}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <TicketsStatusDonut
              data={analytics.ticketsByStatus}
              themeColor={themeColor}
            />
            <PartnersBarChart
              data={analytics.topPartnersByComplaints}
              themeColor={themeColor}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <DashboardEmptyState
            themeColor={themeColor}
            agentName={displayName}
          />
        </div>
      )}
    </div>
  );
}
