import { AgentApiExpertForm } from "@/components/dashboard/AgentApiExpertForm";
import { BusinessRecordsUpload } from "@/components/dashboard/BusinessRecordsUpload";
import { SettingsLookProForm } from "@/components/dashboard/SettingsLookProForm";
import { loadMyAgent } from "@/lib/agents/server-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const apiKeyConfigured = Boolean(agent.api_key?.trim());
  const agentBranding = agent as typeof agent & {
    chatbot_name?: string | null;
    theme_color?: string | null;
    welcome_message?: string | null;
    avatar_url?: string | null;
  };
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim() || "http://localhost:3000";

  return (
    <div className="space-y-10">
      <div className="rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Paramètres
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Identité visuelle, intégration et configuration des données de votre agent.
        </p>
      </div>

      <SettingsLookProForm
        agentId={agent.id}
        appUrl={appUrl}
        initialChatbotName={agentBranding.chatbot_name?.trim() || "Alura"}
        initialThemeColor={agentBranding.theme_color?.trim() || "#18181b"}
        initialWelcomeMessage={
          agentBranding.welcome_message?.trim() ||
          `Bonjour, je suis Alura de ${agent.company_name?.trim() || "votre entreprise"}. Comment puis-je vous aider ?`
        }
        initialAvatarUrl={agentBranding.avatar_url?.trim() || null}
      />

      <section
        aria-labelledby="structured-data-heading"
        className="space-y-4 rounded-3xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/5"
      >
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
