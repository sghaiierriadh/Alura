"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SaveAgentApiExpertSuccess = { ok: true };
export type SaveAgentApiExpertFailure = { ok: false; error: string };
export type SaveAgentApiExpertResult = SaveAgentApiExpertSuccess | SaveAgentApiExpertFailure;

export type SaveAgentApiExpertInput = {
  /** URL complète (https…) du POST JSON `{ "query": "..." }`. Chaîne vide = effacer. */
  apiEndpoint: string;
  /**
   * Nouvelle clé API. Chaîne vide = ne pas modifier la clé existante.
   * Pour effacer la clé, utiliser `clearApiKey: true`.
   */
  apiKey: string;
  /** Si true, supprime la clé stockée (ignore `apiKey`). */
  clearApiKey?: boolean;
};

export async function saveAgentApiExpertSettings(
  input: SaveAgentApiExpertInput,
): Promise<SaveAgentApiExpertResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { ok: false, error: "Vous devez être connecté pour enregistrer ces paramètres." };
    }

    const endpointTrim = typeof input.apiEndpoint === "string" ? input.apiEndpoint.trim() : "";
    const apiEndpoint = endpointTrim.length > 0 ? endpointTrim : null;

    const update: {
      api_endpoint: string | null;
      api_key?: string | null;
    } = { api_endpoint: apiEndpoint };

    if (input.clearApiKey) {
      update.api_key = null;
    } else {
      const keyTrim = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      if (keyTrim.length > 0) {
        update.api_key = keyTrim;
      }
    }

    const { error } = await supabase
      .from("agents")
      .update(update)
      .eq("user_id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de l’enregistrement des paramètres API.";
    return { ok: false, error: message };
  }
}
