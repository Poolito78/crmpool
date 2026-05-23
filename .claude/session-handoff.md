# Session Handoff — crmpool

> Mis à jour : 2026-05-23

## État du projet

Repo : `Poolito78/crmpool` — branche `main` — déployé sur Vercel (auto sur push)
Supabase project ref : `qkjxcfosutclnahvxflf`

---

## Migrations SQL en attente (à appliquer dans Supabase SQL Editor)

### Migration 1 — Colonnes archive sur devis
```sql
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_date text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_raison text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_commentaire text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_concurrents jsonb;
```

### Migration 2 — Table templates de messages
```sql
CREATE TABLE IF NOT EXISTS devis_message_templates (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom text NOT NULL, contenu text NOT NULL, raison_archive text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE devis_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own templates" ON devis_message_templates
  FOR ALL USING (auth.uid() = user_id);
```

### Migration 3 — Créer crm_actions + colonne concurrents (tout en un)
```sql
CREATE TABLE IF NOT EXISTS crm_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  devis_id UUID REFERENCES devis(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'tache',
  titre TEXT NOT NULL,
  description TEXT,
  date_planifiee TIMESTAMP WITH TIME ZONE,
  date_realisee TIMESTAMP WITH TIME ZONE,
  statut TEXT NOT NULL DEFAULT 'planifiee',
  priorite TEXT NOT NULL DEFAULT 'normale',
  concurrents JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE crm_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own crm_actions" ON crm_actions
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS crm_actions_user_id_idx ON crm_actions(user_id);
CREATE INDEX IF NOT EXISTS crm_actions_client_id_idx ON crm_actions(client_id);
CREATE INDEX IF NOT EXISTS crm_actions_date_planifiee_idx ON crm_actions(date_planifiee);
ALTER TABLE devis ADD COLUMN IF NOT EXISTS raison_refus TEXT;
```

> Si `crm_actions` existe déjà sans la colonne `concurrents` :
> `ALTER TABLE crm_actions ADD COLUMN IF NOT EXISTS concurrents jsonb;`

---

## Fonctionnalités livrées (sessions récentes)

### ✅ Colonne "Qté vendue" dans Produits
- Somme des quantités commandées par produit
- Fix localStorage : nouvelles colonnes toujours visibles même si ancien set sauvegardé

### ✅ Archivage de devis
- Statut `'archivé'` + 4 champs : `archiveDate`, `archiveRaison`, `archiveCommentaire`, `archiveConcurrents[]`
- `RaisonArchive` = `'doublon' | 'concurrent_prix' | 'concurrent_delai' | 'budget' | 'injoignable' | 'autre'`
- `DevisArchiveDialog` : raison → commentaire pré-rempli éditable, concurrents (nom/prix/délai), templates sauvegardables
- `Devis.tsx` : bouton Archive sur chaque carte, auto-déclenchement sur statut → 'refusé'/'archivé', filtre "Voir archivés", badge raison

### ✅ Onglet CRM dans le dialog devis et la fiche client
- Devis.tsx : 3e tab "CRM" → actions filtrées par devisId
- Clients.tsx : tabs Infos/CRM → actions + historique devis + analyse win/loss + produits

### ✅ Page CRM — architecture scroll indépendant
- Structure : `flex-col h-[calc(100vh-4rem)]`
  - Alerte retard : `flex-none`
  - **Barre d'onglets : `flex-none` — ne scroll JAMAIS**
  - Zone contenu : `flex-1 overflow-y-auto` (scroll propre)
- Sticky `top-0` fonctionne correctement dans la zone de scroll
- Pipeline : barre de filtre sticky + en-têtes tableau sticky
- Analyse : bandeau KPI 4 indicateurs sticky en haut

### ✅ Onglet Analyse CRM — sections repliables
- 6 sections avec toggle masquer/afficher (état persisté dans `analyseSections`)
- Par défaut ouvert : clients, produits, raisons, analyse prix
- Par défaut fermé : concurrents devis archivés, historique détaillé
- Section "Raisons d'archivage" : tableau détaillé avec tri par colonne + filtre texte + badges cliquables

