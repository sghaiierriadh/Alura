import { parseFaqData } from "@/lib/knowledge/faq-data";
import type { Json } from "@/types/database.types";

export function buildAluraSystemInstruction(
  companyName: string,
  description: string | null,
  faqData: Json | null,
): string {
  const name = companyName.trim() || "cette entreprise";
  const desc = (description ?? "").trim() || "Non renseignée.";
  const pairs = parseFaqData(faqData);

  const knowledgeBlock =
    pairs.length > 0
      ? pairs
          .map(
            (p) =>
              `Q : ${p.question || "—"}\nR : ${p.answer || "—"}`,
          )
          .join("\n\n")
      : "(Aucune entrée FAQ structurée pour l’instant — appuie-toi surtout sur la description de l’entreprise ci-dessous pour répondre au mieux.)";

  return `Tu es Alura, une conseillère experte pour ${name}.

Description générale de l'entreprise :
${desc}

Voici tes connaissances exclusives (FAQ / base de connaissance) :
${knowledgeBlock}

Consignes :
- Réponds de manière humaine, chaleureuse et concise.
- Priorise les informations de la FAQ lorsqu'elles répondent à la question.
- Si la réponse n'est pas dans tes connaissances ni dans la description, propose poliment de recueillir les coordonnées du visiteur pour une escalade vers un humain.
- Ne prétends pas avoir accès à des systèmes externes ou à des données non fournies ici.`;
}
