/** Dimensions attendues par `public.knowledge.embedding vector(768)`. */
const EXPECTED_DIM = 768;

type ApiVer = "v1" | "v1beta";

type EmbedAttempt = {
  api: ApiVer;
  model: string;
};

/**
 * Ordre de repli : `gemini-embedding-001` est le modèle actuel pour `embedContent` ;
 * `text-embedding-004` en secours. Ne pas utiliser `embedding-001` (retiré de l’API).
 */
const EMBED_ATTEMPTS: EmbedAttempt[] = [
  { api: "v1beta", model: "gemini-embedding-001" },
  { api: "v1", model: "gemini-embedding-001" },
  { api: "v1", model: "text-embedding-004" },
  { api: "v1beta", model: "text-embedding-004" },
];

function buildEmbedUrl(apiVersion: ApiVer, model: string, apiKey: string): string {
  const base = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:embedContent`;
  return `${base}?key=${encodeURIComponent(apiKey)}`;
}

async function postEmbed(
  url: string,
  text: string,
  opts?: { outputDimensionality?: number; taskType?: string },
): Promise<Response> {
  const payload: Record<string, unknown> = {
    content: { parts: [{ text }] },
  };
  if (opts?.outputDimensionality != null) {
    payload.outputDimensionality = opts.outputDimensionality;
  }
  if (opts?.taskType) {
    payload.taskType = opts.taskType;
  }
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function parseEmbeddingValues(data: unknown): number[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as {
    embedding?: { values?: number[] } | number[];
  };
  const emb = d.embedding;
  const v = Array.isArray(emb) ? emb : emb?.values;
  return Array.isArray(v) && v.length > 0 ? v : null;
}

/**
 * Embeddings Gemini (REST) — enchaîne plusieurs `api × modèle` jusqu’au premier succès.
 */
export async function embedTextGemini(apiKey: string, text: string): Promise<number[]> {
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) {
    throw new Error("Texte vide : impossible de générer un embedding.");
  }

  let lastStatus = 0;
  let lastBody = "";

  for (const { api, model } of EMBED_ATTEMPTS) {
    const url = buildEmbedUrl(api, model, apiKey);
    const isGeminiEmbed = model.includes("gemini-embedding");

    let res = await postEmbed(url, trimmed, {
      outputDimensionality: EXPECTED_DIM,
      ...(isGeminiEmbed ? { taskType: "RETRIEVAL_DOCUMENT" } : {}),
    });
    if (res.status === 400) {
      res = await postEmbed(url, trimmed, {
        outputDimensionality: EXPECTED_DIM,
      });
    }
    if (res.status === 400) {
      res = await postEmbed(url, trimmed);
    }

    if (!res.ok) {
      lastStatus = res.status;
      lastBody = await res.text();
      if (res.status === 404 || res.status === 400) {
        continue;
      }
      throw new Error(`Embedding HTTP ${res.status}: ${lastBody.slice(0, 240)}`);
    }

    const data = (await res.json()) as unknown;
    let v = parseEmbeddingValues(data);
    if (!v) {
      lastStatus = 0;
      continue;
    }

    if (v.length > EXPECTED_DIM) {
      v = v.slice(0, EXPECTED_DIM);
    } else if (v.length < EXPECTED_DIM) {
      lastStatus = 0;
      continue;
    }

    return v;
  }

  throw new Error(
    `Aucun modèle d’embedding disponible (dernier HTTP ${lastStatus}): ${lastBody.slice(0, 280)}`,
  );
}

/** Littéral pgvector pour PostgREST / Supabase. */
export function vectorToPgString(values: number[]): string {
  if (values.length === 0) {
    throw new Error("Vecteur vide : impossible de sérialiser pour pgvector.");
  }
  return `[${values.join(",")}]`;
}
