import { isAgentConfiguredForNavigation } from "@/lib/agents/is-agent-configured-for-navigation";
import { loadMyAgent } from "@/lib/agents/server-access";

import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const agent = await loadMyAgent();
  const agentConfigured = isAgentConfiguredForNavigation(agent);

  return (
    <div className="flex min-h-full flex-col">
      <DashboardShell agentConfigured={agentConfigured}>{children}</DashboardShell>
    </div>
  );
}
