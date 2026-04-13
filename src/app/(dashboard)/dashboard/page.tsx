import { MessageSquare, Ticket, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { StatCard } from "@/components/admin/stat-card";
import { fetchDashboardStats } from "@/lib/admin/dashboard-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
    redirect("/onboarding");
  }

  const stats = await fetchDashboardStats(ctx.client, agent.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Tableau de bord
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Indicateurs en temps réel pour votre agent{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          {agent.company_name?.trim() || "—"}
        </span>
        .
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total leads" value={stats.totalLeads} icon={Users} accent="violet" />
        <StatCard
          title="Tickets ouverts / en cours"
          value={stats.openTickets}
          icon={Ticket}
          accent="amber"
        />
        <StatCard
          title="Conversations aujourd’hui"
          value={stats.conversationsToday}
          icon={MessageSquare}
          accent="emerald"
        />
      </div>
    </div>
  );
}
