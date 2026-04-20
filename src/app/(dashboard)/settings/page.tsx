import { AgentApiExpertForm } from "@/components/dashboard/AgentApiExpertForm";
import { BusinessRecordsUpload } from "@/components/dashboard/BusinessRecordsUpload";
import { loadMyAgent } from "@/lib/agents/server-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const apiKeyConfigured = Boolean(agent.api_key?.trim());

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Paramètres
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Configuration de votre agent et données associées.
        </p>
      </div>

      <section aria-labelledby="structured-data-heading" className="space-y-4">
        <div>
          <h2
            id="structured-data-heading"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Données structurées
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Catalogue CSV, connexion à votre API temps réel, et import des enregistrements métier
            (remplacement complet du CSV à chaque import).
          </p>
        </div>
        <AgentApiExpertForm
          initialEndpoint={agent.api_endpoint?.trim() ?? ""}
          apiKeyConfigured={apiKeyConfigured}
        />
        <BusinessRecordsUpload agentId={agent.id} />
      </section>
    </div>
  );
}
