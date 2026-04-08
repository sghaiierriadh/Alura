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

## 2) Structure JSONB `faq_data`

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

## 3) Server Actions - Edition des connaissances

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

## 4) Logique API `/api/chat` et construction du prompt

Source: `src/app/api/chat/route.ts`

### Input attendu

```json
{
  "agentId": "uuid-string",
  "message": "question utilisateur courante",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Etapes serveur

1. Validation JSON + `agentId` + `message`
2. Chargement agent via `fetchAgentByIdForChat(agentId)`
   - session user (`user_id` doit correspondre) ou mode POC
3. Construction `systemInstruction` via `buildAluraSystemInstruction(company_name, description, faq_data)`
4. Conversion historique `messages` -> format Gemini (`user` / `model`)
5. Initialisation Gemini:
   - modele principal: `GEMINI_MODEL` (sans point final) ou `gemini-2.5-flash`
   - fallback si model not found: `gemini-1.5-flash`
6. Streaming:
   - `startChat({ history })`
   - `sendMessageStream(message)`
   - chunks textes convertis en `ReadableStream<Uint8Array>`

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
