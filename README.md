# Alura - Conseiller client intelligent

Alura est une plateforme qui transforme les contenus d'une entreprise (PDF, site web, FAQ) en un conseiller conversationnel utile, humain et aligné avec la marque.

V0 couvre :
- Onboarding intelligent (PDF + URL multi-pages)
- Extraction et structuration des connaissances via Gemini
- Sauvegarde dans Supabase
- Edition de la base de connaissance
- Chat RAG en streaming

## Pitch

Alura aide les equipes a deployer un conseiller client specialise en quelques minutes, sans pipeline ML complexe :
- ingestion des contenus metier,
- synthese automatique des informations clefs,
- base de connaissance editable,
- reponses contextuelles et escalade humaine quand necessaire.

## Stack technique

- Frontend: Next.js App Router (TypeScript, React 19)
- UI: Tailwind CSS, Framer Motion, Sonner, Lucide
- IA: Gemini (`gemini-2.5-flash`) via `@google/generative-ai`
- Data: Supabase (Postgres + JSONB + RLS)
- Parsing: `pdf-parse`, `cheerio`
- Runtime: Node.js 18+

## Demarrage rapide

### 1) Prerequis

- Node.js 18+
- Un projet Supabase
- Une cle Gemini

### 2) Installation

```bash
npm install
```

### 3) Variables d'environnement

Creer ou completer `.env.local` :

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# Option POC (sans session utilisateur)
POC_SAVE_AGENT_USER_ID=...
```

### 4) Lancer le projet

```bash
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Routes principales

- `/onboarding` : ingestion PDF/URL + activation de l'agent
- `/knowledge` : edition CRUD de `faq_data`
- `/chat` : interface conversationnelle en streaming
- `POST /api/chat` : endpoint RAG (agent + historique + stream Gemini)

## Documentation

- `docs/ARCHITECTURE.md` : flux RAG de bout en bout
- `docs/ROADMAP.md` : progression V0 et objectifs V1
