/** Utilitaires purs pour le texte de réclamation (hors `"use server"`). */

export function normalizeOptional(value?: string | null): string | null {
  const v = value?.trim() ?? "";
  return v.length > 0 ? v : null;
}

function looksLikeWeakQuestion(text: string | null): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (cleaned.length < 12) return true;
  const tokens = cleaned.split(/\s+/);
  if (tokens.length <= 2) return true;
  return !/[?]/.test(cleaned) && cleaned.length < 20;
}

export function resolveComplaintText(
  lastQuestion: string | null,
  previousQuestion: string | null,
): string | null {
  if (!looksLikeWeakQuestion(lastQuestion)) return lastQuestion;
  if (!looksLikeWeakQuestion(previousQuestion)) return previousQuestion;
  return lastQuestion ?? previousQuestion;
}

export function isMeaningfulComplaint(text: string | null): text is string {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length < 8) return false;
  const trivial = new Set([
    "ok",
    "okay",
    "merci",
    "thanks",
    "thx",
    "super",
    "d'accord",
    "dak",
    "c bon",
  ]);
  if (trivial.has(normalized)) return false;
  return !looksLikeWeakQuestion(normalized);
}

/** Texte ticket aligné sur `addLeadComplaint` (null si le message ne constitue pas une réclamation exploitable). */
export function buildComplaintTextForTicket(
  lastQuestion: string | null,
  previousQuestion: string | null,
): string | null {
  const t = resolveComplaintText(
    normalizeOptional(lastQuestion),
    normalizeOptional(previousQuestion),
  );
  return isMeaningfulComplaint(t) ? t : null;
}
