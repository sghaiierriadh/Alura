import { fetchAgentByIdForChat } from "@/lib/agents/fetch-agent-chat";
import { buildAluraSystemInstruction } from "@/lib/ai/alura-chat-prompt";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Content } from "@google/generative-ai";

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

export async function POST(req: Request) {
  let body: {
    agentId?: string;
    message?: string;
    messages?: ChatMessage[];
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
    streamResult = await streamWithModel(primaryModel);
  } catch (firstErr) {
    if (
      primaryModel === DEFAULT_MODEL &&
      isLikelyModelNotFoundError(firstErr)
    ) {
      streamResult = await streamWithModel(FALLBACK_MODEL);
    } else {
      const msg =
        firstErr instanceof Error ? firstErr.message : "Erreur modèle IA.";
      return Response.json({ error: msg }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamResult.stream) {
          const text =
            typeof (chunk as { text?: () => string }).text === "function"
              ? (chunk as { text: () => string }).text()
              : "";
          if (text) controller.enqueue(encoder.encode(text));
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
