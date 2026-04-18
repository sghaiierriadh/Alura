import { runWebsiteScrape, type ScrapeProgress } from "@/lib/ingestion/website-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RequestBody = { url?: unknown };

/**
 * Route streaming (NDJSON) : chaque ligne = un évènement `ScrapeProgress` JSON.
 * Consommée par l’onboarding `Option B` pour afficher en temps réel les
 * pages en cours d’analyse (accueil, FAQ, CGV, À propos, …).
 */
export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Corps JSON invalide." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return new Response(JSON.stringify({ error: "Champ `url` requis." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: ScrapeProgress) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* client déconnecté : ignore */
        }
      };

      try {
        await runWebsiteScrape(url, apiKey, async (ev) => {
          if (ev.type !== "done") write(ev);
        }).then((result) => {
          write({ type: "done", result });
        });
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : "Erreur inattendue lors de l’analyse du site.";
        write({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
