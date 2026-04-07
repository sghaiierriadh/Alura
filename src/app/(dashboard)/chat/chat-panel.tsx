"use client";

import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  agentId: string;
  companyName: string;
};

export function ChatPanel({ agentId, companyName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    const priorForApi = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          message: text,
          messages: priorForApi,
        }),
      });

      if (!res.ok) {
        let errMsg = `Erreur ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch {
          /* ignore */
        }
        setMessages((prev) => prev.slice(0, -2));
        toast.error(errMsg);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((p) => p.slice(0, -2));
        toast.error("Réponse vide du serveur.");
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: accumulated };
          }
          return next;
        });
      }
    } catch (e) {
      setMessages((p) => p.slice(0, -2));
      const msg = e instanceof Error ? e.message : "Échec de l’envoi.";
      toast.error(msg);
    } finally {
      setIsStreaming(false);
    }
  }, [agentId, input, isStreaming, messages]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const canSend = input.trim().length > 0 && !isStreaming;

  return (
    <div className="flex min-h-[min(720px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-xl ring-1 ring-zinc-800/80">
      <header className="shrink-0 border-b border-zinc-800/90 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Conversation
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">
          {companyName}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Alura répond à partir de votre base de connaissance.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">
            Posez une question pour commencer.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <motion.div
            key={`msg-${i}-${m.role}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-sm leading-relaxed text-zinc-900"
                  : "max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-800/90 bg-zinc-900/60 px-4 py-2.5 text-sm leading-relaxed text-zinc-100"
              }
            >
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {m.role === "user" ? "Vous" : "Alura"}
              </span>
              <span className="whitespace-pre-wrap">
                {m.content || (m.role === "assistant" && isStreaming ? "…" : "")}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="shrink-0 border-t border-zinc-800/90 p-4 sm:p-5">
        <div className="flex items-end gap-2 rounded-xl bg-zinc-900/80 p-2 ring-1 ring-zinc-800/80 focus-within:ring-zinc-600/50">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Votre message…"
            disabled={isStreaming}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 transition hover:bg-white disabled:pointer-events-none disabled:opacity-35"
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
