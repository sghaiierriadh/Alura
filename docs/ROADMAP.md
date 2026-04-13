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

### Sprint 2.6 - Messages, leads multi-tickets & widget (socle livré avant Sprint 4)

- [x] Persistance chat serveur (`public.messages` via `saveMessage`, user avant stream / assistant apres stream)
- [x] Table `lead_complaints` + logique `captureLead` / `addLeadComplaint` (plusieurs tickets par lead)
- [x] Formulaire lead + trigger modele (`LEAD_FORM_TRIGGER`) dans `ChatPanel`
- [x] Widget iframe: routes `(widget)` (`/widget`, `/embed`), `ChatLauncher`, `fetchAgentForWidget` (service role)
- [x] UX widget: layout embarque (scroll liste + saisie fixe), persistance de session iframe (iframe non detruite a la fermeture)

### Sprint 4 — Widget & persistance — **100 %**

Livrable principal: experience widget production-ready cote produit (iframe, persistance, tickets), alignee sur la documentation d'architecture.

- [x] Route group `(widget)`, pages `/widget` et `/embed`, layout plein ecran sans fuites de style
- [x] `ChatLauncher` avec keep-alive iframe (masquage CSS, etat de conversation conserve)
- [x] Persistance `messages` contractuelle via `POST /api/chat` + `saveMessage` (user avant Gemini, assistant apres stream)
- [x] Multi-tickets `lead_complaints` declenches depuis `/api/chat` lorsque `leadId` est connu
- [x] Export widget: `NEXT_PUBLIC_APP_URL`, CSP `frame-ancestors` (`WIDGET_CSP_FRAME_ANCESTORS`), iframe `sandbox`, messages d'erreur `agentId` (launcher + pages widget/embed)

### Sprint 5 (préparation) — Dashboard admin & intégration cross-domain

Objectifs cibles (planification et decoupage a affiner):

- [ ] Espace **dashboard admin** dédié: vue synthetique des conversations, leads et tickets (`lead_complaints`), filtres par agent / periode
- [ ] **Integration cross-domain**: guidelines hebergeur (origines autorisees, `ChatLauncher` avec `baseUrl` / `NEXT_PUBLIC_APP_URL`), affinage CSP / observabilite widget en production
- [ ] Parcours operateur: export ou webhooks vers CRM / outils Club Privilèges (spec fonctionnelle a valider)
- [ ] Renforcement production widget: quotas, anti-abus, traces d'erreurs cote client/serveur

## V1 - Objectifs

### 1) Intelligence

- [ ] Re-ranking des connaissances (priorisation FAQ la plus pertinente)
- [ ] Detection d'intention (vente, SAV, information, escalade)
- [ ] Reponses plus structurees (citations internes, confiance, resumés)
- [ ] Evaluation qualite (latence, precision, taux de fallback)

### 2) Escalade

- [ ] Trigger d'escalade configurable (inconnu, frustration, urgence)
- [x] Collecte guidee des coordonnees (email/telephone/contexte) — V0 formulaire + `leads`
- [ ] Relay humain (ticketing/CRM/webhook)
- [ ] Journal d'escalade consultable dans le dashboard

### 3) Widget

- [x] Widget embeddable (iframe + page `/embed?agentId=`) — V0
- [ ] Theming par client (couleurs, logo, tonalite)
- [ ] Parametrage comportemental (welcome, limites, horaires)
- [ ] Hardening production (auth, quotas, observabilite, anti-abus)
