/**
 * Parseur du template FAQ Stratégique Alura.
 *
 * Détecte les sections « PILIER 1..4 » dans le texte extrait (PDF ou DOCX) et
 * en isole :
 *  - le contenu complet de chaque pilier (pour l'embedding RAG)
 *  - des champs ciblés :
 *      • Pilier 1 : Nom de l'entreprise, Mission
 *      • Pilier 2 : Horaires (support humain), Liens essentiels
 *
 * Les valeurs vides, les placeholders « ___ » et les commentaires
 * entre parenthèses explicatifs sont filtrés pour ne pas polluer le
 * pré-remplissage du profil.
 */

export type PillarBlock = {
  index: 1 | 2 | 3 | 4;
  title: string;
  content: string;
};

export type ParsedTemplate = {
  detected: boolean;
  pillarsFound: number;
  piliers: PillarBlock[];
  companyName: string;
  mission: string;
  hours: string;
  links: string[];
};

const PILIER_HEADER_RE =
  /(^|\n)[^\n]*?PILIER\s+([1-4])\s*[:\-–—]?\s*([^\n]*)/gi;

const LABEL_STOP_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][^:\n]{0,80}\s*:/;

function cleanPlaceholder(raw: string): string {
  const v = raw.replace(/_{2,}/g, " ").replace(/\s+/g, " ").trim();
  if (!v) return "";
  if (/^\(.*\)$/.test(v)) return "";
  if (/^\[.*\]$/.test(v)) return "";
  return v;
}

function extractAfterLabel(body: string, labelRegex: RegExp): string {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(labelRegex);
    if (!m) continue;

    const first = line.replace(labelRegex, "").replace(/^\s*:\s*/, "").trim();
    let acc = cleanPlaceholder(first);

    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.length) break;
      if (/^exemple\s*:/i.test(next)) break;
      if (LABEL_STOP_RE.test(next)) break;
      const cleaned = cleanPlaceholder(next);
      if (cleaned) acc = acc ? `${acc} ${cleaned}` : cleaned;
    }

    if (acc) return acc;
  }
  return "";
}

function extractUrlsFromBlock(body: string): string[] {
  const matches = body.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? [];
  const cleaned = matches
    .map((u) => u.replace(/[.,;:!?]+$/g, "").trim())
    .filter((u) => u.length > 0);
  return Array.from(new Set(cleaned));
}

function splitPillars(text: string): Array<{
  index: 1 | 2 | 3 | 4;
  title: string;
  body: string;
}> {
  type Hit = {
    idx: 1 | 2 | 3 | 4;
    title: string;
    headerStart: number;
    headerEnd: number;
  };
  const hits: Hit[] = [];

  PILIER_HEADER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PILIER_HEADER_RE.exec(text)) !== null) {
    const prefix = m[1] ?? "";
    const n = Number(m[2]);
    if (n < 1 || n > 4) continue;
    const title = (m[3] ?? "").replace(/^[:\-–—\s]+/, "").trim();
    hits.push({
      idx: n as 1 | 2 | 3 | 4,
      title,
      headerStart: m.index + prefix.length,
      headerEnd: m.index + m[0].length,
    });
  }

  hits.sort((a, b) => a.headerStart - b.headerStart);

  const seen = new Set<number>();
  const uniq: Hit[] = [];
  for (const h of hits) {
    if (seen.has(h.idx)) continue;
    seen.add(h.idx);
    uniq.push(h);
  }

  const results: Array<{
    index: 1 | 2 | 3 | 4;
    title: string;
    body: string;
  }> = [];
  for (let i = 0; i < uniq.length; i++) {
    const cur = uniq[i];
    const next = uniq[i + 1];
    const body = text.slice(cur.headerEnd, next ? next.headerStart : text.length).trim();
    results.push({ index: cur.idx, title: cur.title, body });
  }
  return results;
}

/** Parse le texte brut d'un document Alura (PDF/DOCX) et isole la structure Piliers. */
export function parsePillarsFromText(rawText: string): ParsedTemplate {
  const text = (rawText ?? "").replace(/\r\n/g, "\n");
  const sections = splitPillars(text);

  const piliers: PillarBlock[] = sections.map((s) => {
    const headerLine = `PILIER ${s.index}${s.title ? ` : ${s.title}` : ""}`;
    const content = `${headerLine}\n${s.body}`.trim();
    return { index: s.index, title: s.title, content };
  });

  const p1 = sections.find((s) => s.index === 1);
  const p2 = sections.find((s) => s.index === 2);

  const companyName = p1
    ? extractAfterLabel(p1.body, /nom\s+de\s+l['’]\s*entreprise\s*:/i)
    : "";
  const mission = p1
    ? extractAfterLabel(p1.body, /mission(?:\s+en\s+\d+\s+phrases?)?\s*:/i)
    : "";

  const hours = p2
    ? extractAfterLabel(p2.body, /horaires(?:\s+du\s+support(?:\s+humain)?)?\s*:/i)
    : "";
  const links = p2 ? extractUrlsFromBlock(p2.body) : [];

  return {
    detected: sections.length >= 2,
    pillarsFound: sections.length,
    piliers,
    companyName,
    mission,
    hours,
    links,
  };
}
