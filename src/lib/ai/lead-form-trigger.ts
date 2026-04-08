/** Marqueur machine-only : la UI le détecte et ne l’affiche jamais à l’utilisateur. */
export const LEAD_FORM_TRIGGER = "[TRIGGER_LEAD_FORM]" as const;

export function hasLeadFormTrigger(text: string): boolean {
  return text.includes(LEAD_FORM_TRIGGER);
}

export function stripLeadFormTrigger(text: string): string {
  return text.split(LEAD_FORM_TRIGGER).join("").replace(/\s+$/u, "");
}
