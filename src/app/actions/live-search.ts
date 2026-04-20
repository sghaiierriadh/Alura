"use server";

type LiveSearchSuccess = {
  ok: true;
  snippets: string[];
};

type LiveSearchFailure = {
  ok: false;
  error: string;
};

export type LiveSearchResult = LiveSearchSuccess | LiveSearchFailure;

type SerperOrganicResult = {
  snippet?: string;
};

type SerperSearchResponse = {
  organic?: SerperOrganicResult[];
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

export async function liveSearch(
  query: string,
  baseUrl: string,
): Promise<LiveSearchResult> {
  const normalizedQuery = query.trim();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedQuery) {
    return { ok: false, error: "query requis." };
  }
  if (!normalizedBaseUrl) {
    return { ok: false, error: "baseUrl requis." };
  }

  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Configuration serveur : variable SERPER_API_KEY manquante.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `site:${normalizedBaseUrl} ${normalizedQuery}`,
        num: 3,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Serper indisponible (${response.status}).`,
      };
    }

    const data: unknown = await response.json();
    const parsed = data as SerperSearchResponse;
    const snippets = (parsed.organic ?? [])
      .map((item) => (typeof item.snippet === "string" ? item.snippet.trim() : ""))
      .filter(Boolean)
      .slice(0, 3);

    return { ok: true, snippets };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur réseau inconnue.";
    const isAbort = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: isAbort ? "Serper ne répond pas (timeout)." : `Recherche impossible: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
