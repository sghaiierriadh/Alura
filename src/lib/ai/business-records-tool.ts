import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

export const SEARCH_RECORDS_TOOL_NAME = "search_records";

/**
 * Outil Gemini : recherche dans le catalogue `business_records` (FTS `search_vector`).
 */
export function getSearchRecordsFunctionDeclaration(): FunctionDeclaration {
  return {
    name: SEARCH_RECORDS_TOOL_NAME,
    description:
      "Recherche des informations ultra-précises dans le catalogue interne : prix, remises exactes, liste de partenaires ou caractéristiques techniques de produits.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "Requête courte (mots-clés, nom de produit, partenaire, montant ou référence à retrouver dans le catalogue).",
        },
      },
      required: ["query"],
    },
  };
}
