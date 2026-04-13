import { redirect } from "next/navigation";

import { fetchLeadsForAgent } from "@/lib/admin/dashboard-queries";
import { getAdminReadContext } from "@/lib/admin/server-context";
import { loadMyAgent } from "@/lib/agents/server-access";

import { LeadsTableClient } from "./leads-table-client";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const ctx = await getAdminReadContext();
  if (!ctx) {
    redirect("/onboarding");
  }

  const leads = await fetchLeadsForAgent(ctx.client, agent.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Leads</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Contacts capturés via le chat et le widget. Ouvrez la discussion pour revoir les messages enregistrés
        (session liée au lead).
      </p>
      <div className="mt-8">
        <LeadsTableClient leads={leads} />
      </div>
    </div>
  );
}
