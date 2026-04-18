# Architecture de la connaissance (RAG) — Alura

Ce document décrit comment les contenus issus du **template FAQ** (PDF/DOCX), du **site web** (scraping) et des **résolutions de tickets** alimentent la table `public.knowledge` et les embeddings **768 dimensions** (`pgvector`).

## 1. Schéma cible : `public.knowledge`

| Colonne | Type | Rôle |
|---------|------|------|
| `id` | `uuid` | Identifiant ligne. |
| `agent_id` | `uuid` → `agents.id` | **Cloisonnement** : toute ligne est liée à un seul agent. |
| `question` | `text` | Libellé court ou titre (ex. `PILIER 1 : …`, sujet d’un fait curé, question FAQ). |
| `answer` | `text` | Corps du bloc (contenu pilier, fait détaillé, réponse). |
| `source` | `text` | Origine sémantique : `template_upload`, `website_scraping`, `human_resolution`, etc. |
| `embedding` | `vector(768)` | Vecteur sémantique pour `match_knowledge`. |
| `created_at` | `timestamptz` | Horodatage. |

Les embeddings sont sérialisés côté client Supabase comme une chaîne littérale pgvector : `[v1,v2,…]` (voir `vectorToPgString` dans `src/lib/ai/gemini-embedding-rest.ts`).

## 2. Modèle d’embedding

- **Primaire** : `gemini-embedding-001` via l’API REST `embedContent` (v1 / v1beta selon disponibilité).
- **Secours** : `text-embedding-004` si le premier échoue.
- **Dimension** : **768** — alignée sur la colonne `embedding vector(768)` (voir `manual_apply_knowledge.sql`).

## 3. Flux Template (Option A — fichier stratégique)

1. **Extraction** : PDF (`pdf-parse`) ou DOCX (`mammoth`) → texte brut.
2. **Parsing par Piliers** (`parsePillarsFromText` dans `src/lib/knowledge/parse-pillars.ts`) : détection des sections `PILIER 1..4`, pré-remplissage profil, blocs pour RAG.
3. **Persistance profil** : `saveAgent` → table `agents` (FAQ highlights, description, etc.).
4. **Indexation RAG** : à la confirmation onboarding, `saveTemplateKnowledge` insère une ligne par pilier avec `source = 'template_upload'`, embedding du couple `question \n answer`.

## 4. Flux Site web (Option B)

1. **Scraping** (`src/lib/ingestion/website-scraper.ts`) : pages accueil + liens internes stratégiques (FAQ, CGV, …), contenu nettoyé (cheerio, `main` / `article`).
2. **Curation IA** : deux appels Gemini en parallèle — profil JSON (`companyName`, …) et liste de **faits** `{ topic, content }` à partir du texte agrégé (pas d’insertion brute du HTML).
3. **Persistance profil** : `saveAgent`.
4. **Indexation RAG** : `saveWebsiteKnowledge` avec `source = 'website_scraping'`, une ligne par fait, embedding `topic + content`.

**UI** : progression temps réel via `POST /api/onboarding/analyze-url` (flux NDJSON).

## 5. Feedback tickets (résolution humaine)

- Action `addKnowledgeFromResolution` (`src/app/actions/add-knowledge-from-resolution.ts`) : lorsqu’un admin valide une résolution liée à un ticket, insertion dans `knowledge` avec `source = 'human_resolution'` et embedding sur `question + answer`.

## 6. Consommation au chat

- RPC PostgreSQL `match_knowledge(p_agent_id, query_embedding, match_count)` : recherche par similarité cosinus sur les vecteurs non nuls, filtrée par `agent_id`.

Pour le détail du flux chat global, voir `docs/ARCHITECTURE.md`.
