"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database.types";

export type CallClientApiSuccess = { success: true; data: Json };
export type CallClientApiFailure = { success: false; error: string };
export type CallClientApiResult = CallClientApiSuccess | CallClientApiFailure;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const POST_TIMEOUT_MS = 20_000;

function isAllowedHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * POST JSON `{ "query": string }` vers `agents.api_endpoint`, en-tête `X-Api-Key` si `api_key` est défini.
 * Accès : propriétaire JWT ou agent connu (widget, service role), comme pour le chat.
 */
export async function callClientApi(
  agentId: string,
  query: string,
): Promise<CallClientApiResult> {
  try {
    const aid = typeof agentId === "string" ? agentId.trim() : "";
    if (!UUID_RE.test(aid)) {
      return { success: false, error: "Identifiant d’agent invalide." };
    }

    const q = typeof query === "string" ? query.trim() : "";
    if (!q) {
      return { success: false, error: "Requête vide." };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return { success: false, error: `Session invalide : ${authError.message}` };
    }

    if (user) {
      const { data: agent, error: agentError } = await supabase
        .from("agents")
        .select("id, api_endpoint, api_key")
        .eq("id", aid)
        .eq("user_id", user.id)
        .maybeSingle();

      if (agentError) {
        return {
          success: false,
          error: `Impossible de charger l’agent : ${agentError.message}`,
        };
      }
      if (!agent) {
        return { success: false, error: "Agent introuvable ou accès refusé." };
      }

      const endpoint = (agent.api_endpoint ?? "").trim();
      if (!endpoint) {
        return { success: false, error: "Aucun endpoint API configuré pour cet agent." };
      }
      if (!isAllowedHttpUrl(endpoint)) {
        return {
          success: false,
          error: "L’endpoint API doit être une URL http ou https valide.",
        };
      }

      return await executeClientPost(endpoint, (agent.api_key ?? "").trim(), q);
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceKey) {
      return {
        success: false,
        error: "Accès refusé : session requise pour cette opération.",
      };
    }

    const admin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    const { data: agent, error: agentError } = await admin
      .from("agents")
      .select("id, api_endpoint, api_key")
      .eq("id", aid)
      .maybeSingle();

    if (agentError || !agent) {
      return { success: false, error: "Agent introuvable ou accès refusé." };
    }

    const endpoint = (agent.api_endpoint ?? "").trim();
    if (!endpoint) {
      return { success: false, error: "Aucun endpoint API configuré pour cet agent." };
    }
    if (!isAllowedHttpUrl(endpoint)) {
      return {
        success: false,
        error: "L’endpoint API doit être une URL http ou https valide.",
      };
    }

    return await executeClientPost(endpoint, (agent.api_key ?? "").trim(), q);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’appel API.";
    return { success: false, error: message };
  }
}

async function executeClientPost(
  endpoint: string,
  apiKey: string,
  query: string,
): Promise<CallClientApiResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey.length > 0) {
      headers["X-Api-Key"] = apiKey;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        success: false,
        error: `L’API client a répondu ${res.status}${text ? ` : ${text.slice(0, 200)}` : ""}`,
      };
    }

    if (!text.trim()) {
      return { success: true, data: null };
    }

    try {
      const parsed: unknown = JSON.parse(text);
      return { success: true, data: parsed as Json };
    } catch {
      return {
        success: false,
        error: "La réponse du client n’est pas du JSON valide.",
      };
    }
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    return {
      success: false,
      error: isAbort
        ? "L’API client n’a pas répondu à temps (timeout)."
        : e instanceof Error
          ? e.message
          : "Erreur réseau lors de l’appel API.",
    };
  } finally {
    clearTimeout(t);
  }
}
