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
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Laboratoire de Test</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Entraînez et testez votre agent ici avant le déploiement.
        </p>
      </div>
      <ChatPanel
        agentId={agent.id}
        companyName={agent.company_name?.trim() || "Votre entreprise"}
        themeColor={(agent as { theme_color?: string | null }).theme_color ?? "#18181b"}
        textColor={(agent as { text_color?: string | null }).text_color ?? "#ffffff"}
      />
    </div>
  );
}
