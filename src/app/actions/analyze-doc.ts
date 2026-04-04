"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFParse } from "pdf-parse";

export type AnalyzeDocSuccess = {
  ok: true;
  data: {
    companyName: string;
    sector: string;
    description: string;
    faqHighlights: string[];
  };
};

export type AnalyzeDocFailure = {
  ok: false;
  error: string;
};

export type AnalyzeDocResult = AnalyzeDocSuccess | AnalyzeDocFailure;

const MAX_TEXT_CHARS = 120_000;

function parseModelJson(text: string): Record<string, unknown> {
  let t = text.trim();
  const fence = /^```(?:json)?\s*\n?/i;
  if (fence.test(t)) {
    t = t.replace(fence, "");
  }
  if (t.endsWith("```")) {
    t = t.slice(0, -3).trim();
  }
  const parsed: unknown = JSON.parse(t);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Réponse JSON invalide.");
  }
  return parsed as Record<string, unknown>;
}

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash-latest";

function isLikelyModelNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  return (
    msg.includes("404") ||
    lower.includes("not found") ||
    lower.includes("not_found") ||
    lower.includes("unknown model")
  );
}

function normalizeResult(raw: Record<string, unknown>): AnalyzeDocSuccess["data"] {
  const companyName =
    typeof raw.companyName === "string" ? raw.companyName.trim() : "";
  const sector = typeof raw.sector === "string" ? raw.sector.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  let faqHighlights: string[] = [];
  if (Array.isArray(raw.faqHighlights)) {
    faqHighlights = raw.faqHighlights
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  while (faqHighlights.length < 3) {
    faqHighlights.push("");
  }
  return {
    companyName: companyName || "—",
    sector: sector || "—",
    description: description || "—",
    faqHighlights: faqHighlights.slice(0, 3),
  };
}

export async function analyzeDocument(
  formData: FormData,
): Promise<AnalyzeDocResult> {
  try {
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { ok: false, error: "Aucun fichier fourni." };
    }

    const name = file.name.toLowerCase();
    const isPdf =
      file.type === "application/pdf" ||
      name.endsWith(".pdf");
    if (!isPdf) {
      return { ok: false, error: "Veuillez déposer un fichier PDF." };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      return {
        ok: false,
        error: "Configuration serveur : variable GEMINI_API_KEY manquante.",
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    let documentText = "";
    try {
      const textResult = await parser.getText();
      documentText = (textResult.text ?? "").trim();
    } finally {
      await parser.destroy();
    }
    if (!documentText.length) {
      return {
        ok: false,
        error:
          "Impossible d’extraire du texte de ce PDF (fichier vide ou pages uniquement en image).",
      };
    }
    if (documentText.length > MAX_TEXT_CHARS) {
      documentText = documentText.slice(0, MAX_TEXT_CHARS);
    }

    const instruction = `Tu es un expert en onboarding client. Analyse ce texte et extrais : le Nom de l'entreprise, le Secteur d'activité, une Description concise, et 3 points clés de leur FAQ. Réponds uniquement en format JSON.

Structure JSON exacte attendue (clés en anglais) :
{
  "companyName": "string",
  "sector": "string",
  "description": "string",
  "faqHighlights": ["string", "string", "string"]
}

Texte du document :
---
${documentText}
---`;

    const primaryModel =
      process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

    console.log("Modèle utilisé :", process.env.GEMINI_MODEL);

    const genAI = new GoogleGenerativeAI(apiKey);

    const generate = (modelName: string) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });
      return model.generateContent(instruction);
    };

    let result;
    try {
      result = await generate(primaryModel);
    } catch (firstErr) {
      if (
        primaryModel === DEFAULT_GEMINI_MODEL &&
        isLikelyModelNotFoundError(firstErr)
      ) {
        result = await generate(FALLBACK_GEMINI_MODEL);
      } else {
        throw firstErr;
      }
    }
    const response = result.response;
    const outText = response.text();
    if (!outText?.trim()) {
      return { ok: false, error: "Réponse vide du modèle." };
    }

    const raw = parseModelJson(outText);
    const data = normalizeResult(raw);
    return { ok: true, data };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’analyse.";
    return { ok: false, error: message };
  }
}
