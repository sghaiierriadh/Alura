import { updateLeadComplaint } from "@/app/actions/capture-lead";
import { saveMessage } from "@/app/actions/save-message";
import { fetchAgentByIdForChat } from "@/lib/agents/fetch-agent-chat";
import { buildAluraSystemInstruction } from "@/lib/ai/alura-chat-prompt";
import {
  hasLeadFormTrigger,
  stripLeadFormTrigger,
} from "@/lib/ai/lead-form-trigger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content } from "@google/generative-ai";

/** Escalade lead : le modèle ajoute en fin de réponse le marqueur `LEAD_FORM_TRIGGER` (voir `src/lib/ai/lead-form-trigger.ts`). Le client le détecte sur le flux brut puis masque ce marqueur à l’affichage. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-1.5-flash";

type ChatMessage = { role: "user" | "assistant"; content: string };

function toGeminiHistory(messages: ChatMessage[] | undefined): Content[] {
  if (!messages?.length) return [];
  const out: Content[] = [];
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (!text) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
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
    },
  );

  const history = toGeminiHistory(body.messages);

  const primaryModel =
    process.env.GEMINI_MODEL?.trim().replace(/\.$/, "") || DEFAULT_MODEL;

  const genAI = new GoogleGenerativeAI(apiKey);

  async function streamWithModel(modelName: string) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });
    const chat = model.startChat({ history });
    return chat.sendMessageStream(message);
  }

  let streamResult: Awaited<ReturnType<typeof streamWithModel>>;
  try {
    console.log("[api/chat] Gemini Call...", { model: primaryModel });
    streamResult = await streamGeminiOnceWith503Retry(() =>
      streamWithModel(primaryModel),
    );
    console.log("[api/chat] Gemini Call... stream obtained");
  } catch (firstErr) {
    if (
      primaryModel === DEFAULT_MODEL &&
      isLikelyModelNotFoundError(firstErr)
    ) {
      try {
        console.log("[api/chat] Gemini Call... (fallback)", {
          model: FALLBACK_MODEL,
        });
        streamResult = await streamGeminiOnceWith503Retry(() =>
          streamWithModel(FALLBACK_MODEL),
        );
        console.log("[api/chat] Gemini Call... stream obtained (fallback)");
      } catch (fallbackErr) {
        if (isServiceUnavailableError(fallbackErr)) {
          return Response.json(
            { error: SERVICE_UNAVAILABLE_MESSAGE },
            { status: 503 },
          );
        }
        const msg =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : "Erreur modèle IA.";
        return Response.json({ error: msg }, { status: 502 });
      }
    } else if (isServiceUnavailableError(firstErr)) {
      return Response.json(
        { error: SERVICE_UNAVAILABLE_MESSAGE },
        { status: 503 },
      );
    } else {
      const msg =
        firstErr instanceof Error ? firstErr.message : "Erreur modèle IA.";
      return Response.json({ error: msg }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = "";
      try {
        for await (const chunk of streamResult.stream) {
          const text =
            typeof (chunk as { text?: () => string }).text === "function"
              ? (chunk as { text: () => string }).text()
              : "";
          if (text) {
            accumulated += text;
            controller.enqueue(encoder.encode(text));
          }
        }

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

        if (
          leadCapturedThisSession &&
          leadIdForComplaint.length > 0 &&
          hasLeadFormTrigger(accumulated)
        ) {
          console.log("[api/chat] Updating Lead...", {
            agentId,
            leadId: leadIdForComplaint,
            lastQuestionPreview: message.slice(0, 120),
          });
          const upd = await updateLeadComplaint({
            agentId,
            leadId: leadIdForComplaint,
            lastQuestion: message,
          });
          if (upd.ok) {
            console.log("[api/chat] Updating Lead... success", {
              leadId: leadIdForComplaint,
            });
          } else {
            console.error("[api/chat] Updating Lead... error", upd.error);
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
