"use server";

import { GoogleGenerativeAI, type GenerateContentResult } from "@google/generative-ai";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import {
  parsePillarsFromText,
  type PillarBlock,
} from "@/lib/knowledge/parse-pillars";

/** Contenu des 4 axes stratégiques après réorganisation IA (hors template PILIER). */
export type StrategicCategories = {
  identite: string;
  pratique: string;
  catalogue: string;
  reclamations: string;
};

export type AnalyzeDocSuccess = {
  ok: true;
  data: {
    companyName: string;
    sector: string;
    description: string;
    faqHighlights: string[];
    /** Informations additionnelles quand un template FAQ Stratégique est détecté. */
    template?: {
      detected: true;
      pillarsFound: number;
      piliers: PillarBlock[];
      hours: string;
      links: string[];
    };
    /**
     * Document non-template : réorganisation par Gemini en 4 piliers stratégiques
     * (même logique RAG que le template, source `document_reorganized` à l’enregistrement).
     */
    reorganized?: {
      detected: true;
      categories: StrategicCategories;
      piliers: PillarBlock[];
    };
  };
};

export type AnalyzeDocFailure = {
  ok: false;
  error: string;
};

export type AnalyzeDocResult = AnalyzeDocSuccess | AnalyzeDocFailure;

const MAX_TEXT_CHARS = 120_000;

/**
 * Parse une réponse JSON du modèle (éventuellement entourée de fences Markdown).
 */
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

const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash-latest";
/** Parcours « document libre » réorganisé : Flash par défaut (aligné site web). */
const STRATEGIC_DOC_MODEL = "gemini-2.5-flash";
const STRATEGIC_DOC_FALLBACK = "gemini-1.5-flash";

const STRATEGIC_PILLAR_TITLES: [string, string, string, string] = [
  "Identité (Nom, Mission)",
  "Pratique (Accès, Horaires)",
  "Catalogue (Offres, Prix, Procédures)",
  "Réclamations (Désabonnement, Escalade humaine)",
];

function buildPillarsFromStrategicCategories(
  c: StrategicCategories,
): PillarBlock[] {
  const parts = [c.identite, c.pratique, c.catalogue, c.reclamations];
  return ([1, 2, 3, 4] as const).map((index) => {
    const title = STRATEGIC_PILLAR_TITLES[index - 1];
    const body = (parts[index - 1] ?? "").trim();
    const content = `PILIER ${index} : ${title}\n${body}`.trim();
    return { index, title, content };
  });
}

function normalizeStrategicCategories(
  raw: Record<string, unknown>,
): StrategicCategories | null {
  const sc = raw.strategicCategories;
  if (!sc || typeof sc !== "object") return null;
  const o = sc as Record<string, unknown>;
  const pick = (k: string): string => {
    const v = o[k];
    return typeof v === "string" ? v.trim() : "Non précisé";
  };
  return {
    identite: pick("identite") || "Non précisé",
    pratique: pick("pratique") || "Non précisé",
    catalogue: pick("catalogue") || "Non précisé",
    reclamations: pick("reclamations") || "Non précisé",
  };
}

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

/**
 * Normalise le JSON attendu pour le mode « document générique » (hors template Piliers).
 */
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

type SupportedKind = "pdf" | "docx";

function detectKind(file: File): SupportedKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  const isDocxMime =
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (isDocxMime || name.endsWith(".docx")) return "docx";
  return null;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    return (textResult.text ?? "").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
}

/**
 * Analyse un PDF ou DOCX uploadé depuis l’onboarding.
 *
 * - Si le texte contient au moins **2 sections « PILIER »** reconnues, le parcours
 *   **template** s’applique : parsing déterministe (`parsePillarsFromText`), sans appel
 *   Gemini pour le profil ; les blocs pilier servent ensuite à l’indexation RAG.
 * - Sinon : **réorganisation stratégique** via Gemini Flash : 4 catégories (Identité,
 *   Pratique, Catalogue, Réclamations) + profil ; blocs convertis en `PillarBlock`
 *   pour l’indexation RAG (`document_reorganized`).
 */
