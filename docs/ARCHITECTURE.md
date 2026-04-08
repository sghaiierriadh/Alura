# Architecture V0 - Flux RAG Alura

Ce document explique le flux de donnees de la V0: de l'ingestion (PDF/URL) jusqu'au streaming de reponse dans le chat.

## 1) Ingestion des connaissances

### Option A - PDF

- UI: `src/app/(dashboard)/onboarding/page.tsx`
- Action serveur: `src/app/actions/analyze-doc.ts`
- Pipeline:
  - extraction texte via `pdf-parse`
  - prompt de structuration vers Gemini
  - sortie JSON normalisee:
    - `companyName`
    - `sector`
    - `description`
    - `faqHighlights`

### Option B - URL (multi-pages)

- Action serveur: `src/app/actions/analyze-url.ts`
- Pipeline:
  - fetch HTML de la home
  - detection de liens internes strategiques (`faq`, `about`, `services`, etc.)
  - scraping parallele (`Promise.all`) des pages cibles
  - nettoyage DOM (sans scripts/nav/footer)
  - fusion en `fullWebsiteContext`
  - extraction JSON via Gemini

## 2) Persistance dans Supabase

- Action serveur: `src/app/actions/save-agent.ts`
- Table: `public.agents`
- Champs ecrits:
  - `company_name`
  - `sector`
  - `description`
  - `faq_data` (JSONB)
- Strategie:
  - `upsert` avec `onConflict: "user_id"` pour eviter les doublons
  - mode session (`supabase.auth.getUser()`) ou mode POC (`POC_SAVE_AGENT_USER_ID`)

## 3) Gestion de la connaissance

- Page: `src/app/(dashboard)/knowledge/page.tsx`
- UI client: `src/app/(dashboard)/knowledge/knowledge-view.tsx`
- Actions CRUD: `src/app/actions/update-knowledge.ts`
- Normalisation JSONB:
  - parse via `src/lib/knowledge/faq-data.ts`
  - ecriture homogène en tableau d'objets:
    - `{ question: string, answer: string }`

## 4) Construction du contexte RAG

- Endpoint: `src/app/api/chat/route.ts`
- Lecture agent:
  - helper `src/lib/agents/fetch-agent-chat.ts`
  - recupere `company_name`, `description`, `faq_data`
- Prompt systeme:
  - helper `src/lib/ai/alura-chat-prompt.ts`
  - assemble:
    - identite d'Alura
    - nom entreprise
    - description generale
    - base FAQ exclusive
  - fallback prevu si FAQ vide: utiliser au mieux la description

## 5) Generation et streaming de reponse

- Modele cible: `gemini-2.5-flash` (fallback `gemini-1.5-flash`)
- Historique: tableau `messages` (`user` / `assistant`) converti vers l'historique Gemini
- Generation:
  - `startChat({ history })`
  - `sendMessageStream(message)`
- Streaming HTTP:
  - conversion des chunks Gemini en `ReadableStream<Uint8Array>`
  - `Content-Type: text/plain; charset=utf-8`
  - affichage progressif dans l'UI de chat

## 6) Boucle client (Chat UI)

- Page: `src/app/(dashboard)/chat/page.tsx`
- Panneau client: `src/app/(dashboard)/chat/chat-panel.tsx`
- Flux:
  - envoi `agentId + message + messages` vers `/api/chat`
  - lecture progressive du stream
  - update du dernier message assistant en temps reel
  - auto-scroll a chaque chunk

## 7) Robustesse V0

- Validation des inputs API (`agentId`, `message`)
- Gestion erreurs modele/cle API
- Fallback modele Gemini si indisponibilite
- Fallback contextuel si base FAQ incomplete
- Separation nette:
  - actions serveur (ingestion, persistance, CRUD)
  - route API chat (RAG + stream)
  - UI client (etat conversation)
