"use client";

import { saveMessage } from "@/app/actions/save-message";
import { AnimatePresence, motion } from "framer-motion";
import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  hasLeadFormTrigger,
  stripLeadFormTrigger,
} from "@/lib/ai/lead-form-trigger";
import { LeadForm } from "./lead-form";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const LEAD_FOLLOW_UP_MESSAGE =
  "C'est noté, j'ai transmis votre demande. Avez-vous une autre question ou une précision à ajouter avant que nous ne clôturions cet échange ?";
function buildDynamicGreeting(companyName: string): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour >= 18 ? "Bonsoir" : "Salut";
  const partner = companyName.trim() || "votre partenaire";
  return `${greeting}, je suis Alura, en charge de vos réclamations, problèmes ou demandes chez ${partner}. Comment puis-je vous aider ?`;
}

function chatSessionStorageKey(id: string) {
  return `alura.chat.session.${id}`;
}

function chatLeadStorageKey(agentId: string, sessionId: string) {
  return `alura.chat.lead.${agentId}.${sessionId}`;
}

function chatLeadContactKey(agentId: string, sessionId: string) {
  return `alura.chat.leadContact.${agentId}.${sessionId}`;
}

function chatLeadIdKey(agentId: string, sessionId: string) {
  return `alura.chat.leadId.${agentId}.${sessionId}`;
}

