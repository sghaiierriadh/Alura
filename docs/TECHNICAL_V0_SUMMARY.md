# TECHNICAL_V0_SUMMARY

## 1) Schema `public.agents`

Source: `src/types/database.types.ts`

### Row

- `id: string`
- `user_id: string`
- `company_name: string | null`
- `sector: string | null`
- `description: string | null`
- `faq_data: Json | null`
- `created_at: string`
- `updated_at: string`

### Insert

- `id?: string`
- `user_id: string`
- `company_name?: string | null`
- `sector?: string | null`
- `description?: string | null`
- `faq_data?: Json | null`
- `created_at?: string`
- `updated_at?: string`

### Update

- `id?: string`
- `user_id?: string`
- `company_name?: string | null`
- `sector?: string | null`
- `description?: string | null`
- `faq_data?: Json | null`
- `created_at?: string`
- `updated_at?: string`

## 2) Schema `public.leads` et `public.lead_complaints` (multi-tickets)

### `leads`

- Row: `id`, `agent_id`, `email`, `phone`, `full_name`, `last_question`, `created_at`
- Une ligne par soumission du formulaire de capture (coordonnees + derniere question utile).

### `lead_complaints`

- Row: `id`, `lead_id`, `content`, `created_at`
- **Plusieurs lignes possibles pour le meme `lead_id`**: chaque insertion represente un ticket / une reclamation associee au lead.
- Premiere insertion souvent lors de `captureLead` si le texte de reclamation est juge significatif.
- Insertions ulterieures via `addLeadComplaint` (appele depuis `/api/chat` quand le client envoie un `leadId` et qu'une nouvelle question utilisateur est traitee).

**Schéma SQL de reference** (aligné sur `src/types/database.types.ts`; types exacts en base Supabase a verifier lors des migrations) :

```sql
-- Plusieurs tickets par lead (relation 1-N)
CREATE TABLE public.lead_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_complaints_lead_id_idx ON public.lead_complaints (lead_id);
```

## 3) Schema `public.messages`

- Row: `id`, `session_id`, `agent_id`, `role`, `content`, `created_at`
- Ecriture **canonique des tours de conversation** via `POST /api/chat` (`src/app/api/chat/route.ts`), qui enchaine l'action serveur `saveMessage` (`src/app/actions/save-message.ts`) pour le message **user** avant Gemini et pour la reponse **assistant** apres fin de stream (texte sans marqueur lead). Ne pas s'appuyer sur un historique « uniquement client » comme source de verite.
- Exception mineure: message assistant de suivi post-capture (`ChatPanel` → Server Action `saveMessage` pour le texte fixe de confirmation), toujours persiste en base serveur.

**Schéma SQL de reference** :

```sql
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_session_id_idx ON public.messages (session_id);
CREATE INDEX messages_agent_id_idx ON public.messages (agent_id);
```

## 4) Structure JSONB `faq_data`

### Format canonique d'ecriture

Ecrit via `toFaqJsonb()` (`src/lib/knowledge/faq-data.ts`) :

```json
[
  { "question": "string", "answer": "string" },
  { "question": "string", "answer": "string" }
]
```

### Formats acceptes en lecture (normalisation)

`parseFaqData()` accepte :

1. Tableau canonique d'objets `{ question, answer }`
2. Ancien format onboarding: tableau de `string`

Exemple ancien format:

```json
["livraison en 48h", "retours sous 14 jours"]
```

Normalise en:

```json
[
  { "question": "Point 1", "answer": "livraison en 48h" },
  { "question": "Point 2", "answer": "retours sous 14 jours" }
]
```

## 5) Server Actions - Edition des connaissances

Source: `src/app/actions/update-knowledge.ts`

### Types de retour

`KnowledgeActionResult`:
- succes: `{ ok: true, items: FaqPair[] }`
- erreur: `{ ok: false, error: string }`

### Resolution du contexte d'ecriture

`getWriteContext()`:
- mode POC si `POC_SAVE_AGENT_USER_ID` + `SUPABASE_SERVICE_ROLE_KEY` sont valides
- sinon mode session via `createClient()` + `auth.getUser()`
- cible toujours une ligne `agents` par `user_id`

### Lecture + ecriture

- lecture: `select("faq_data").eq("user_id", ctx.userId).maybeSingle()`
- ecriture: `update({ faq_data: toFaqJsonb(pairs) }).eq("user_id", ctx.userId)`
- revalidation: `revalidatePath("/knowledge")` et `revalidatePath("/onboarding")`

### Actions exposees

- `updateKnowledgePair(index, question, answer)`
  - controle index
  - remplace une entree
- `addKnowledgePair(question, answer)`
  - ajoute une nouvelle paire
- `deleteKnowledgePair(index)`
  - controle index
  - supprime une entree
- `replaceKnowledgeFaq(items)`
  - remplace completement le tableau apres nettoyage `.trim()`

## 6) Actions `saveMessage`, `captureLead`, `addLeadComplaint`

### `saveMessage`

- Input: `{ sessionId, agentId, role: "user" | "assistant", content }`
- Insert dans `messages` (verification que l'agent appartient au user ou au POC).

### `captureLead`

- Input: `agentId`, coordonnees, `lastQuestion` / `previousQuestion` (resolution du texte de reclamation via heuristiques).
- Insert `leads` + eventuellement premiere ligne `lead_complaints` si reclamation significative.

### `addLeadComplaint`

- Input: `agentId`, `leadId`, `lastQuestion`, `previousQuestion?`
- Verifie lead + agent; insert `lead_complaints` ou `skipped` si texte trop faible.

## 7) Logique API `/api/chat` et construction du prompt

Source: `src/app/api/chat/route.ts`

### Input attendu (corps JSON)

```json
{
  "agentId": "uuid-string",
  "message": "question utilisateur courante",
  "sessionId": "uuid-string",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "leadCapturedThisSession": false,
  "userFirstName": "",
  "leadId": ""
}
```

- `sessionId` est **obligatoire** (sinon 400).
- `leadId` non vide: en fin de stream, appel `addLeadComplaint` pour enregistrer la question courante comme nouveau ticket lie au lead.
- `leadCapturedThisSession` / `userFirstName`: adapte le prompt systeme (ton post-capture).

### Etapes serveur (ordre contractuel)

La persistance des messages de la conversation courante est **centralisee dans cette route** (pas de parallele « sauvegarde client seule » pour les echanges user/assistant issus du stream).

1. Validation JSON + `agentId` + `message` + `sessionId`
2. Chargement agent via `fetchAgentByIdForChat(agentId)`
3. **`saveMessage` role `user`** avec le `message` courant
4. Construction `systemInstruction` (incl. contexte lead si capture)
5. Conversion historique `messages` -> format Gemini
6. Streaming Gemini
7. En fin de stream: **`saveMessage` role `assistant`** sur le texte final (sans marqueur lead)
8. Si `leadId` present: **`addLeadComplaint`** avec question derivee de l'historique + message courant

### Prompt systeme effectif

Construit dans `src/lib/ai/alura-chat-prompt.ts` avec:
- identite: "Tu es Alura, une conseillère experte pour [Nom]"
- description generale entreprise
- bloc connaissances exclusives derive de `faq_data`:
  - `Q : ...`
  - `R : ...`
- consignes comportementales:
  - ton humain/chaleureux/concis
  - prioriser FAQ
  - si inconnu: proposer collecte de coordonnees pour escalade humaine
  - ne pas inventer d'acces externes

### Fallback de connaissance

Si `faq_data` vide/non structure:
- le prompt injecte explicitement qu'il faut surtout s'appuyer sur la description entreprise
- comportement degrade mais robuste (pas de blocage)

## 8) Widget technique

- `src/lib/agents/fetch-agent-widget.ts`: lecture `agents` (id, company_name) par **service role** pour `/widget`.
- `src/app/(widget)/layout.tsx`: conteneur `h-dvh`, `overflow-hidden`, sans marges parasites.
- `src/app/(widget)/widget/page.tsx`: `ChatPanel` avec `layout="embedded"`.
- `src/app/(widget)/embed/page.tsx`: `ChatLauncher` pour integration tiers.
- `src/components/chat-launcher.tsx`: iframe `/widget?agentId=...`, montage persistant apres premier open (etat conversation conserve a la fermeture du panneau).
