# V2.1 - Reference Technique Complete

Ce document consolide tout ce qui a ete implemente en v2.1 pour garantir une base fiable lors des prochaines sessions.
Objectif : ne perdre aucun connecteur, aucune regle de priorisation IA, aucun flux SQL, et aucun lien UI.

## 1) Vision globale de la v2.1

La v2.1 met en place une architecture conversationnelle "outils d'abord" avec :
- une cascade d'intelligence explicite (Knowledge -> Catalogue `business_records` -> API Expert -> Live Search),
- une boucle d'apprentissage persistante (`learning_suggestions`) alimentee par les recherches live utiles,
- une UI de gouvernance dans `/knowledge` pour valider, rejeter et visualiser les donnees importees/validees,
- une rigueur de prompt qui force l'usage des outils avant toute reponse basee sur la culture generale.

## 2) Cascade d'intelligence (Chat runtime)

## 2.1 Route principale

Fichier central : `src/app/api/chat/route.ts`

Responsabilites :
- recuperation de l'agent (`fetchAgentByIdForChat`),
- construction du `systemInstruction` (`buildAluraSystemInstruction`),
- execution du chat Gemini avec tool-calling,
- sauvegarde du message utilisateur et assistant,
- declenchement de la boucle d'apprentissage.

## 2.2 Outils branches dans Gemini

Declaration/outillage :
- `src/lib/ai/chat-gemini-tools.ts`
- `src/lib/ai/business-records-tool.ts`
- `src/lib/ai/client-api-tool.ts`
- `src/lib/ai/live-search-gemini-tool.ts`

Connecteurs exposes au modele :
- `search_records`
  - but : requete precise dans le catalogue interne `business_records` (FTS).
  - execution serveur : `searchRecords(...)`.
- `call_expert_api`
  - but : interroger l'API temps reel client (endpoint configure).
  - execution serveur : `callClientApi(...)`.
- `liveSearch`
  - but : verifier/chercher sur le site public de l'entreprise.
  - execution serveur : `liveSearch(...)`.

## 2.3 Priorisation des sources

Hierarchie imposee dans le prompt :
1. Knowledge locale (FAQ + extraits knowledge injectes),
2. Catalogue `business_records`,
3. API Expert (temps reel),
4. Live Search (dernier recours).

Cette hierarchie est dynamique selon disponibilite des connecteurs de session :
- `catalogSearchEnabled`,
- `expertApiEnabled`,
- `liveSearchEnabled`.

## 3) Rigueur IA (System Prompt)

Fichier : `src/lib/ai/alura-chat-prompt.ts`

Renforcements cle v2.1 :
- strategie "outils avant culture generale" pour toutes questions entreprise-specifiques,
- obligation stricte :
  - si question sur partenaire/prix/avantage et info exacte absente de la knowledge locale,
  - utilisation obligatoire de `search_records` (si dispo) puis `liveSearch` (si necessaire et dispo),
  - interdiction de repondre "je ne sais pas" / "je n'ai pas l'information" sans avoir epuise les outils disponibles,
- regle explicite partenaire/avantage :
  - si le message contient ces notions, `liveSearch` doit etre tente pour validation (quand actif),
  - meme si une reponse de culture generale semble plausible.

Resultat :
- baisse des reponses hypothetique/non-verifiees,
- augmentation des reponses ancrees sur donnees reelles de l'entreprise.

## 4) Connecteurs techniques et prerequis

## 4.1 `search_records` (catalogue interne)

- source SQL : table `public.business_records`,
- indexation recherche : colonne `search_vector` (`tsvector`),
- type DB : `src/types/database.types.ts` (structure `business_records`),
- usage : extraction d'infos precises (prix, partenaires, offres, attributs).

## 4.2 `call_expert_api` (temps reel client)

- prerequis agent :
  - `agents.api_endpoint` renseigne,
  - `agents.api_key` si necessaire cote client API,
- usage : donnees dynamiques critiques (stock, statut commande, etc.).

## 4.3 `liveSearch` (web public)

- prerequis systeme :
  - `SERPER_API_KEY` present,
- prerequis agent :
  - `agents.website_url` renseigne,
- usage : verification en dernier recours et validation de faits externes au corpus interne.

## 4.4 Conditions d'activation en session

Dans `route.ts` :
- `liveSearchEnabledForAgent = SERPER_API_KEY && website_url`,
- `expertApiEnabledForAgent = api_endpoint present`,
- `catalogSearchEnabled = true` (outil branche cote chat lorsque disponible dans pack outillage).

## 5) SQL et persistence (v2.1)

## 5.1 Tables metier deja exploitees

- `agents`
  - parametres connecteurs (`api_endpoint`, `api_key`, `website_url`, etc.),
  - contenu knowledge initial (`faq_data`, `description`, ...).
- `business_records`
  - catalogue structure (CSV + fiches validees depuis learning center),
  - colonnes cle : `title`, `description`, `value`, `category`, `metadata`, `search_vector`, `created_at`.
- `knowledge`
  - base FAQ/knowledge, incluant `source = human_resolution`.

## 5.2 Boucle d'apprentissage persistante

- table : `learning_suggestions`,
- migration : `supabase/migrations/20260420160000_learning_suggestions.sql`,
- objectif : stocker des suggestions "question -> reponse proposee" apres recherche pertinente, puis validation humaine.

