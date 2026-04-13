# Alura — Spécification fonctionnelle (V1) — Club Privilèges

Document à destination des parties prenantes métier et produit. Il reflète l’implémentation actuelle de la plateforme Alura (V0 / socle widget) telle que portée par le code applicatif et les flux documentés dans `docs/ARCHITECTURE.md`.

---

## 1. Vision produit

**Alura** est une **plateforme SaaS autonome** : elle n’est pas un simple module greffé au site du partenaire, mais une **application dédiée** (hébergement, authentification opérateur, base de connaissances, moteur conversationnel) que le Club peut déployer et faire évoluer indépendamment de ses canaux historiques.

Pour **Club Privilèges**, Alura incarne une **conseillère numérique premium** : ton posé, réponses contextualisées, priorité à l’exactitude sur la base documentaire du partenaire, et **escalade maîtrisée** vers l’humain lorsque la situation l’exige (réclamation, demande hors périmètre documenté, besoin de coordonnées).

Les bénéfices attendus côté club :

- **Disponibilité** du premier contact, sans dégrader l’image de marque.
- **Cohérence** des réponses alignées sur la FAQ et le discours officiel.
- **Traçabilité** des échanges et des intentions visiteurs, préparant un pilotage qualité et un futur CRM.

---

## 2. Périmètre fonctionnel actuel (socle livré)

| Domaine | Comportement |
|--------|----------------|
| Connaissance | Import PDF ou analyse site web ; structuration ; édition des FAQ dans l’espace connecté. |
| Conversation | Chat avec réponses **streamées** (affichage progressif), appuyées sur la base FAQ et la description entreprise. |
| Persistance | Historique de conversation enregistré **côté serveur** dans la base (pas de vision « brouillon » uniquement dans le navigateur pour le fil principal du chat). |
| Capture lead | Formulaire coordonnées déclenché lorsque le modèle signale l’escalade (`LEAD_FORM_TRIGGER`). |
| Multi-tickets | Après identification du visiteur, **chaque nouvelle demande textuelle pertinente** peut donner lieu à une **ligne ticket** supplémentaire liée au même contact. |

---

## 3. Le widget embarqué

### 3.1 Intégration côté Club Privilèges

Le site du partenaire n’héberge pas la logique métier du chat : il charge une **page légère** fournie par Alura, en **iframe**, pointant vers l’**origine** de l’application Alura (même principe qu’un widget type intercom, avec contrôle d’URL et de déploiement côté Alura).

- **Page d’accroche pour l’intégrateur** : `/embed?agentId=<identifiant>` — affiche le **lanceur** (bouton flottant et panneau).
- **Contenu du chat dans l’iframe** : `/widget?agentId=<identifiant>` — interface conversationnelle pleine hauteur, optimisée pour un cadre fixe (liste défilante, zone de saisie ancrée en bas).

L’identifiant `agentId` relie le widget au **profil de connaissance** (nom d’entreprise, FAQ, etc.) configuré dans le tableau de bord Alura.

### 3.2 Expérience utilisateur « haut de gamme »

- Ouverture fluide du panneau, **fermeture sans perte de contexte** : après la première ouverture, le cadre iframe **reste monté** dans la page et n’est que **masqué visuellement** lorsque l’utilisateur referme le panneau — la conversation, la session et l’état du formulaire restent intacts, ce qui évite l’effet « rechargement brutal » propre aux intégrations bas de gamme.

### 3.3 Cadre technique (transparence)

Le groupe de routes applicatif `(widget)` regroupe les écrans « plein viewport » sans ajouter de segment superflu dans l’URL publique. La résolution de l’agent pour `/widget` s’effectue **côté serveur** avec les privilèges appropriés ; la clé technique sensible ne transite jamais vers le navigateur du visiteur final.

---

## 4. Capture de leads « intelligente »

### 4.1 Déclenchement

Lorsque la base de connaissances ne suffit pas ou que le scénario l’exige, le modèle peut **proposer la collecte de coordonnées**. Le client applicatif détecte un **marqueur technique** en fin de flux, **masqué à l’affichage**, et présente un **formulaire** (identité, email, téléphone selon le flux métier).

### 4.2 Données créées

- Un enregistrement **lead** : contact unique par soumission, avec synthèse de la dernière question utile.
- Zéro, une ou plusieurs lignes **tickets / réclamations** (`lead_complaints`) : la première peut être créée à la capture si le texte est jugé **significatif** ; les suivantes s’appuient sur la logique serveur décrite ci-dessous.

### 4.3 Après capture

Un **message de confirmation** court peut être enregistré et affiché pour clore proprement la phase d’escalade, tout en invitant le visiteur à poursuivre si besoin — le tout **persisté côté serveur**, en cohérence avec le reste de l’historique.

---

## 5. Système multi-tickets

Pour un **même contact** (même `leadId`), Alura maintient une relation **un vers plusieurs** entre le lead et les **tickets textuels** enregistrés :

- **Un lead** = une personne / dossier contact pour un agent donné.
- **Plusieurs tickets** = autant de **lignes** dans l’espace « réclamations / intentions » que de demandes **substantielles** successives après identification.

Concrètement, **chaque envoi de message utilisateur** traité par l’API de chat, lorsque le `leadId` est déjà connu, **déclenche en fin de traitement** un appel serveur standardisé (`addLeadComplaint`) qui **évalue** si le texte mérite une nouvelle ligne ticket (longueur, forme de question, etc.). Ainsi, le Club ne se contente pas d’un seul libellé figé : il dispose d’une **chronologie d’intentions** rattachées au même visiteur, base idéale pour un futur **dashboard** opérateur ou une intégration CRM.

---

## 6. Parcours synthétique (visiteur)

1. Le visiteur ouvre le widget depuis le site Club Privilèges.
2. Alura accueille avec un message adapté (notamment au nom de l’entreprise configurée).
3. Les questions sont traitées en priorité à partir de la **FAQ** et du **descriptif** entreprise.
4. Si nécessaire, le système propose la **collecte de coordonnées** ; après validation, le fil peut continuer.
5. Les **nouvelles demandes** post-identification alimentent les **tickets** côté base, en parallèle de l’**historique de chat** conservé par session.

---

## 7. Évolutions préparées (alignement roadmap)

Les travaux prévus autour du **tableau de bord administrateur** et de l’**intégration cross-domain** (politique d’origines, renforcement sécurité iframe, observabilité) prolongent le socle décrit ici sans remettre en cause la vision : **Alura reste le système maître** de la conversation et de la persistance, le site partenaire restant le **canal d’accès** pour le visiteur final.

---

## 8. Glossaire

| Terme | Signification |
|--------|-----------------|
| Agent | Profil de connaissance (entreprise + FAQ) utilisé par le chat. |
| Session | Identifiant stable de conversation côté navigateur, lié aux messages persistés. |
| Lead | Fiche contact créée lors de la soumission du formulaire d’escalade. |
| Ticket / réclamation | Ligne `lead_complaints` : intention textuelle associée à un lead. |
| Widget | Couple `/embed` (lanceur) + `/widget` (contenu iframe). |

---

*Document fonctionnel — ne se substitue pas aux clauses contractuelles, SLA ou politiques de données personnelles, à formaliser avec le Club selon le cadre juridique applicable.*
