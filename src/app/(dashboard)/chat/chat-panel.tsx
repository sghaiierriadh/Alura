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
function buildDynamicGreeting(
  companyName: string,
  chatbotName: string,
  welcomeMessage?: string | null,
): string {
  const custom = (welcomeMessage ?? "").trim();
  if (custom) return custom;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour >= 18 ? "Bonsoir" : "Salut";
  const partner = companyName.trim() || "votre partenaire";
  const bot = chatbotName.trim() || "Alura";
  return `${greeting}, je suis ${bot}, en charge de vos réclamations, problèmes ou demandes chez ${partner}. Comment puis-je vous aider ?`;
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
  userTextColor,
}: {
  content: string;
  role: "user" | "assistant";
  userTextColor?: string;
}) {
  return (
    <div
      className={
        role === "assistant"
          ? "prose prose-sm max-w-none prose-zinc dark:prose-invert [&_a]:break-words [&_a]:underline"
          : "prose prose-sm max-w-none prose-invert [&_a]:break-words [&_a]:underline"
      }
      style={role === "user" ? { color: userTextColor } : undefined}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span>Alura est en train d&apos;écrire</span>
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
      </span>
    </div>
  );
}

type Props = {
  agentId: string;
  companyName: string;
  chatbotName?: string;
  themeColor?: string;
  textColor?: string;
  welcomeMessage?: string | null;
  avatarUrl?: string | null;
  /** Widget / iframe : hauteur contrainte, scroll interne, pas de min-height dashboard. */
  layout?: "default" | "embedded";
};

