import { GoogleGenerativeAI } from "@google/generative-ai";

/** Valeurs autorisées en base (`lead_complaints.priority`). */
export type ComplaintPriorityDb = "low" | "normal" | "high";

const ALLOWED = new Set(["low", "normal", "high", "medium"]);

export function toDbComplaintPriority(raw: string | null | undefined): ComplaintPriorityDb {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "high") return "high";
  if (v === "low") return "low";
  if (v === "medium") return "normal";
  if (v === "normal") return "normal";
  return "normal";
}

function extractJsonObject(text: string): { priority?: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const slice = fenced ? fenced[1] : trimmed;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Pas de JSON");
  return JSON.parse(slice.slice(start, end + 1)) as { priority?: string };
}

/**
 * Appel court au modèle : priorité ticket à partir du contexte utilisateur (frustration, urgence, type de problème).
 */
export async function classifyComplaintPriority(params: {
  apiKey: string;
  model: string;
  recentUserMessages: string[];
  complaintText: string;
}): Promise<ComplaintPriorityDb> {
  const { apiKey, model, recentUserMessages, complaintText } = params;
  const recent = recentUserMessages
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(-8)
    .join("\n---\n");

  const instruction = `Tu es un classificateur de priorité pour tickets support B2B.
Réponds UNIQUEMENT par un objet JSON, sans markdown ni texte autour, au format exact :
{"priority":"low"} ou {"priority":"normal"} ou {"priority":"high"}
(Niveau intermédiaire = clé JSON "normal", équivalent métier « moyenne ».)

Règles :
- high : forte frustration (ton agressif, majuscules répétées, menace d'annulation/churn), urgence temporelle explicite (ex. maintenant, tout de suite, immédiat, urgent, aujourd'hui, bloqué, production à l'arrêt, plus rien ne marche), ou sujet sensible : argent (paiement, facture, remboursement, prélèvement), accès bloqué (compte, connexion, sécurité, données perdues).
- low : simple curiosité, question générale sans impact urgent, politesse sans problème concret.
- normal : tout le reste (problème réel mais sans signal fort de high, ni trivial comme low).

Sois conservateur sur high : réserve-le aux cas clairement urgents ou à fort enjeu.`;

  const userBlock = `Messages utilisateur récents (du plus ancien au plus récent, séparés par ---) :
${recent || "(aucun)"}

Texte principal retenu pour le ticket :
${complaintText.trim() || "(vide)"}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const m = genAI.getGenerativeModel({
      model: model.replace(/\.$/, ""),
      systemInstruction: instruction,
    });
    const result = await m.generateContent(userBlock);
    const text = result.response.text();
    const parsed = extractJsonObject(text);
    const p = typeof parsed.priority === "string" ? parsed.priority.trim().toLowerCase() : "";
    if (!ALLOWED.has(p)) return "normal";
    return toDbComplaintPriority(p);
  } catch {
    return "normal";
  }
}
