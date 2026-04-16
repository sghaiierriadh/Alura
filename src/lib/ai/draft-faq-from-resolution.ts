import { GoogleGenerativeAI } from "@google/generative-ai";

export type KnowledgeDraft = { question: string; answer: string };

function extractJsonObject(text: string): { question?: string; answer?: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const slice = fenced ? fenced[1] : trimmed;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Pas de JSON");
  return JSON.parse(slice.slice(start, end + 1)) as { question?: string; answer?: string };
}

/**
 * Transforme réclamation + note de résolution en paire FAQ (question courte, réponse claire).
 */
export async function draftFaqFromResolution(params: {
  apiKey: string;
  complaintContent: string;
  resolutionNotes: string;
}): Promise<KnowledgeDraft | null> {
  const { apiKey, complaintContent, resolutionNotes } = params;
  const c = complaintContent.trim().slice(0, 6000);
  const n = resolutionNotes.trim().slice(0, 6000);
  if (!c || !n) return null;

  const system = `Tu aides à enrichir une FAQ entreprise à partir d'un ticket résolu.
Réponds UNIQUEMENT par un JSON valide (sans markdown), format exact :
{"question":"...","answer":"..."}

Contraintes :
- question : une phrase courte, claire, comme un utilisateur la poserait (pas de jargon interne « ticket »).
- answer : réponse polie, utile et autonome, en français, intégrant l'essentiel de la résolution (tu peux reformuler la note brute pour la clarté).
- Pas de préambule ni de clés supplémentaires.`;

  const user = `Réclamation initiale du client :
${c}

Note brute de résolution (interne) :
${n}`;

  try {
    const modelName =
      process.env.GEMINI_MODEL?.trim().replace(/\.$/, "") || "gemini-2.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: system,
    });
    const result = await model.generateContent(user);
    const text = result.response.text();
    const parsed = extractJsonObject(text);
    const q = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const a = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    if (q.length < 4 || a.length < 8) return null;
    return { question: q, answer: a };
  } catch (e) {
    console.warn("[draftFaqFromResolution]", e);
    return null;
  }
}
