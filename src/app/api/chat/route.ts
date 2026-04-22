import { addLeadComplaint } from "@/app/actions/capture-lead";
import { saveLearningSuggestion } from "@/app/actions/save-learning-suggestion";
import { liveSearch } from "@/app/actions/live-search";
import { callClientApi } from "@/app/actions/call-client-api";
import { searchRecords } from "@/app/actions/search-records";
import { buildComplaintTextForTicket } from "@/lib/ai/complaint-text";
import { saveMessage } from "@/app/actions/save-message";
import { fetchAgentByIdForChat } from "@/lib/agents/fetch-agent-chat";
import { buildAluraSystemInstruction } from "@/lib/ai/alura-chat-prompt";
import { fetchKnowledgeMatchesForChat } from "@/lib/knowledge/fetch-matches-for-chat";
import { classifyComplaintPriority } from "@/lib/ai/complaint-priority";
import {
  hasLeadFormTrigger,
  stripLeadFormTrigger,
} from "@/lib/ai/lead-form-trigger";
import { buildChatGeminiTools } from "@/lib/ai/chat-gemini-tools";
import { LIVE_SEARCH_TOOL_NAME } from "@/lib/ai/live-search-gemini-tool";
import { SEARCH_RECORDS_TOOL_NAME } from "@/lib/ai/business-records-tool";
import { CALL_EXPERT_API_TOOL_NAME } from "@/lib/ai/client-api-tool";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content, Part } from "@google/generative-ai";

