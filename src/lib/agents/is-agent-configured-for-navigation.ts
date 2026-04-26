import type { AgentRow } from "@/lib/agents/server-access";

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Indique si l’agent est considéré comme « déjà configuré » pour la navigation
 * (libellé « Sources & Identité » au lieu de « Mise en route »).
 *
 * `company_name` vide (`""`) ou uniquement des espaces compte comme **non**
 * configuré (ex. après reset agent).
 *
 * Il n’y a pas de colonnes `name` / `branding` en base : on approxime ainsi :
 * - **Nom** : `company_name` renseigné (nom commercial après activation).
 * - **Branding / identité** : au moins un signal parmi couleur de thème, message
 *   d’accueil, avatar, nom du bot personnalisé (≠ « Alura »), ou champs profil
 *   remplis à l’activation (`sector`, `description`) pour couvrir le parcours
 *   onboarding juste après `saveAgent`.
 */
export function isAgentConfiguredForNavigation(agent: AgentRow | null): boolean {
  if (!agent) return false;
  if (!nonEmpty(agent.company_name)) return false;
  return (
    nonEmpty(agent.theme_color) ||
    nonEmpty(agent.welcome_message) ||
    nonEmpty(agent.avatar_url) ||
    (() => {
      const t = agent.chatbot_name?.trim();
      return typeof t === "string" && t.length > 0 && t.toLowerCase() !== "alura";
    })() ||
    nonEmpty(agent.sector) ||
    nonEmpty(agent.description)
  );
}
