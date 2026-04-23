import { GoogleGenerativeAI } from "@google/generative-ai";

const KEYWORD_PARTNERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bdecathlon\b/i, label: "DECATHLON" },
  { pattern: /\bmyte[kc]\b/i, label: "MYTEK" },
  { pattern: /\bhobo\b/i, label: "HOBO" },
  { pattern: /\bpath[ée]\b/i, label: "PATHÉ" },
  { pattern: /\babra[ck]?adabra\b/i, label: "ABRACADABRA" },
  { pattern: /\babradabra\b/i, label: "ABRACADABRA" },
  { pattern: /\bfatales?\b/i, label: "FATALES" },
];

const CANONICAL_PARTNER_MAP: Record<string, string> = {
  decathlon: "DECATHLON",
  mytek: "MYTEK",
  mytec: "MYTEK",
  hobo: "HOBO",
  pathe: "PATHÉ",
  "pathé": "PATHÉ",
  abracadabra: "ABRACADABRA",
  abradabra: "ABRACADABRA",
  fatales: "FATALES",
  fatale: "FATALES",
};

function normalizeForMap(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePartner(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ").slice(0, 80);
  if (!compact || compact.toLowerCase() === "null" || compact.toLowerCase() === "unknown") {
    return null;
  }
  const normalizedKey = normalizeForMap(compact);
  if (CANONICAL_PARTNER_MAP[normalizedKey]) return CANONICAL_PARTNER_MAP[normalizedKey];
  return compact.toLocaleUpperCase("fr-FR");
}

export function detectPartnerFromKeywords(input: string | null | undefined): string | null {
  const text = (input ?? "").trim();
  if (!text) return null;
  for (const item of KEYWORD_PARTNERS) {
    if (item.pattern.test(text)) return item.label;
  }
  return null;
}

function extractJsonObject(text: string): { partner?: string | null } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const slice = fenced ? fenced[1] : trimmed;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(slice.slice(start, end + 1)) as { partner?: string | null };
}

/**
 * Extraction IA d'enseigne concernée par une réclamation.
 * Résilient: fallback déterministe via mots-clés si IA indisponible.
 */
export async function extractPartnerName(params: {
  complaintText: string | null;
  model?: string;
}): Promise<string | null> {
  const complaintText = (params.complaintText ?? "").trim();
  if (!complaintText) return null;

  const keywordHit = detectPartnerFromKeywords(complaintText);
  if (keywordHit) return keywordHit;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = (params.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();

  const instruction = `Tu es un expert du commerce en Tunisie.
Identifie toute enseigne, marque ou magasin cité (ex: Abracadabra, Mytek, Fatales, Decathlon, Pathé).
Même si le nom contient une faute de frappe (ex: Abradabra -> Abracadabra), tu dois le corriger.
Si un quartier est cité (ex: Menzah 8, Ennasr), ignore le lieu pour ne garder que la marque.

Trouve le nom de l'enseigne ou du partenaire concerné par la réclamation.
Réponds UNIQUEMENT en JSON strict:
{"partner":"Decathlon"}
ou
{"partner":null}

Règles:
- Retourne PARTNER en MAJUSCULES (ex: "ABRACADABRA"), jamais une adresse.
- Si aucune enseigne n'est identifiable avec confiance, retourne partner = null.
- Ne retourne jamais d'autre clé.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const m = genAI.getGenerativeModel({
      model: model.replace(/\.$/, ""),
      systemInstruction: instruction,
    });
    const result = await m.generateContent(`Texte réclamation:\n${complaintText}`);
    const parsed = extractJsonObject(result.response.text());
    return sanitizePartner(parsed.partner);
  } catch {
    return null;
  }
}
