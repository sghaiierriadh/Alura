import { redirect } from "next/navigation";

import { fetchTicketsForAgent } from "@/lib/admin/dashboard-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

import { TicketsTableClient } from "./tickets-table-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AdminTicketsPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
    redirect("/onboarding");
  }

  console.log("[admin/tickets] page render", {
    agentId: agent.id,
    userId: ctx.userId,
  });

  const tickets = await fetchTicketsForAgent(ctx.client, agent.id);
  console.log("Tickets récupérés:", tickets.length);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Tickets</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Réclamations et intentions enregistrées (multi-tickets par lead). Modifiez le statut via le menu
        déroulant.
      </p>
      <div className="mt-8">
        <TicketsTableClient tickets={tickets} />
      </div>
    </div>
  );
}
