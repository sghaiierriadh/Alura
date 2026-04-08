# Roadmap Alura

## V0 - Termine

### Sprint 1 - Cerveau & fondations

- [x] Blueprint produit (identite, ton, escalade)
- [x] Setup Next.js App Router (dashboard + API)
- [x] Setup Supabase + variables d'environnement
- [x] Base Gemini operationnelle

### Sprint 2 - Magic Onboarding

- [x] UI onboarding (Option A PDF / Option B URL)
- [x] Extraction intelligente via Gemini 2.5 Flash
- [x] Scraping URL multi-pages (home + pages strategiques)
- [x] Persistance `public.agents` avec `upsert` par `user_id`

### Sprint 2.5 - Knowledge & Chat

- [x] Page `knowledge` avec visualisation des donnees agent
- [x] CRUD `faq_data` (ajout, edition, suppression)
- [x] Route `/api/chat` RAG + streaming Gemini
- [x] UI chat complete (historique, stream progressif, auto-scroll)

## V1 - Objectifs

### 1) Intelligence

- [ ] Re-ranking des connaissances (priorisation FAQ la plus pertinente)
- [ ] Detection d'intention (vente, SAV, information, escalade)
- [ ] Reponses plus structurees (citations internes, confiance, resumés)
- [ ] Evaluation qualite (latence, precision, taux de fallback)

### 2) Escalade

- [ ] Trigger d'escalade configurable (inconnu, frustration, urgence)
- [ ] Collecte guidee des coordonnees (email/telephone/contexte)
- [ ] Relay humain (ticketing/CRM/webhook)
- [ ] Journal d'escalade consultable dans le dashboard

### 3) Widget

- [ ] Widget embeddable (script simple + config publique)
- [ ] Theming par client (couleurs, logo, tonalite)
- [ ] Parametrage comportemental (welcome, limites, horaires)
- [ ] Hardening production (auth, quotas, observabilite, anti-abus)

