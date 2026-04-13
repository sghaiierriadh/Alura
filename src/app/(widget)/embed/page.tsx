import { ChatLauncher } from "@/components/chat-launcher";
import { isWidgetAgentIdFormatValid } from "@/lib/agents/widget-agent-id";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ agentId?: string }>;
};

export default async function EmbedPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const agentId = typeof sp.agentId === "string" ? sp.agentId.trim() : "";

  if (!agentId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-zinc-100 px-6 text-center text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        <p>
          Ajoutez <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">?agentId=…</code>{" "}
          à l’URL pour afficher le lanceur du widget.
        </p>
      </div>
    );
  }

  if (!isWidgetAgentIdFormatValid(agentId)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        <p className="font-medium text-zinc-800 dark:text-zinc-200">Identifiant d’agent invalide</p>
        <p>
          Le paramètre <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">agentId</code> doit être un UUID valide (format v4).
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-100 dark:bg-zinc-950">
      <ChatLauncher agentId={agentId} />
    </div>
  );
}
