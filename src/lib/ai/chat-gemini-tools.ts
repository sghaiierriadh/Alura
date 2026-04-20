import type { FunctionDeclaration, Tool } from "@google/generative-ai";

import { getSearchRecordsFunctionDeclaration } from "@/lib/ai/business-records-tool";
import { getCallExpertApiFunctionDeclaration } from "@/lib/ai/client-api-tool";
import { getLiveSearchFunctionDeclaration } from "@/lib/ai/live-search-gemini-tool";

/**
 * Outils `/api/chat` : ordre aligné avec la hiérarchie des sources (`alura-chat-prompt.ts`).
 */
export function buildChatGeminiTools(options: {
  includeSearchRecords: boolean;
  includeExpertApi: boolean;
  includeLiveSearch: boolean;
}): { tools: Tool[] } | undefined {
  const decls: FunctionDeclaration[] = [];
  if (options.includeSearchRecords) {
    decls.push(getSearchRecordsFunctionDeclaration());
  }
  if (options.includeExpertApi) {
    decls.push(getCallExpertApiFunctionDeclaration());
  }
  if (options.includeLiveSearch) {
    decls.push(getLiveSearchFunctionDeclaration());
  }
  if (decls.length === 0) return undefined;
  return { tools: [{ functionDeclarations: decls }] };
}
