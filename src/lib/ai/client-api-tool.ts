import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

export const CALL_EXPERT_API_TOOL_NAME = "call_expert_api";

export function getCallExpertApiFunctionDeclaration(): FunctionDeclaration {
  return {
    name: CALL_EXPERT_API_TOOL_NAME,
    description:
      "Interroge le système d'information en temps réel du client pour des données critiques (stocks, prix dynamiques, état d'une commande).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "Question ou requête structurée à transmettre au système client (référence commande, SKU, etc.).",
        },
      },
      required: ["query"],
    },
  };
}
