"use server";

import type { AnalyzeDocResult } from "@/app/actions/analyze-doc";
import {
  runWebsiteScrape,
  type CuratedFact,
  type DetectedPage,
} from "@/lib/ingestion/website-scraper";

export type AnalyzeUrlSuccess = {
  ok: true;
  data: {
    companyName: string;
    sector: string;
    description: string;
    faqHighlights: string[];
    website: {
      pagesAnalyzed: DetectedPage[];
      facts: CuratedFact[];
    };
  };
};

export type AnalyzeUrlFailure = { ok: false; error: string };
export type AnalyzeUrlResult = AnalyzeUrlSuccess | AnalyzeUrlFailure;

/**
 * Server Action V0 — retourne le profil + les faits curés prêts à être
 * indexés comme `knowledge` (source `website_scraping`). Compatible avec
 * l’ancienne signature (`AnalyzeDocResult`) côté appelants existants, mais
 * expose un champ supplémentaire `website` pour la curation.
 */
export async function analyzeWebsiteUrl(
  urlInput: string,
): Promise<AnalyzeDocResult | AnalyzeUrlSuccess> {
  try {
    const apiKey = process.env.GEMINI_API_KEY ?? "";
    const result = await runWebsiteScrape(urlInput, apiKey);
    return {
      ok: true,
      data: {
        companyName: result.companyName,
        sector: result.sector,
        description: result.description,
        faqHighlights: result.faqHighlights,
        website: {
          pagesAnalyzed: result.pagesAnalyzed,
          facts: result.facts,
        },
      },
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’analyse.";
    return { ok: false, error: message };
  }
}