function getSafeThemeColor(color?: string): string {
  const value = (color ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#18181b";
}

export function ChatPanel({
  agentId,
  companyName,
  chatbotName = "Alura",
  themeColor,
  textColor,
  welcomeMessage,
  avatarUrl,
  layout = "default",
}: Props) {
  const [messages, setMessages] = useState<Array<ChatMessage & { uiOnly?: boolean }>>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  /** Identifiant lead Supabase — seule preuve fiable d’une capture réussie. */
  const [storedLeadId, setStoredLeadId] = useState<string | null>(null);
  const [leadTriggerActive, setLeadTriggerActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visitorFirstName, setVisitorFirstName] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const primaryColor = getSafeThemeColor(themeColor);
  const bubbleTextColor = getSafeThemeColor(textColor ?? "#FFFFFF");

  const leadFullyCaptured = Boolean(storedLeadId?.trim());

  useEffect(() => {
    if (messages.length > 0) return;
    console.log("[Alura chat client] Greeting...");
    setMessages([
      {
        role: "assistant",
        content: buildDynamicGreeting(companyName, chatbotName, welcomeMessage),
        uiOnly: true,
      },
    ]);
  }, [chatbotName, companyName, messages.length, welcomeMessage]);

  useEffect(() => {
    try {
      const sk = chatSessionStorageKey(agentId);
      let id = localStorage.getItem(sk);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(sk, id);
        console.log("[chat] session_id generated:", id);
      } else {
        console.log("[chat] session_id reused:", id);
      }
      setSessionId(id);
      const leadFlag = localStorage.getItem(chatLeadStorageKey(agentId, id)) === "1";
      const leadIdRaw = localStorage.getItem(chatLeadIdKey(agentId, id))?.trim() ?? "";
      if (leadFlag && !leadIdRaw) {
        localStorage.removeItem(chatLeadStorageKey(agentId, id));
      }
      setStoredLeadId(leadIdRaw || null);
      const contactRaw = localStorage.getItem(chatLeadContactKey(agentId, id));
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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const behavior = isStreaming ? "auto" : "smooth";
    scrollToBottom(behavior);
  }, [messages, isStreaming, leadTriggerActive, scrollToBottom]);

  useEffect(() => {
    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToBottom("auto"));
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scrollToBottom]);

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
          ? localStorage.getItem(chatSessionStorageKey(agentId))
          : null);

      if (resolvedSessionId) {
        try {
          localStorage.setItem(chatLeadStorageKey(agentId, resolvedSessionId), "1");
          localStorage.setItem(
            chatLeadContactKey(agentId, resolvedSessionId),
            JSON.stringify({
              email: payload.email,
              phone: payload.phone,
              fullName: payload.fullName,
            }),
          );
          localStorage.setItem(chatLeadIdKey(agentId, resolvedSessionId), lid);
          console.log("[Alura Debug] Persisting leadId (state + localStorage)", {
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
          "[Alura Debug] captureLead OK mais sessionId introuvable — leadId non écrit en localStorage",
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
          localStorage.getItem(chatLeadIdKey(agentId, sessionId))?.trim() ?? "";
        if (fromStore && fromStore !== effectiveLeadId) {
          effectiveLeadId = fromStore;
          setStoredLeadId(fromStore);
        }
      }

      const leadCapturedFromStorage =
        typeof window !== "undefined" &&
        Boolean(sessionId) &&
        localStorage.getItem(chatLeadStorageKey(agentId, sessionId)) === "1";
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
      const id = localStorage.getItem(sk);
      if (id) {
        localStorage.removeItem(chatLeadStorageKey(agentId, id));
        localStorage.removeItem(chatLeadContactKey(agentId, id));
        localStorage.removeItem(chatLeadIdKey(agentId, id));
      }
      localStorage.removeItem(sk);
      const newId = crypto.randomUUID();
      localStorage.setItem(sk, newId);
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

  const isEmbedded = layout === "embedded";

  return (
    <div
      className={
        isEmbedded
          ? "flex h-full min-h-0 w-full max-h-full flex-1 flex-col overflow-hidden bg-zinc-950"
          : "flex min-h-[min(720px,calc(100vh-8rem))] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-xl ring-1 ring-zinc-800/80"
      }
    >
      <header
        className={
          isEmbedded
            ? "shrink-0 border-b border-zinc-800/90 px-3 py-3"
            : "shrink-0 border-b border-zinc-800/90 px-5 py-4"
        }
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Conversation
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">
          {chatbotName}
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`${chatbotName} avatar`}
              className="h-10 w-10 rounded-full border border-zinc-700 object-cover object-center"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300">
              {chatbotName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <p className="text-sm text-zinc-500">
            {companyName} - assistant alimente par votre base de connaissance.
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
        className={
          isEmbedded
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3"
            : "min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
        }
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
          const showReadReceipt = m.role === "user" && !isStreaming && isLast;

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
                    ? "max-w-[86%] rounded-3xl rounded-br-lg px-4 py-2.5 text-sm leading-relaxed text-white shadow-md"
                    : "max-w-[86%] rounded-3xl rounded-bl-lg border border-zinc-800/90 bg-zinc-900/60 px-4 py-2.5 text-sm leading-relaxed text-zinc-100 shadow-md"
                }
                style={
                  m.role === "user"
                    ? { backgroundColor: primaryColor, color: bubbleTextColor }
                    : undefined
                }
              >
                <span
                  className={`mb-1 block text-[10px] uppercase tracking-wide ${
                    m.role === "user"
                      ? "font-medium"
                      : "font-medium text-zinc-400"
                  }`}
                  style={m.role === "user" ? { color: bubbleTextColor } : undefined}
                >
                  {m.role === "user" ? "Vous" : "Alura"}
                </span>
                {showTypingDot ? (
                  <TypingIndicator />
                ) : (
                  <ChatMarkdown
                    content={m.content}
                    role={m.role}
                    userTextColor={bubbleTextColor}
                  />
                )}
                {showReadReceipt ? (
                  <span
                    className="mt-1 block text-[10px]"
                    style={{ color: bubbleTextColor }}
                  >
                    Lu
                  </span>
                ) : null}
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
                  sessionId={sessionId}
                  source={isEmbedded ? "widget" : "dashboard"}
                  lastQuestion={getBestComplaintFromHistory().lastQuestion}
                  previousQuestion={getBestComplaintFromHistory().previousQuestion}
                  onSubmitted={handleLeadSubmitted}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        className={
          isEmbedded
            ? "shrink-0 border-t border-zinc-800/90 bg-zinc-950 p-3"
            : "shrink-0 border-t border-zinc-800/90 p-4 sm:p-5"
        }
      >
        <div className="flex items-end gap-2 rounded-xl bg-zinc-900/80 p-2 ring-1 ring-zinc-800/80 focus-within:ring-zinc-600/50">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Votre message…"
            disabled={isStreaming}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!canSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-35"
            style={{ backgroundColor: primaryColor }}
            aria-label="Envoyer"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
