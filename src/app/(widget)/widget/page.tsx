import { ChatPanel } from "@/app/(dashboard)/chat/chat-panel";
import { fetchAgentForWidget } from "@/lib/agents/fetch-agent-widget";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ agentId?: string }>;
};

export default async function WidgetPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = typeof sp.agentId === "string" ? sp.agentId.trim() : "";

  if (!raw) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        Paramètre <code className="text-zinc-300">agentId</code> manquant. Utilisez{" "}
        <code className="text-zinc-300">?agentId=…</code>
      </div>
    );
  }

  const agent = await fetchAgentForWidget(raw);
  if (!agent) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        Agent introuvable ou configuration serveur incomplète (clé service requise pour le
        widget).
      </div>
    );
  }

  return (
    <div className="m-0 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 p-0">
      <ChatPanel
        agentId={agent.id}
        companyName={agent.company_name?.trim() || "Votre partenaire"}
        layout="embedded"
      />
    </div>
  );
}
