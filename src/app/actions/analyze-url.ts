"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from "cheerio";
import type { AnalyzeDocResult } from "@/app/actions/analyze-doc";

const MAX_TEXT_CHARS = 120_000;
const FETCH_TIMEOUT_MS = 25_000;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash";

const STRATEGIC_KEYWORDS = [
  "faq",
  "about",
  "propos",
  "qui",
  "services",
  "offres",
] as const;

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

function normalizeResult(raw: Record<string, unknown>): {
  companyName: string;
  sector: string;
  description: string;
  faqHighlights: string[];
} {
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

function parsePublicWebsiteUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  if (h.endsWith(".localhost")) return true;
  if (h.startsWith("192.168.") || h.startsWith("10.")) return true;
  if (h.startsWith("172.")) {
    const second = Number(h.split(".")[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) return true;
  }
  return false;
}

function findStrategicInternalLinks(html: string, baseUrl: URL): string[] {
  const $ = cheerio.load(html);
  const origin = baseUrl.origin;
  const seen = new Set<string>();
  const out: string[] = [];

  $("a[href]").each((_, el) => {
    if (out.length >= 3) return false;
    const href = $(el).attr("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.toLowerCase().startsWith("javascript:")
    ) {
      return;
    }
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

    let absolute: URL;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:")
      return;
    if (absolute.origin !== origin) return;

    const normalized = `${absolute.origin}${absolute.pathname}${absolute.search}`;
    if (seen.has(normalized)) return;

    const pathAndQuery = (absolute.pathname + absolute.search).toLowerCase();
    const text = ($(el).text() || "").toLowerCase();
    const hay = `${pathAndQuery} ${text}`;
    const hit = STRATEGIC_KEYWORDS.some((kw) => hay.includes(kw));
    if (!hit) return;

    seen.add(normalized);
    out.push(normalized);
  });

  return out;
}

function extractReadableText(html: string, label: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  $("nav, footer, [role='navigation']").remove();

  const chunks: string[] = [];
  $("h1, h2, h3, h4, h5, h6, p, li").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 2) chunks.push(t);
  });

  const body = chunks.join("\n");
  if (!body.length) {
    return `=== ${label} ===\n(aucun texte extractible sur cette page)\n`;
  }
  return `=== ${label} ===\n${body}\n`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; AluraOnboarding/1.0; +https://alura.app)",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pour ${url}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(ct)) {
    throw new Error(
      `Type de contenu inattendu (${ct || "inconnu"}) pour ${url}`,
    );
  }

  return res.text();
}

export async function analyzeWebsiteUrl(
  urlInput: string,
): Promise<AnalyzeDocResult> {
  try {
    const startUrl = parsePublicWebsiteUrl(urlInput);
    if (!startUrl) {
      return {
        ok: false,
        error:
          "URL invalide. Utilisez une adresse complète (ex. https://exemple.com).",
      };
    }

    if (isBlockedHostname(startUrl.hostname)) {
      return {
        ok: false,
        error: "Cette adresse n’est pas autorisée pour l’analyse.",
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      return {
        ok: false,
        error: "Configuration serveur : variable GEMINI_API_KEY manquante.",
      };
    }

    let homeHtml: string;
    try {
      homeHtml = await fetchHtml(startUrl.href);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("timeout") ||
        msg.includes("Timeout") ||
        msg.includes("aborted")
      ) {
        return {
          ok: false,
          error:
            "Le site met trop longtemps à répondre ou bloque l’accès. Réessayez ou utilisez l’option PDF.",
        };
      }
      return {
        ok: false,
        error:
          "Impossible de récupérer la page d’accueil (site inaccessible, protection anti-bot, ou URL incorrecte).",
      };
    }

    const extraUrls = findStrategicInternalLinks(homeHtml, startUrl);

    const homeText = extractReadableText(homeHtml, "Page d’accueil");

    const extraParts = await Promise.all(
      extraUrls.map(async (u, i) => {
        try {
          const html = await fetchHtml(u);
          return extractReadableText(
            html,
            `Page stratégique ${i + 1} (${u})`,
          );
        } catch {
          return `=== Page stratégique ${i + 1} (${u}) ===\n(échec du chargement)\n`;
        }
      }),
    );

    let fullWebsiteContext = [homeText, ...extraParts].join("\n\n");
    if (fullWebsiteContext.length > MAX_TEXT_CHARS) {
      fullWebsiteContext = fullWebsiteContext.slice(0, MAX_TEXT_CHARS);
    }

    if (!fullWebsiteContext.trim()) {
      return {
        ok: false,
        error:
          "Aucun texte utile n’a pu être extrait des pages publiques de ce site.",
      };
    }

    const instruction = `Tu es un expert en onboarding client. Tu as reçu le texte extrait de plusieurs pages publiques d’un même site web (accueil + pages internes pertinentes type FAQ, À propos, services).

Analyse l’ensemble du site et produis un profil synthétique. Réponds uniquement en JSON valide (pas de markdown, pas de texte autour).

Structure JSON exacte attendue (clés en anglais) :
{
  "companyName": "string",
  "sector": "string",
  "description": "string",
  "faqHighlights": ["string", "string", "string"]
}

Consignes :
- companyName : nom commercial ou marque le plus probable.
- sector : secteur d’activité en une courte phrase ou quelques mots.
- description : 2 à 4 phrases décrivant l’offre et la valeur pour le client.
- faqHighlights : exactement 3 chaînes, points clés issus surtout des contenus de type FAQ / services / offres (si absents, déduis des formulations proches).

Texte agrégé du site :
---
${fullWebsiteContext}
---`;

    const primaryModel =
      process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

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

    let raw: Record<string, unknown>;
    try {
      raw = parseModelJson(outText);
    } catch {
      return {
        ok: false,
        error:
          "L’IA n’a pas renvoyé un JSON exploitable. Réessayez ou utilisez l’option PDF.",
      };
    }

    const data = normalizeResult(raw);
    return { ok: true, data };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur inattendue lors de l’analyse.";
    return { ok: false, error: message };
  }
}