export async function analyzeDocument(
  formData: FormData,
): Promise<AnalyzeDocResult> {
  try {
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { ok: false, error: "Aucun fichier fourni." };
    }

    const kind = detectKind(file);
    if (!kind) {
      return {
        ok: false,
        error: "Format non supporté. Veuillez déposer un fichier PDF ou DOCX.",
      };
    }

    let documentText = "";
    try {
      documentText =
        kind === "pdf"
          ? await extractTextFromPdf(file)
          : await extractTextFromDocx(file);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Impossible de lire le contenu du document.";
      return { ok: false, error: message };
    }

    if (!documentText.length) {
      return {
        ok: false,
        error:
          kind === "pdf"
            ? "Impossible d’extraire du texte de ce PDF (fichier vide ou pages uniquement en image)."
            : "Impossible d’extraire du texte de ce document DOCX (fichier vide ou corrompu).",
      };
    }

    const parsedTemplate = parsePillarsFromText(documentText);
    const isTemplate = parsedTemplate.pillarsFound >= 2;

    if (isTemplate) {
      const companyName = parsedTemplate.companyName.trim();
      const mission = parsedTemplate.mission.trim();
      const hours = parsedTemplate.hours.trim();

      const highlights: string[] = [];
      if (mission) highlights.push(`Mission : ${mission}`);
      if (hours) highlights.push(`Horaires : ${hours}`);
      if (parsedTemplate.links.length) {
        highlights.push(`Liens : ${parsedTemplate.links.slice(0, 3).join(" · ")}`);
      }
      while (highlights.length < 3) highlights.push("");

      return {
        ok: true,
        data: {
          companyName: companyName || "—",
          sector: "—",
          description: mission || "—",
          faqHighlights: highlights.slice(0, 3),
          template: {
            detected: true,
            pillarsFound: parsedTemplate.pillarsFound,
            piliers: parsedTemplate.piliers,
            hours,
            links: parsedTemplate.links,
          },
        },
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      return {
        ok: false,
        error: "Configuration serveur : variable GEMINI_API_KEY manquante.",
      };
    }

    if (documentText.length > MAX_TEXT_CHARS) {
      documentText = documentText.slice(0, MAX_TEXT_CHARS);
    }

    const instruction = `Tu es un expert en stratégie client. Voici un texte brut extrait d'un document d'entreprise. Analyse-le et répartis les informations dans ces 4 catégories :
1/ Identité (Nom, Mission)
2/ Pratique (Accès, Horaires)
3/ Catalogue (Offres, Prix, Procédures)
4/ Réclamations (Désabonnement, Escalade humaine)

Si une information est manquante pour une catégorie ou un sous-thème, indique « Non précisé ».

En complément, extrais aussi pour le profil entreprise : nom commercial, secteur, description courte (2–4 phrases), et exactement 3 points clés type FAQ issus du document.

Réponds uniquement en JSON valide, schéma exact (clés en anglais pour les champs racine) :
{
  "companyName": "string",
  "sector": "string",
  "description": "string",
  "faqHighlights": ["string", "string", "string"],
  "strategicCategories": {
    "identite": "string",
    "pratique": "string",
    "catalogue": "string",
    "reclamations": "string"
  }
}

Texte du document :
---
${documentText}
---`;

    const genAI = new GoogleGenerativeAI(apiKey);

    const modelCandidates = [
      process.env.GEMINI_MODEL?.trim(),
      STRATEGIC_DOC_MODEL,
      STRATEGIC_DOC_FALLBACK,
      FALLBACK_GEMINI_MODEL,
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i) as string[];

    const generate = (modelName: string): Promise<GenerateContentResult> => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });
      return model.generateContent(instruction);
    };

    let result: GenerateContentResult | undefined;
    let lastModelError: unknown;
    for (const modelName of modelCandidates) {
      try {
        result = await generate(modelName);
        lastModelError = undefined;
        break;
      } catch (e) {
        lastModelError = e;
        if (!isLikelyModelNotFoundError(e)) throw e;
      }
    }
    if (!result) {
      throw lastModelError instanceof Error
        ? lastModelError
        : new Error("Aucun modèle Gemini disponible pour l’analyse du document.");
    }
    const response = result.response;
    const outText = response.text();
    if (!outText?.trim()) {
      return { ok: false, error: "Réponse vide du modèle." };
    }

    const raw = parseModelJson(outText);
    const base = normalizeResult(raw);
    const categories = normalizeStrategicCategories(raw);
    if (!categories) {
      return { ok: true, data: base };
    }

    const piliers = buildPillarsFromStrategicCategories(categories);
    return {
      ok: true,
      data: {
        ...base,
        reorganized: {
          detected: true,
          categories,
          piliers,
        },
      },
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’analyse.";
    return { ok: false, error: message };
  }
}