/** Escalade lead : le modèle ajoute en fin de réponse le marqueur `LEAD_FORM_TRIGGER` (voir `src/lib/ai/lead-form-trigger.ts`). Le client le détecte sur le flux brut puis masque ce marqueur à l’affichage. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-1.5-flash";

type ChatMessage = { role: "user" | "assistant"; content: string };

function isWeakQuestion(text: string | null): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (cleaned.length < 12) return true;
  const tokens = cleaned.split(/\s+/);
  if (tokens.length <= 2) return true;
  return !/[?]/.test(cleaned) && cleaned.length < 20;
}

function recentUserMessageLines(
  history: ChatMessage[] | undefined,
  current: string,
): string[] {
  const users = (history ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const cur = current.trim();
  if (cur.length > 0 && users[users.length - 1] !== cur) users.push(cur);
  return users;
}

function deriveComplaintQuestion(
  history: ChatMessage[] | undefined,
  current: string,
): { lastQuestion: string | null; previousQuestion: string | null } {
  const users = (history ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const all = [...users, current.trim()].filter(Boolean);
  const last = all.length > 0 ? all[all.length - 1] : null;
  const previous = all.length > 1 ? all[all.length - 2] : null;
  if (!isWeakQuestion(last)) return { lastQuestion: last, previousQuestion: previous };
  for (let i = all.length - 2; i >= 0; i -= 1) {
    if (!isWeakQuestion(all[i])) {
      return { lastQuestion: all[i], previousQuestion: previous };
    }
  }
  return { lastQuestion: last, previousQuestion: previous };
}

function toGeminiHistory(messages: ChatMessage[] | undefined): Content[] {
  if (!messages?.length) return [];
  const out: Content[] = [];
  let hasSeenUser = false;
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (!text) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (!hasSeenUser && m.role === "assistant") continue;
    if (m.role === "user") hasSeenUser = true;
    out.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  return out;
}

function isLikelyModelNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  return (
    msg.includes("404") ||
    lower.includes("not found") ||
    lower.includes("unknown model")
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isServiceUnavailableError(e: unknown): boolean {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: number }).status;
    if (s === 503 || s === 429) return true;
  }
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("try again later") ||
    msg.includes("temporarily")
  );
}

async function streamGeminiOnceWith503Retry<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isServiceUnavailableError(e)) {
      throw e;
    }
    await delay(2000);
    return await run();
  }
}

const SERVICE_UNAVAILABLE_MESSAGE =
  "Le service est momentanément indisponible. Merci de réessayer dans un instant.";

export async function POST(req: Request) {
  let body: {
    agentId?: string;
    message?: string;
    messages?: ChatMessage[];
    sessionId?: string;
    leadCapturedThisSession?: boolean;
    userFirstName?: string | null;
    leadId?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!agentId) {
    return Response.json({ error: "agentId requis." }, { status: 400 });
  }
  if (!message) {
    return Response.json({ error: "message requis." }, { status: 400 });
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return Response.json({ error: "sessionId requis." }, { status: 400 });
  }

  const leadCapturedThisSession = Boolean(body.leadCapturedThisSession);
  const userFirstName =
    typeof body.userFirstName === "string" ? body.userFirstName.trim() : "";
  const leadIdForComplaint =
    typeof body.leadId === "string" ? body.leadId.trim() : "";

  const agent = await fetchAgentByIdForChat(agentId);
  if (!agent) {
    return Response.json(
      {
        error:
          "Agent introuvable ou accès refusé. Vérifiez l’identifiant et votre session.",
      },
      { status: 404 },
    );
  }

  console.log("[api/chat] Saving User Message...", {
    sessionId,
    agentId,
    messagePreview: message.slice(0, 80),
  });
  const userSave = await saveMessage({
    sessionId,
    agentId,
    role: "user",
    content: message,
  });
  if (!userSave.ok) {
    console.error("[api/chat] Saving User Message... error", userSave.error);
    return Response.json({ error: userSave.error }, { status: 500 });
  }
  console.log("[api/chat] Saving User Message... success");

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Configuration serveur : GEMINI_API_KEY manquante." },
      { status: 500 },
    );
  }

  const companyName = agent.company_name ?? "—";
  const retrievedKnowledgeFaq = await fetchKnowledgeMatchesForChat(agentId, message);
  const websiteBaseForLive = (agent.website_url ?? "").trim();
  const liveSearchEnabledForAgent =
    Boolean(process.env.SERPER_API_KEY?.trim()) && websiteBaseForLive.length > 0;
  const expertApiEnabledForAgent = Boolean((agent.api_endpoint ?? "").trim());

  const systemInstruction = buildAluraSystemInstruction(
    companyName,
    agent.description,
    agent.faq_data,
    {
      leadAlreadyCapturedThisSession: leadCapturedThisSession,
      userFirstName:
        leadCapturedThisSession && userFirstName.length > 0
          ? userFirstName
          : null,
      retrievedKnowledgeFaq,
      catalogSearchEnabled: true,
      expertApiEnabled: expertApiEnabledForAgent,
      liveSearchEnabled: liveSearchEnabledForAgent,
    },
  );

  const history = toGeminiHistory(body.messages);

  const primaryModel =
    process.env.GEMINI_MODEL?.trim().replace(/\.$/, "") || DEFAULT_MODEL;
  let modelUsedForChat = primaryModel;

  const genAI = new GoogleGenerativeAI(apiKey);

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";
      let liveSearchSucceededThisTurn = false;
      const sendText = (t: string) => {
        if (!t) return;
        accumulated += t;
        controller.enqueue(encoder.encode(t));
      };

      async function runGeminiForModel(modelName: string): Promise<void> {
        const toolPack = buildChatGeminiTools({
          includeSearchRecords: true,
          includeExpertApi: expertApiEnabledForAgent,
          includeLiveSearch: liveSearchEnabledForAgent,
        });
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
          ...(toolPack ? { tools: toolPack.tools } : {}),
        });
        const chat = model.startChat({ history });

        const streamOneRound = async (
          payload: string | Part[],
          forwardToClient: boolean,
        ) => {
          const sr = await streamGeminiOnceWith503Retry(() =>
            chat.sendMessageStream(payload),
          );
          for await (const chunk of sr.stream) {
            const text =
              typeof (chunk as { text?: () => string }).text === "function"
                ? (chunk as { text: () => string }).text()
                : "";
            if (text && forwardToClient) sendText(text);
          }
          return sr.response;
        };

        const MAX_TOOL_ROUNDS = 6;
        let toolSteps = 0;
        let resp = await streamOneRound(message, true);
        let calls = resp.functionCalls();
        while (calls && calls.length > 0 && toolSteps < MAX_TOOL_ROUNDS) {
          toolSteps += 1;
          const functionParts: Part[] = [];
          for (const call of calls) {
            if (call.name === SEARCH_RECORDS_TOOL_NAME) {
              const args = call.args as Record<string, unknown>;
              const q =
                typeof args.query === "string"
                  ? args.query
                  : typeof args.q === "string"
                    ? args.q
                    : "";
              const sr = await searchRecords(agentId, q);
              functionParts.push({
                functionResponse: {
                  name: call.name,
                  response: sr.success
                    ? { records: sr.records }
                    : { records: [], error: sr.error },
                },
              });
            } else if (call.name === CALL_EXPERT_API_TOOL_NAME) {
              const args = call.args as Record<string, unknown>;
              const q =
                typeof args.query === "string"
                  ? args.query
                  : typeof args.q === "string"
                    ? args.q
                    : "";
              const apiRes = await callClientApi(agentId, q);
              functionParts.push({
                functionResponse: {
                  name: call.name,
                  response: apiRes.success
                    ? { data: apiRes.data }
                    : { data: null, error: apiRes.error },
                },
              });
            } else if (call.name === LIVE_SEARCH_TOOL_NAME) {
              const args = call.args as Record<string, unknown>;
              const q =
                typeof args.query === "string"
                  ? args.query
                  : typeof args.q === "string"
                    ? args.q
                    : "";
              const lr = await liveSearch(q, websiteBaseForLive);
              const hasUsableSnippet =
                lr.ok && lr.snippets.length > 0;
              if (hasUsableSnippet) {
                liveSearchSucceededThisTurn = true;
              }
              console.log(
                ">>> [LEARNING] liveSearch tool round",
                JSON.stringify({
                  ok: lr.ok,
                  snippetCount: lr.ok ? lr.snippets.length : 0,
                  hasUsableSnippet,
                  liveSearchSucceededThisTurn,
                }),
              );
              functionParts.push({
                functionResponse: {
                  name: call.name,
                  response: lr.ok
                    ? { snippets: lr.snippets }
                    : { snippets: [], error: lr.error },
                },
              });
            } else {
              functionParts.push({
                functionResponse: {
                  name: call.name,
                  response: { error: "Outil non pris en charge." },
                },
              });
            }
          }
          resp = await streamOneRound(functionParts, true);
          calls = resp.functionCalls();
        }
      }

      try {
        console.log("[api/chat] Gemini Call...", { model: primaryModel });
        modelUsedForChat = primaryModel;
        try {
          await runGeminiForModel(primaryModel);
        } catch (firstErr) {
          if (
            primaryModel === DEFAULT_MODEL &&
            isLikelyModelNotFoundError(firstErr)
          ) {
            console.log("[api/chat] Gemini Call... (fallback)", {
              model: FALLBACK_MODEL,
            });
            modelUsedForChat = FALLBACK_MODEL;
            try {
              await runGeminiForModel(FALLBACK_MODEL);
            } catch (fallbackErr) {
              if (isServiceUnavailableError(fallbackErr)) {
                sendText(SERVICE_UNAVAILABLE_MESSAGE);
              } else {
                throw fallbackErr;
              }
            }
          } else if (isServiceUnavailableError(firstErr)) {
            sendText(SERVICE_UNAVAILABLE_MESSAGE);
          } else {
            throw firstErr;
          }
        }
        console.log("[api/chat] Gemini stream done");

        const assistantPlain = stripLeadFormTrigger(accumulated).trim();
        if (assistantPlain.length > 0) {
          const assistantSave = await saveMessage({
            sessionId,
            agentId,
            role: "assistant",
            content: assistantPlain,
          });
          if (!assistantSave.ok) {
            console.error("[api/chat] save assistant message:", assistantSave.error);
          }
        }

        let forcedLiveSearchHit = false;
        const keywordLearningBoost =
          /\b(partenaire|avantage)\b/i.test(message) &&
          liveSearchEnabledForAgent;
        if (keywordLearningBoost && !liveSearchSucceededThisTurn) {
          const lrForce = await liveSearch(
            message.trim().slice(0, 500),
            websiteBaseForLive,
          );
          forcedLiveSearchHit = lrForce.ok && lrForce.snippets.length > 0;
          console.log(
            ">>> [LEARNING] forçage liveSearch (mots-clés partenaire|avantage)",
            JSON.stringify({
              ok: lrForce.ok,
              snippetCount: lrForce.ok ? lrForce.snippets.length : 0,
              forcedLiveSearchHit,
            }),
          );
        }

        const learningSearchSucceeded =
          liveSearchSucceededThisTurn || forcedLiveSearchHit;

        console.log(
          ">>> [LEARNING] Fin de tour — état avant sauvegarde suggestion",
          JSON.stringify({
            liveSearchSucceededThisTurn,
            forcedLiveSearchHit,
            learningSearchSucceeded,
            assistantPlainLen: assistantPlain.length,
            messageLen: message.trim().length,
            agentId,
          }),
        );

        if (
          learningSearchSucceeded &&
          assistantPlain.length > 0 &&
          message.trim().length > 0
        ) {
          console.log(
            ">>> [LEARNING] Tentative de sauvegarde synchrone (await saveLearningSuggestion)...",
          );
          try {
            const learnRes = await saveLearningSuggestion({
              agentId,
              userQuestion: message,
              suggestedAnswer: assistantPlain,
              source: "live_search",
            });
            console.log(
              ">>> [LEARNING] Résultat saveLearningSuggestion",
              JSON.stringify(learnRes),
            );
            if (!learnRes.ok) {
              console.error(">>> [LEARNING] Échec:", learnRes.error);
            } else {
              console.log(">>> [LEARNING] Insertion OK (pending).");
            }
          } catch (learnErr) {
            console.error(">>> [LEARNING] Exception saveLearningSuggestion:", learnErr);
          }
        } else {
          console.log(
            ">>> [LEARNING] Sauvegarde ignorée (condition non remplie).",
            JSON.stringify({
              learningSearchSucceeded,
              hasAssistant: assistantPlain.length > 0,
              hasMessage: message.trim().length > 0,
            }),
          );
        }

        if (leadIdForComplaint.length > 0) {
          const complaint = deriveComplaintQuestion(body.messages, message);
          const ticketBody = buildComplaintTextForTicket(
            complaint.lastQuestion,
            complaint.previousQuestion,
          );
          let priorityForComplaint: string | undefined;
          if (ticketBody && apiKey) {
            try {
              priorityForComplaint = await classifyComplaintPriority({
                apiKey,
                model: modelUsedForChat,
                recentUserMessages: recentUserMessageLines(body.messages, message),
                complaintText: ticketBody,
              });
            } catch (e) {
              console.warn("[api/chat] classifyComplaintPriority:", e);
            }
          }
          console.log("[api/chat] addLeadComplaint (await) — déclenché car leadId présent", {
            agentId,
            leadId: leadIdForComplaint,
            sessionId,
            leadCapturedThisSession,
            hadTrigger: hasLeadFormTrigger(accumulated),
            lastQuestionPreview: (complaint.lastQuestion ?? "").slice(0, 120),
            priorityPreview: priorityForComplaint ?? "(défaut)",
          });
          const upd = await addLeadComplaint({
            agentId,
            leadId: leadIdForComplaint,
            lastQuestion: complaint.lastQuestion,
            previousQuestion: complaint.previousQuestion,
            priority: priorityForComplaint,
          });
          if (!upd.ok) {
            console.error(
              "[api/chat] addLeadComplaint Supabase / RLS — erreur:",
              upd.error,
            );
          } else if (!upd.skipped && upd.complaintText) {
            console.log(
              `TICKET ${upd.action === "updated" ? "UPDATED" : "CREATED"} FOR LEAD ${leadIdForComplaint}: ${upd.complaintText}`,
            );
          } else if (upd.skipped) {
            console.log(
              "[api/chat] addLeadComplaint skipped (pas d'intention / message trop court)",
            );
          }
        }

        controller.close();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
