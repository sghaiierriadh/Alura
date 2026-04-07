import type { Json } from "@/types/database.types";

export type FaqPair = {
  question: string;
  answer: string;
};

/**
 * Normalise le JSONB faq_data : tableau de { question, answer },
 * ou ancien format onboarding (tableau de strings → réponses sans question explicite).
 */
export function parseFaqData(raw: Json | null | undefined): FaqPair[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return [];

  const out: FaqPair[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item === "string") {
      const t = item.trim();
      if (t)
        out.push({
          question: `Point ${i + 1}`,
          answer: t,
        });
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const q =
        typeof o.question === "string" ? o.question.trim() : "";
      const a = typeof o.answer === "string" ? o.answer.trim() : "";
      if (q || a) out.push({ question: q, answer: a });
    }
  }
  return out;
}

/** Tableau propre pour Supabase JSONB (toujours des objets homogènes). */
export function toFaqJsonb(pairs: FaqPair[]): Json {
  return pairs.map(({ question, answer }) => ({
    question: question.trim(),
    answer: answer.trim(),
  }));
}
