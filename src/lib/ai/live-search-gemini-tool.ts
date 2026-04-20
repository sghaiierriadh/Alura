import { SchemaType, type FunctionDeclaration, type Tool } from "@google/generative-ai";

export const LIVE_SEARCH_TOOL_NAME = "liveSearch";

export function getLiveSearchFunctionDeclaration(): FunctionDeclaration {
  return {
    name: LIVE_SEARCH_TOOL_NAME,
    description:
      "Recherche des informations spécifiques (partenaires, remises, articles) directement sur le site web du client quand l'information n'est pas présente dans la base de connaissances.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "Requête courte et précise (mots-clés, nom de partenaire, intitulé d’offre ou d’avantage, etc.).",
        },
      },
      required: ["query"],
    },
  };
}

/**
 * Outil Gemini seul (Serper). Pas de `toolConfig` : mode AUTO par défaut.
 */
export function buildLiveSearchGeminiTools(): {
  tools: Tool[];
} {
  return {
    tools: [{ functionDeclarations: [getLiveSearchFunctionDeclaration()] }],
  };
}
