# Architecture V0 - Flux RAG Alura

Ce document explique le flux de donnees de la V0: de l'ingestion (PDF/URL) jusqu'au streaming de reponse dans le chat, incluant leads multi-tickets et widget iframe.

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
  - ecriture homogene en tableau d'objets:
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
  - variante si lead deja capture dans la session (prenom, ton adapte)

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

## 6) Sauvegarde serveur des messages (source de verite)

- Action serveur: `src/app/actions/save-message.ts` → table `public.messages` (`session_id`, `agent_id`, `role`, `content`).
- La route `/api/chat` enchaine obligatoirement:
  1. **Avant** l'appel Gemini: `saveMessage` pour le message **utilisateur** courant.
  2. **Apres** la fin du stream: `saveMessage` pour la reponse **assistant** (texte sans marqueur lead).
- Le client envoie `sessionId` (obligatoire), et optionnellement `leadCapturedThisSession`, `userFirstName`, `leadId` pour le contexte prompt et les tickets.

Ne pas s'appuyer uniquement sur l'etat React pour l'historique durable: toute nouvelle fonctionnalite chat doit rester alignee sur cette sequence API + `saveMessage`. Exception documentee: apres soumission reussie du formulaire lead, `ChatPanel` peut enregistrer un message assistant de suivi via la Server Action `saveMessage` (toujours ecriture serveur dans `messages`, pas un enregistrement « navigateur seul »).

## 7) Leads et multi-tickets (`lead_complaints`)

- Table `public.leads`: une ligne par capture (coordonnees visiteur, `last_question` resume).
- Table `public.lead_complaints`: relation **1-N** avec `public.leads` via `lead_id` (FK). **Plusieurs lignes par `lead_id`**: chaque ligne = un ticket / reclamation textuelle (`content`, horodatage `created_at`).
- Action `captureLead` (`src/app/actions/capture-lead.ts`): insert `leads` +, si la question est jugee pertinente, **premier** enregistrement dans `lead_complaints`.
- Action `addLeadComplaint` (`src/app/actions/capture-lead.ts`): ajoute un **nouveau** ticket pour un `leadId` existant (verifie que le lead appartient a l'`agentId`). Le filtre « intention » / texte trop court est centralise dans cette action (`skipped` si non significatif).
- La route `POST /api/chat` (`src/app/api/chat/route.ts`), en fin de stream, appelle **systematiquement** `addLeadComplaint` lorsque le corps de requete contient un `leadId` non vide (session deja identifiee cote client apres capture); l'insertion effective depend du resultat de `isMeaningfulComplaint` cote serveur.

Marqueur cote modele: `LEAD_FORM_TRIGGER` (voir `src/lib/ai/lead-form-trigger.ts`); le client masque ce marqueur a l'affichage et declenche le formulaire lead.

## 8) Widget embarque (iframe)

- **Groupe de routes Next.js `(widget)`** (`src/app/(widget)/`): le dossier entre parentheses est un *route group* — il **n'ajoute pas** de segment dans l'URL (les pages restent `/widget`, `/embed`, etc.). Layout dedie: pleine hauteur (`h-dvh` / `max-h-dvh`), `overflow-hidden`, sans marges parasites (`src/app/(widget)/layout.tsx`).
- **Route `/widget`** (`src/app/(widget)/widget/page.tsx`): page chargee **dans l'iframe**; URL publique `https://<origine>/widget?agentId=<uuid>`. L'agent est resolu cote serveur par `fetchAgentForWidget` (service role, `SUPABASE_SERVICE_ROLE_KEY` requis). Rendu: `ChatPanel` avec `layout="embedded"` (scroll interne sur la liste, pied de saisie fixe).
- **Route `/embed`** (`src/app/(widget)/embed/page.tsx`): page **pour le site tiers**; query obligatoire `?agentId=<uuid>`. Affiche `ChatLauncher` (bouton + panneau). L'iframe a l'interieur pointe vers `/widget?agentId=...` sur la meme origine Alura (ou `baseUrl` si passe au composant).
- **Keep-alive `ChatLauncher`** (`src/components/chat-launcher.tsx`): au premier clic, `iframePersist` passe a `true` et l'`<iframe>` reste dans le DOM. A la fermeture du panneau, l'iframe n'est **pas** demontee: elle est **masquee** via classes Tailwind (`opacity-0`, `pointer-events-none`, `scale-95`, et conteneur `pointer-events-none` quand le panneau est ferme) pour conserver session React, `sessionStorage` et conversation dans l'iframe.

## 9) Boucle client (Chat UI)

- Page dashboard: `src/app/(dashboard)/chat/page.tsx`
- Panneau client: `src/app/(dashboard)/chat/chat-panel.tsx`
- Flux:
  - `sessionId` stable en `sessionStorage` par agent
  - envoi `agentId + message + messages + sessionId + ...` vers `/api/chat`
  - lecture progressive du stream
  - update du dernier message assistant en temps reel
  - auto-scroll (y compris visibilite onglet, comportement adapte pendant le stream)
- Mode `layout="embedded"`: adapte le flex / `min-h-0` pour iframe hauteur fixe.

## 10) Robustesse V0

- Validation des inputs API (`agentId`, `message`, `sessionId`)
- Gestion erreurs modele/cle API
- Fallback modele Gemini si indisponibilite
- Fallback contextuel si base FAQ incomplete
- Separation nette:
  - actions serveur (ingestion, persistance, CRUD, messages, leads)
  - route API chat (RAG + stream + sauvegardes + tickets)
  - UI client (etat conversation, widget)
- `devIndicators: false` dans `next.config.ts` pour ne pas afficher l'indicateur de dev Next sur le widget en local.
