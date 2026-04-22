import { ChatPanel } from "@/app/(dashboard)/chat/chat-panel";
import { fetchAgentForWidget } from "@/lib/agents/fetch-agent-widget";
import { isWidgetAgentIdFormatValid } from "@/lib/agents/widget-agent-id";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ agentId?: string; id?: string }>;
};

export default async function WidgetPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw =
    typeof sp.agentId === "string"
      ? sp.agentId.trim()
      : typeof sp.id === "string"
        ? sp.id.trim()
        : "";

  if (!raw) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Paramètre manquant</p>
        <p>
          Ajoutez <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">agentId</code>{" "}
          dans l’URL : <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">?agentId=…</code>
        </p>
      </div>
    );
  }

  if (!isWidgetAgentIdFormatValid(raw)) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Identifiant d’agent invalide</p>
        <p>
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">agentId</code> doit être
          un UUID valide (format v4).
        </p>
      </div>
    );
  }

  const agent = await fetchAgentForWidget(raw);
  if (!agent) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Agent introuvable</p>
        <p>
          Aucun agent ne correspond à cet identifiant, ou le widget n’est pas correctement configuré
          côté serveur (variable <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">SUPABASE_SERVICE_ROLE_KEY</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="m-0 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-zinc-950 p-0">
      <ChatPanel
        agentId={agent.id}
        companyName={agent.company_name?.trim() || "Votre partenaire"}
        chatbotName={agent.chatbot_name?.trim() || "Alura"}
        themeColor={agent.theme_color?.trim() || "#18181b"}
        welcomeMessage={agent.welcome_message?.trim() || null}
        avatarUrl={agent.avatar_url?.trim() || null}
        layout="embedded"
      />
    </div>
  );
}