function ChatMarkdown({
  content,
  role,
}: {
  content: string;
  role: "user" | "assistant";
}) {
  return (
    <div
      className={
        role === "assistant"
          ? "prose prose-sm max-w-none prose-zinc dark:prose-invert [&_a]:break-words [&_a]:underline"
          : "prose prose-sm max-w-none prose-zinc [&_a]:break-words [&_a]:underline"
      }
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

type Props = {
  agentId: string;
  companyName: string;
};

export function ChatPanel({ agentId, companyName }: Props) {
  const [messages, setMessages] = useState<Array<ChatMessage & { uiOnly?: boolean }>>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  /** Identifiant lead Supabase — seule preuve fiable d’une capture réussie. */
  const [storedLeadId, setStoredLeadId] = useState<string | null>(null);
  const [leadTriggerActive, setLeadTriggerActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visitorFirstName, setVisitorFirstName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const leadFullyCaptured = Boolean(storedLeadId?.trim());

  useEffect(() => {
    if (messages.length > 0) return;
    console.log("[Alura chat client] Greeting...");
    setMessages([
      { role: "assistant", content: buildDynamicGreeting(companyName), uiOnly: true },
    ]);
  }, [companyName, messages.length]);

  useEffect(() => {
    try {
      const sk = chatSessionStorageKey(agentId);
      let id = sessionStorage.getItem(sk);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(sk, id);
      }
      setSessionId(id);
      const leadFlag = sessionStorage.getItem(chatLeadStorageKey(agentId, id)) === "1";
      const leadIdRaw = sessionStorage.getItem(chatLeadIdKey(agentId, id))?.trim() ?? "";
      if (leadFlag && !leadIdRaw) {
        sessionStorage.removeItem(chatLeadStorageKey(agentId, id));
      }
      setStoredLeadId(leadIdRaw || null);
      const contactRaw = sessionStorage.getItem(chatLeadContactKey(agentId, id));
      if (contactRaw) {
        try {
          const c = JSON.parse(contactRaw) as { fullName?: string };
          const p = (c.fullName ?? "").trim().split(/\s+/)[0];
          if (p) setVisitorFirstName(p);
        } catch {
          /* ignore */
        }
      }
    } catch {
      setSessionId(crypto.randomUUID());
    }
  }, [agentId]);

  const getLastUserQuestion = useCallback((): string | null => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "user" && m.content.trim()) return m.content.trim();
    }
    return null;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const isWeakQuestion = useCallback((text: string | null): boolean => {
    if (!text) return true;
    const t = text.trim();
    if (t.length < 12) return true;
    const tokens = t.split(/\s+/);
    if (tokens.length <= 2) return true;
    return !/[?]/.test(t) && t.length < 20;
  }, []);

  const getBestComplaintFromHistory = useCallback(
    (current?: string): { lastQuestion: string | null; previousQuestion: string | null } => {
      const users = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
      const currentText = (current ?? "").trim();
      const all = currentText ? [...users, currentText] : users;
      const last = all.length > 0 ? all[all.length - 1] : null;
      const previous = all.length > 1 ? all[all.length - 2] : null;
      if (!isWeakQuestion(last)) return { lastQuestion: last, previousQuestion: previous };
      for (let i = all.length - 2; i >= 0; i -= 1) {
        if (!isWeakQuestion(all[i])) {
          return { lastQuestion: all[i], previousQuestion: previous };
        }
      }
      return { lastQuestion: last, previousQuestion: previous };
    },
    [isWeakQuestion, messages],
  );

  const handleLeadSubmitted = useCallback(
    (payload: {
      email: string;
      phone: string;
      fullName: string;
      leadId: string;
    }) => {
      const lid = payload.leadId.trim();
      setStoredLeadId(lid);

      const resolvedSessionId =
        sessionId ??
        (typeof window !== "undefined"
          ? sessionStorage.getItem(chatSessionStorageKey(agentId))
          : null);

      if (resolvedSessionId) {
        try {
          sessionStorage.setItem(chatLeadStorageKey(agentId, resolvedSessionId), "1");
          sessionStorage.setItem(
            chatLeadContactKey(agentId, resolvedSessionId),
            JSON.stringify({
              email: payload.email,
              phone: payload.phone,
              fullName: payload.fullName,
            }),
          );
          sessionStorage.setItem(chatLeadIdKey(agentId, resolvedSessionId), lid);
          console.log("[Alura Debug] Persisting leadId (state + sessionStorage)", {
            leadId: lid,
            sessionId: resolvedSessionId,
          });
        } catch {
          /* ignore */
        }
        void saveMessage({
          sessionId: resolvedSessionId,
          agentId,
          role: "assistant",
          content: LEAD_FOLLOW_UP_MESSAGE,
        }).then((r) => {
          if (!r.ok) {
            console.warn("[chat] saveMessage follow-up:", r.error);
          }
        });
      } else {
        console.warn(
          "[Alura Debug] captureLead OK mais sessionId introuvable — leadId non écrit en sessionStorage",
          { leadId: lid },
        );
      }
      const prenom = payload.fullName.trim().split(/\s+/)[0];
      if (prenom) setVisitorFirstName(prenom);
      setLeadTriggerActive(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: LEAD_FOLLOW_UP_MESSAGE },
      ]);
    },
    [agentId, sessionId],
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || !sessionId) return;

    setInput("");
    setLeadTriggerActive(false);

    const priorForApi = messages
      .filter((m) => !m.uiOnly)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    const removeEmptyAssistantBubble = () => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          next.pop();
        }
        return next;
      });
    };

    try {
      let effectiveLeadId = storedLeadId?.trim() ?? "";
      if (typeof window !== "undefined" && sessionId) {
        const fromStore =
          sessionStorage.getItem(chatLeadIdKey(agentId, sessionId))?.trim() ?? "";
        if (fromStore && fromStore !== effectiveLeadId) {
          effectiveLeadId = fromStore;
          setStoredLeadId(fromStore);
        }
      }

      const leadCapturedFromStorage =
        typeof window !== "undefined" &&
        Boolean(sessionId) &&
        sessionStorage.getItem(chatLeadStorageKey(agentId, sessionId)) === "1";
      const leadCapturedForApi =
        leadFullyCaptured || (leadCapturedFromStorage && Boolean(effectiveLeadId));

      console.log("[Alura chat client] Saving User Message... (server, before Gemini)", {
        sessionId,
        agentId,
      });
      console.log("[Alura Debug] Sending leadId:", effectiveLeadId || "(empty)");
      if (leadCapturedForApi && !effectiveLeadId) {
        console.warn(
          "[Alura Debug] Lead déjà capturé (flag/session) mais leadId vide — requête sans ticket",
        );
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          message: text,
          messages: priorForApi,
          sessionId,
          leadCapturedThisSession: leadCapturedForApi,
          userFirstName: visitorFirstName ?? "",
          leadId: effectiveLeadId,
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
        setInput(text);
        toast.error(errMsg);
        return;
      }

      console.log("[Alura chat client] Gemini Call... (streaming response)");

      const reader = res.body?.getReader();
      if (!reader) {
        setMessages((prev) => prev.slice(0, -2));
        setInput(text);
        toast.error("Réponse vide du serveur.");
        return;
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const displayText = stripLeadFormTrigger(accumulated);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: displayText };
          }
          return next;
        });
      }

      const hadTrigger = hasLeadFormTrigger(accumulated);
      console.log("[Alura chat client] Updating Lead... (handled on server if applicable)", {
        hadTrigger,
        leadFullyCaptured,
      });
      setLeadTriggerActive(hadTrigger && !leadFullyCaptured);
    } catch (e) {
      setMessages((prev) => prev.slice(0, -2));
      setInput(text);
      const msg = e instanceof Error ? e.message : "Échec de l’envoi.";
      toast.error(msg);
    } finally {
      setIsStreaming(false);
    }
  }, [
    agentId,
    input,
    isStreaming,
    messages,
    sessionId,
    leadFullyCaptured,
    visitorFirstName,
    storedLeadId,
  ]);

  const startNewSession = useCallback(() => {
    try {
      const sk = chatSessionStorageKey(agentId);
      const id = sessionStorage.getItem(sk);
      if (id) {
        sessionStorage.removeItem(chatLeadStorageKey(agentId, id));
        sessionStorage.removeItem(chatLeadContactKey(agentId, id));
        sessionStorage.removeItem(chatLeadIdKey(agentId, id));
      }
      sessionStorage.removeItem(sk);
      const newId = crypto.randomUUID();
      sessionStorage.setItem(sk, newId);
      setSessionId(newId);
      setStoredLeadId(null);
      setVisitorFirstName(null);
      setMessages([]);
      setLeadTriggerActive(false);
      setInput("");
    } catch {
      /* ignore */
    }
  }, [agentId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const canSend =
    input.trim().length > 0 && !isStreaming && Boolean(sessionId);

  return (
    <div className="flex min-h-[min(720px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-xl ring-1 ring-zinc-800/80">
      <header className="shrink-0 border-b border-zinc-800/90 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Conversation
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">
          {companyName}
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-zinc-500">
            Alura répond à partir de votre base de connaissance.
          </p>
          <button
            type="button"
            onClick={startNewSession}
            className="text-xs text-zinc-500 underline decoration-zinc-600 underline-offset-2 transition hover:text-zinc-400"
          >
            Nouvelle session
          </button>
        </div>
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
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const showTypingDot =
            m.role === "assistant" &&
            isStreaming &&
            isLast &&
            !m.content.trim();

          return (
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
                {showTypingDot ? (
                  <span className="text-zinc-400">…</span>
                ) : (
                  <ChatMarkdown content={m.content} role={m.role} />
                )}
              </div>
            </motion.div>
          );
        })}
        <AnimatePresence initial={false}>
          {leadTriggerActive && !leadFullyCaptured && !isStreaming ? (
            <motion.div
              key="lead-capture"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex justify-start"
            >
              <div className="w-full max-w-[85%]">
                <LeadForm
                  agentId={agentId}
                  lastQuestion={getBestComplaintFromHistory().lastQuestion}
                  previousQuestion={getBestComplaintFromHistory().previousQuestion}
                  onSubmitted={handleLeadSubmitted}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
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