### ✅ Infos concurrence dans CRMActionDialog
- Section "Infos concurrence" repliable, auto-ouverte pour Visite/Appel/RDV
- Par concurrent : nom, produit/réf (dropdown), tarif €, délai (j), note
- `CrmActionConcurrent` interface + `concurrents?` sur `CrmAction`
- Champ `concurrents` envoyé à Supabase uniquement si défini (évite erreur colonne inexistante)

### ✅ Bloc "Analyse de prix concurrents" (CRM Analyse)
- Agrégation par concurrent+produit : tarif moyen, délai moyen, nb mentions, dernière date
- Historique détaillé (50 entrées max) avec client, date, note

---

## Architecture CRM (état actuel)

```
CRM.tsx
├── flex-none: alerte retard
├── flex-none: barre onglets (Pipeline | Actions | Calendrier | Analyse)
└── flex-1 overflow-y-auto: contenu
    ├── Pipeline: StatCards + filtre sticky + table sticky headers
    ├── Actions: liste + calendrier
    ├── Calendrier: vue mensuelle
    └── Analyse:
        ├── sticky top-0: bandeau KPI (4 métriques)
        ├── Section: Analyse par client (repliable)
        ├── Section: Analyse par produit (repliable)
        ├── Section: Raisons d'archivage (tableau tri/filtre)
        ├── Section: Concurrents devis archivés (repliable)
        ├── Section: Analyse de prix concurrents (repliable)
        └── Section: Historique détaillé (repliable)
```

---

## Types TypeScript clés (état actuel)

```typescript
type DevisStatut = 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré' | 'système' | 'archivé'
type RaisonArchive = 'doublon' | 'concurrent_prix' | 'concurrent_delai' | 'budget' | 'injoignable' | 'autre'

// Sur Devis :
archiveDate?: string
archiveRaison?: RaisonArchive
archiveCommentaire?: string
archiveConcurrents?: ConcurrentProduit[]

interface ConcurrentProduit {
  produitId?: string; nomConcurrent?: string; prixConcurrent?: number; delaiConcurrent?: number; note?: string
}

// Sur CrmAction :
concurrents?: CrmActionConcurrent[]

interface CrmActionConcurrent {
  produitRef?: string; nomConcurrent: string; tarif?: number; delai?: number; note?: string
}

interface DevisMessageTemplate {
  id: string; nom: string; contenu: string; raisonArchive?: RaisonArchive; createdAt: string
}
```

---

## Fichiers modifiés récemment

| Fichier | Rôle |
|---|---|
| `src/lib/store.ts` | Tous les nouveaux types + hooks (`useDevisMessageTemplates`, `useCrmActions`) |
| `src/pages/CRM.tsx` | Architecture scroll + 4 onglets + Analyse complet |
| `src/pages/Devis.tsx` | Onglet CRM, archivage, filtre archivés |
| `src/pages/Clients.tsx` | Tabs Infos/CRM, historique win/loss |
| `src/pages/Produits.tsx` | Colonne qteVendue, fix localStorage |
| `src/components/DevisArchiveDialog.tsx` | Dialog archivage avec templates |
| `src/components/CRMActionDialog.tsx` | Section infos concurrence |
| `supabase/migrations/20260524100000_*.sql` | Archive fields on devis |
| `supabase/migrations/20260524110000_*.sql` | Table devis_message_templates |
| `supabase/migrations/20260524120000_*.sql` | concurrents on crm_actions |

---

## Prochaines pistes possibles

- [ ] Notifications devis arrivant à expiration (badge ou email)
- [ ] Export Excel du comparatif achat/vente
- [ ] Filtre date dans l'onglet Analyse CRM (par trimestre/année)
- [ ] Signature électronique sur le devis
- [ ] Synchronisation Odoo : tester en production

---

## Commandes utiles

```bash
npm run dev          # Dev server localhost:8080
npm run build        # Build prod + vérification TS
git log --oneline -10
# ⚠️ Ne jamais pusher sans confirmation explicite
```
