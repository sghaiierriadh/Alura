/**
 * Point de référence pour la configuration Google AI / Supabase liée à l’ingestion
 * et aux embeddings dans Alura.
 *
 * Variables d’environnement utilisées par le code actuel (pas de `GOOGLE_API_KEY` :
 * le SDK `@google/generative-ai` attend `GEMINI_API_KEY`).
 *
 * | Variable | Obligatoire | Rôle |
 * |----------|-------------|------|
 * | `GEMINI_API_KEY` | Oui (génération + embeddings) | Clé API Google AI Studio / Generative Language API pour `generateContent` et `embedContent` (REST dans `gemini-embedding-rest.ts`). |
 * | `GEMINI_MODEL` | Non | Modèle de chat / JSON pour l’analyse document (non-template) et le site web (`website-scraper.ts`, `analyze-doc.ts`). Défaut : `gemini-1.5-flash` (doc) ou `gemini-2.5-flash` (site) selon le module. |
 * | `NEXT_PUBLIC_SUPABASE_URL` | Oui (persistance `knowledge`, `agents`) | URL du projet Supabase. |
 * | `SUPABASE_SERVICE_ROLE_KEY` | Conditionnel | Côté serveur : widget / API chat sans session (messages, leads, `match_knowledge`) — contourne la RLS ; ne jamais exposer au client. |
 *
 * Autres variables utiles mais hors périmètre strict Gemini :
 * - `WIDGET_CSP_FRAME_ANCESTORS` — en-têtes iframe widget (`next.config.ts`).
 *
 * Voir aussi : `DOCS/KNOWLEDGE_ARCHITECTURE.md`, `src/lib/ai/gemini-embedding-rest.ts`.
 */

export {};
