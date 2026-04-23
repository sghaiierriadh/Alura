/**
 * Utilitaire de parsing du champ `content` (ou `last_question`) pour
 * les tickets / leads : sépare les blocs `[Update <iso>]` en une
 * timeline exploitable côté UI (Sheet de détail).
 */

export type TimelineEntry = {
  /** Index chronologique (0 = message initial). */
  index: number;
  /** Timestamp ISO si présent (null pour le message initial). */
  timestamp: string | null;
  /** Contenu texte du bloc (sans le marqueur `[Update ...]`). */
  text: string;
};

const UPDATE_TAG = /^\s*\[Update\s+([^\]]+)\]\s*$/;

/**
 * Parse une chaîne du format :
 *   <texte initial>
 *   \n\n[Update <iso>]\n<bloc>
 *   \n\n[Update <iso>]\n<bloc>
 *
 * et renvoie un tableau ordonné d'entrées timeline.
 * - `timestamp` est `null` pour le premier bloc (pas de tag).
 * - Les blocs vides sont ignorés.
 */
export function parseTimelineContent(raw: string | null | undefined): TimelineEntry[] {
  const source = (raw ?? "").trim();
  if (!source) return [];

  const lines = source.split(/\r?\n/);
  const entries: TimelineEntry[] = [];
  let currentTs: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      entries.push({
        index: entries.length,
        timestamp: currentTs,
        text,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(UPDATE_TAG);
    if (m) {
      flush();
      currentTs = m[1]?.trim() || null;
    } else {
      buffer.push(line);
    }
  }
  flush();

  return entries;
}

/**
 * Formatage localisé (fr-FR) d'un timestamp ISO pour affichage timeline.
 * Renvoie `"—"` si pas de timestamp.
 */
export function formatTimelineTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
