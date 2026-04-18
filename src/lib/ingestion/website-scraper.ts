import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type PageLabel =
  | "Page d'accueil"
  | "FAQ"
  | "CGV"
  | "CGU"
  | "Conditions"
  | "À propos"
  | "Mentions légales"
  | "Services"
  | "Offres"
  | "Contact"
  | "Page complémentaire";

export type DetectedPage = { url: string; label: PageLabel };

export type ScrapedPage = DetectedPage & { text: string; success: boolean };

export type CuratedFact = { topic: string; content: string };

export type WebsiteScrapeResult = {
  companyName: string;
  sector: string;
  description: string;
  faqHighlights: string[];
  pagesAnalyzed: DetectedPage[];
  facts: CuratedFact[];
};

export type ScrapeProgress =
  | { type: "stage"; message: string }
  | { type: "pages-detected"; pages: DetectedPage[] }
  | { type: "page-start"; url: string; label: PageLabel; message: string }
  | { type: "page-done"; url: string; label: PageLabel; success: boolean }
  | { type: "curating"; message: string }
  | { type: "done"; result: WebsiteScrapeResult }
  | { type: "error"; message: string };

export type ProgressHandler = (event: ScrapeProgress) => void | Promise<void>;

const MAX_TEXT_CHARS = 120_000;
const FETCH_TIMEOUT_MS = 25_000;
/** 1 accueil + 2 à 4 pages stratégiques = 3 à 5 pages max (spec utilisateur). */
const MAX_EXTRA_PAGES = 4;
const MAX_FACTS = 30;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_MODEL = "gemini-1.5-flash";