Actions serveur associees :
- fichier : `src/app/actions/save-learning-suggestion.ts`,
- fonctions principales :
  - `saveLearningSuggestion(...)`,
  - `listPendingLearningSuggestions(...)`,
  - `validateLearningSuggestionAsBusinessRecord(...)`,
  - `validateLearningSuggestionAsFaq(...)`,
  - `rejectLearningSuggestion(...)`.

Mode d'acces DB :
- utilisation de `supabaseAdmin` (service role) pour les ecritures sensibles de la boucle learning.

## 6) Learning Loop (pipeline complet)

## 6.1 Pendant le chat

Dans `route.ts` :
1. Le modele repond et peut appeler des outils.
2. Si `liveSearch` retourne des snippets exploitables :
   - flag `liveSearchSucceededThisTurn = true`.
3. Le message assistant final est sauvegarde.
4. Si conditions remplies (question + reponse + recherche utile) :
   - `await saveLearningSuggestion(...)` en synchrone.

Instrumentation :
- logs `>>> [LEARNING] ...` pour tracer le chemin et diagnostiquer les non insertions.

## 6.2 Correction v2.1 : forcer la validation sur mots-cles

Correctif implemente :
- detection regex sur message utilisateur : `\b(partenaire|avantage)\b` (insensible a la casse),
- si `liveSearch` n'a pas deja reussi ce tour et que `liveSearch` est active :
  - tentative serveur forcee `liveSearch(message, websiteBaseForLive)`,
  - si snippets utiles, la suggestion est eligible a la sauvegarde (`learningSearchSucceeded`).

Impact :
- evite de rater des opportunites de suggestion quand le modele repond "de tete" sur des sujets sensibles au catalogue.

## 6.3 Validation humaine

UI : `LearningCenter`
- consultation des suggestions en attente,
- actions :
  - valider vers `business_records`,
  - valider vers FAQ/knowledge,
  - rejeter.

But :
- maintenir une base fiable et incrementale,
- transformer les reponses verifiees en connaissance proprietaire reutilisable.

## 7) UI Knowledge (ergonomie v2.1)

## 7.1 Deplacement du Learning Center

Avant :
- `LearningCenter` etait dans `/settings`.

Maintenant :
- `LearningCenter` deplace vers `/knowledge` dans un nouvel onglet/section.

Fichiers touches :
- `src/app/(dashboard)/settings/page.tsx` (suppression du bloc Learning Center),
- `src/app/(dashboard)/knowledge/page.tsx`,
- `src/app/(dashboard)/knowledge/knowledge-view.tsx`.

## 7.2 Nouvelle section "Catalogue & Donnees" dans `/knowledge`

Ajouts majeurs :
- onglets dans `KnowledgeView` :
  - `FAQ & base`,
  - `Catalogue & Donnees`.
- dans `Catalogue & Donnees` :
  - composant `LearningCenter`,
  - tableau simple listant les lignes de `business_records`.

Colonnes affichees :
- `title`,
- `description`,
- `value`,
- `category`,
- `metadata` (serialize/tronque),
- `created_at` (format local FR).

## 7.3 Chargement serveur des `business_records`

Nouveau module :
- `src/lib/knowledge/fetch-business-records.ts`

Fonction :
- `fetchBusinessRecordsForAgent(agentId)`

Garanties :
- verification propriete agent via `user_id` courant (contexte dashboard),
- lecture filtree sur `agent_id`,
- tri `created_at desc`,
- limite de securite de lecture (500 lignes).

Injection UI :
- `knowledge/page.tsx` charge records + FAQ + knowledge tickets,
- passe a `KnowledgeView` via props (`businessRecords`, `agentId`, ...).

## 8) Fichiers cle modifies/ajoutes en v2.1

Prompt / IA :
- `src/lib/ai/alura-chat-prompt.ts`
- `src/app/api/chat/route.ts`
- `src/lib/ai/chat-gemini-tools.ts`
- `src/lib/ai/business-records-tool.ts`
- `src/lib/ai/client-api-tool.ts`
- `src/lib/ai/live-search-gemini-tool.ts`

Learning loop :
- `src/app/actions/save-learning-suggestion.ts`
- `supabase/migrations/20260420160000_learning_suggestions.sql`

UI knowledge/settings :
- `src/app/(dashboard)/knowledge/page.tsx`
- `src/app/(dashboard)/knowledge/knowledge-view.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/components/dashboard/LearningCenter.tsx`
- `src/lib/knowledge/fetch-business-records.ts` (nouveau)

Types / schema :
- `src/types/database.types.ts`

## 9) Garanties fonctionnelles obtenues

- L'assistant privilegie des sources verifiables et contextualisees entreprise.
- Les sujets "partenaire / prix / avantage" ne se terminent plus en "je ne sais pas" sans tentative outillee.
- Les signaux live utiles alimentent une boucle d'apprentissage persistee.
- L'equipe dispose d'un point unique `/knowledge` pour :
  - gouverner les suggestions,
  - visualiser le catalogue reel ingere.

## 10) Points de vigilance pour prochaines sessions

- Toujours verifier les prerequis env avant debug :
  - `GEMINI_API_KEY`,
  - `SERPER_API_KEY` (si live search attendu),
  - config agent `website_url` et `api_endpoint`.
- Ne pas casser la hierarchie de sources dans le prompt.
- Conserver la logique de forcat `partenaire|avantage` si refactor de `route.ts`.
- Si ajout de nouveaux connecteurs, les documenter ici dans :
  - prerequis,
  - priorisation,
  - impact learning loop,
  - surface UI.

---

Reference v2.1 generee pour servir de base de continuites multi-session.
