import { loadMyAgent } from "@/lib/agents/server-access";
import { redirect } from "next/navigation";

import { ChatPanel } from "./chat-panel";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  return (
    <ChatPanel
      agentId={agent.id}
      companyName={agent.company_name?.trim() || "Votre entreprise"}
    />
  );
}