const LABEL_RULES: Array<{ pattern: RegExp; label: PageLabel }> = [
  { pattern: /\bfaq\b|foire\s*aux\s*questions|questions?\s*fr[ée]quentes?/, label: "FAQ" },
  { pattern: /cgv|conditions?\s*g[ée]n[ée]rales?\s*de\s*vente/, label: "CGV" },
  { pattern: /cgu|conditions?\s*g[ée]n[ée]rales?\s*d['’ ]utilisation/, label: "CGU" },
  { pattern: /mentions?[- _]l[ée]gales?|legal[- _]?notice/, label: "Mentions légales" },
  { pattern: /conditions?/, label: "Conditions" },
  { pattern: /propos|about(?!\w)|qui[- _]sommes[- _]nous/, label: "À propos" },
  { pattern: /services?(?!\w)/, label: "Services" },
  { pattern: /offres?(?!\w)|pricing|tarifs?|pricing/, label: "Offres" },
  { pattern: /contact/, label: "Contact" },
];

function labelForUrl(url: URL, linkText: string): PageLabel {
  const hay = `${url.pathname} ${linkText}`.toLowerCase();
  for (const rule of LABEL_RULES) {
    if (rule.pattern.test(hay)) return rule.label;
  }
  return "Page complémentaire";
}

function stageMessageFor(label: PageLabel): string {
  switch (label) {
    case "FAQ":
      return "Analyse de la FAQ...";
    case "CGV":
      return "Analyse des CGV...";
    case "CGU":
      return "Analyse des CGU...";
    case "Conditions":
      return "Analyse des Conditions...";
    case "À propos":
      return "Analyse de la page À propos...";
    case "Mentions légales":
      return "Analyse des Mentions légales...";
    case "Services":
      return "Analyse de la page Services...";
    case "Offres":
      return "Analyse des Offres...";
    case "Contact":
      return "Analyse de la page Contact...";
    case "Page d'accueil":
      return "Analyse de la page d'accueil...";
    default:
      return "Analyse d'une page complémentaire...";
  }
}

export function parsePublicWebsiteUrl(raw: string): URL | null {
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

export function isBlockedHostname(hostname: string): boolean {
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

function findStrategicLinks(
  html: string,
  baseUrl: URL,
  limit: number,
): DetectedPage[] {
  const $ = cheerio.load(html);
  const origin = baseUrl.origin;
  const seen = new Set<string>();
  const collected: DetectedPage[] = [];
  const seenLabels = new Set<PageLabel>();

  $("a[href]").each((_, el) => {
    if (collected.length >= limit) return false;
    const href = $(el).attr("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.toLowerCase().startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    let absolute: URL;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:")
      return;
    if (absolute.origin !== origin) return;

    const normalized = `${absolute.origin}${absolute.pathname}`;
    if (seen.has(normalized)) return;
    if (normalized === `${baseUrl.origin}${baseUrl.pathname}`) return;

    const linkText = ($(el).text() || "").replace(/\s+/g, " ").trim();
    const label = labelForUrl(absolute, linkText);
    if (label === "Page complémentaire") return;
    if (seenLabels.has(label)) return;

    seen.add(normalized);
    seenLabels.add(label);
    collected.push({ url: normalized, label });
  });

  return collected;
}

/**
 * Cible `main` > `article` > `body` en dernier recours. Retire au préalable
 * les blocs bruits (nav, footer, aside, header, script, style, etc.).
 */
function extractReadableText(html: string, label: string): string {
  const $ = cheerio.load(html);
  $(
    "script, style, noscript, svg, iframe, nav, footer, aside, header, form, [role='navigation'], [role='banner'], [role='contentinfo']",
  ).remove();

  let root = $("main").first();
  if (!root.length || root.text().trim().length < 200) {
    const article = $("article").first();
    if (article.length && article.text().trim().length >= 200) {
      root = article;
    }
  }
  if (!root.length || root.text().trim().length < 40) {
    root = $("body");
  }

  const seenLines = new Set<string>();
  const chunks: string[] = [];

  const pushLine = (text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= 2) return;
    const key = t.toLowerCase();
    if (seenLines.has(key)) return;
    seenLines.add(key);
    chunks.push(t);
  };

  root.find("section").each((_, sectionEl) => {
    $(sectionEl)
      .find("h1, h2, h3, h4, h5, h6, p, li, dt, dd")
      .each((__, el) => pushLine($(el).text()));
  });

  root.find("h1, h2, h3, h4, h5, h6, p, li, dt, dd").each((_, el) => {
    pushLine($(el).text());
  });

  const body = chunks.join("\n");
  if (!body.length) {
    return `=== ${label} ===\n(aucun texte extractible sur cette page)\n`;
  }
  return `=== ${label} ===\n${body}\n`;
}

function parseModelJson(text: string): Record<string, unknown> {
  let t = text.trim();
  const fence = /^```(?:json)?\s*\n?/i;
  if (fence.test(t)) t = t.replace(fence, "");
  if (t.endsWith("```")) t = t.slice(0, -3).trim();
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

function normalizeProfile(raw: Record<string, unknown>): {
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
  while (faqHighlights.length < 3) faqHighlights.push("");
  return {
    companyName: companyName || "—",
    sector: sector || "—",
    description: description || "—",
    faqHighlights: faqHighlights.slice(0, 3),
  };
}

function normalizeFacts(raw: Record<string, unknown>): CuratedFact[] {
  const list = Array.isArray(raw.facts) ? raw.facts : [];
  const out: CuratedFact[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { topic?: unknown; content?: unknown };
    const topic =
      typeof obj.topic === "string" ? obj.topic.replace(/\s+/g, " ").trim() : "";
    const content =
      typeof obj.content === "string"
        ? obj.content.replace(/\s+/g, " ").trim()
        : "";
    if (topic.length < 2 || content.length < 30) continue;
    const key = `${topic.toLowerCase()}::${content.toLowerCase().slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ topic, content });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

type GeminiClient = GoogleGenerativeAI;

async function generateJson(
  client: GeminiClient,
  prompt: string,
): Promise<string> {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const run = (modelName: string) =>
    client
      .getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      })
      .generateContent(prompt);

  let result;
  try {
    result = await run(primary);
  } catch (firstErr) {
    if (
      primary === DEFAULT_GEMINI_MODEL &&
      isLikelyModelNotFoundError(firstErr)
    ) {
      result = await run(FALLBACK_GEMINI_MODEL);
    } else {
      throw firstErr;
    }
  }
  return result.response.text();
}

/**
 * Pipeline complet (scraping + nettoyage + curation IA) avec callback de
 * progression compatible streaming NDJSON ou Server Action silencieuse.
 */
export async function runWebsiteScrape(
  urlInput: string,
  apiKey: string,
  onProgress?: ProgressHandler,
): Promise<WebsiteScrapeResult> {
  const emit = async (ev: ScrapeProgress) => {
    if (onProgress) await onProgress(ev);
  };

  const startUrl = parsePublicWebsiteUrl(urlInput);
  if (!startUrl) {
    throw new Error(
      "URL invalide. Utilisez une adresse complète (ex. https://exemple.com).",
    );
  }
  if (isBlockedHostname(startUrl.hostname)) {
    throw new Error("Cette adresse n’est pas autorisée pour l’analyse.");
  }
  if (!apiKey.trim()) {
    throw new Error("Configuration serveur : variable GEMINI_API_KEY manquante.");
  }

  await emit({ type: "stage", message: "Exploration du site…" });

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
      throw new Error(
        "Le site met trop longtemps à répondre ou bloque l’accès. Réessayez ou utilisez l’option document.",
      );
    }
    throw new Error(
      "Impossible de récupérer la page d’accueil (site inaccessible, protection anti-bot, ou URL incorrecte).",
    );
  }

  const homePage: DetectedPage = {
    url: `${startUrl.origin}${startUrl.pathname}`,
    label: "Page d'accueil",
  };
  const extras = findStrategicLinks(homeHtml, startUrl, MAX_EXTRA_PAGES);
  const allPages: DetectedPage[] = [homePage, ...extras];

  await emit({ type: "pages-detected", pages: allPages });

  const scraped: ScrapedPage[] = [];

  await emit({
    type: "page-start",
    url: homePage.url,
    label: homePage.label,
    message: stageMessageFor(homePage.label),
  });
  const homeText = extractReadableText(homeHtml, homePage.label);
  scraped.push({ ...homePage, text: homeText, success: true });
  await emit({
    type: "page-done",
    url: homePage.url,
    label: homePage.label,
    success: true,
  });

  for (const page of extras) {
    await emit({
      type: "page-start",
      url: page.url,
      label: page.label,
      message: stageMessageFor(page.label),
    });
    try {
      const html = await fetchHtml(page.url);
      const text = extractReadableText(html, page.label);
      scraped.push({ ...page, text, success: true });
      await emit({
        type: "page-done",
        url: page.url,
        label: page.label,
        success: true,
      });
    } catch {
      scraped.push({
        ...page,
        text: `=== ${page.label} ===\n(échec du chargement)\n`,
        success: false,
      });
      await emit({
        type: "page-done",
        url: page.url,
        label: page.label,
        success: false,
      });
    }
  }

  let fullContext = scraped.map((p) => p.text).join("\n\n");
  if (fullContext.length > MAX_TEXT_CHARS) {
    fullContext = fullContext.slice(0, MAX_TEXT_CHARS);
  }
  if (!fullContext.trim()) {
    throw new Error(
      "Aucun texte utile n’a pu être extrait des pages publiques de ce site.",
    );
  }

  await emit({
    type: "curating",
    message: "Curation des informations par Alura…",
  });

  const client = new GoogleGenerativeAI(apiKey);

  const profilePrompt = `Tu es un expert en onboarding client. Tu as reçu le texte extrait de plusieurs pages publiques d’un même site web (accueil + pages internes pertinentes type FAQ, CGV, À propos, services).

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
${fullContext}
---`;

  const factsPrompt = `Tu es un expert en extraction de données. Transforme ce texte brut de site web en une liste de faits structurés, clairs et utiles pour un service client.

Règles strictes :
- Ne garde QUE des informations factuelles et actionnables (prix, horaires, adresses, procédures, modalités, engagements, politiques, limites, contacts, définitions produit).
- Reformule chaque fait en 1 à 3 phrases autonomes compréhensibles hors contexte.
- Un fait = un sujet précis. Évite les redondances et les formulations marketing.
- Ignore les éléments de navigation, bannières cookies, slogans creux, appels à l'action.
- Si une info est incomplète ou ambigüe, omets-la.
- Maximum ${MAX_FACTS} faits, classés par ordre d'importance pour un conseiller client.

Réponds uniquement en JSON valide, strict schéma :
{
  "facts": [
    { "topic": "string (libellé court du sujet, 2 à 8 mots)", "content": "string (1 à 3 phrases factuelles)" }
  ]
}

Texte agrégé du site :
---
${fullContext}
---`;

  const [profileText, factsText] = await Promise.all([
    generateJson(client, profilePrompt),
    generateJson(client, factsPrompt),
  ]);

  if (!profileText?.trim()) {
    throw new Error("Réponse vide du modèle (profil).");
  }
  const profile = normalizeProfile(parseModelJson(profileText));

  let facts: CuratedFact[] = [];
  try {
    facts = normalizeFacts(parseModelJson(factsText ?? ""));
  } catch {
    facts = [];
  }

  const result: WebsiteScrapeResult = {
    ...profile,
    pagesAnalyzed: scraped.map(({ url, label }) => ({ url, label })),
    facts,
  };

  await emit({ type: "done", result });
  return result;
}
