import type { LeadConversationMessage } from "@/app/actions/admin-leads";

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function LeadConversationBubbles({ messages }: { messages: LeadConversationMessage[] }) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m) => {
        const isUser = m.role === "user";
        return (
          <div
            key={m.id}
            className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[88%] space-y-1.5 ${isUser ? "items-end text-right" : "items-start"}`}>
              <div className="flex items-baseline gap-2 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {isUser ? "Visiteur" : "Alura"}
                </span>
                <span className="text-[10px] text-zinc-400 tabular-nums dark:text-zinc-600">
                  {formatTime(m.created_at)}
                </span>
              </div>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? "rounded-tr-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "rounded-tl-md border border-zinc-200/80 bg-zinc-50 text-zinc-800 dark:border-zinc-700/80 dark:bg-zinc-900/80 dark:text-zinc-100"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
