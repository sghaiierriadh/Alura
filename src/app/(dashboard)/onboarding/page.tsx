import { isAgentConfiguredForNavigation } from "@/lib/agents/is-agent-configured-for-navigation";
import { loadMyAgent } from "@/lib/agents/server-access";

import { OnboardingPageClient } from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const agent = await loadMyAgent();
  const agentConfigured = isAgentConfiguredForNavigation(agent);

  return <OnboardingPageClient agentConfigured={agentConfigured} />;
}
