# Session Handoff — crmpool

> Mis à jour : 2026-05-23

## État du projet

Repo : `Poolito78/crmpool` — branche `main` — déployé sur Vercel (auto sur push)
Supabase project ref : `qkjxcfosutclnahvxflf`

---

## Migrations SQL en attente (à appliquer dans Supabase SQL Editor)

Ces trois migrations ont été créées localement mais **doivent être appliquées manuellement** :

```sql
-- 1. supabase/migrations/20260524100000_add_archive_fields_to_devis.sql
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_date text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_raison text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_commentaire text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS archive_concurrents jsonb;

-- 2. supabase/migrations/20260524110000_create_devis_message_templates.sql
CREATE TABLE IF NOT EXISTS devis_message_templates (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  nom text NOT NULL, contenu text NOT NULL, raison_archive text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE devis_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own templates" ON devis_message_templates
  FOR ALL USING (auth.uid() = user_id);

-- 3. supabase/migrations/20260524120000_add_concurrents_to_crm_actions.sql
ALTER TABLE crm_actions ADD COLUMN IF NOT EXISTS concurrents jsonb;
```

---

## Fonctionnalités livrées (sessions récentes)

### ✅ Colonne "Qté vendue" dans la page Produits
- Somme des `ligne.quantite` de toutes les `commandesClient` par produit
- Colonne `qteVendue` dans le chooser de colonnes (fusionné dans localStorage)
- Fix : nouvelles colonnes par défaut toujours visibles même si ancien set localStorage existe

### ✅ Archivage de devis
- Statut `'archivé'` ajouté au type `Devis`
- 4 nouveaux champs : `archiveDate`, `archiveRaison`, `archiveCommentaire`, `archiveConcurrents[]`
- Types : `RaisonArchive` = `'doublon' | 'concurrent_prix' | 'concurrent_delai' | 'budget' | 'injoignable' | 'autre'`
- Constante `RAISON_ARCHIVE` avec label, color, messageDefaut pour chaque raison
- `DevisArchiveDialog` : sélection raison → commentaire pré-rempli éditable, section concurrents (nom/prix/délai), templates sauvegardables
- Dans `Devis.tsx` : bouton Archive sur chaque carte, auto-déclenchement quand statut → 'refusé'/'archivé', filtre "Voir archivés", badge raison sur cartes archivées
- `useDevisMessageTemplates()` hook avec table Supabase `devis_message_templates`

### ✅ Onglet CRM dans le dialog devis (`Devis.tsx`)
- 3e tab "CRM" dans la modale d'édition
- Liste des `CrmAction` liées au devis (filtré par `devisId`)
- Bouton "Nouvelle action" → `CRMActionDialog` pré-rempli

### ✅ Onglet CRM dans la fiche client (`Clients.tsx`)
- Tabs **Infos** / **CRM** dans la modale client (mode édition)
- Actions CRM filtrées par clientId
- Historique des devis : numéro, date, total HT, badge statut win/loss
- Analyse win/loss : taux transformation, raisons d'archivage, concurrents identifiés
- Produits devisés avec compteur gagné/perdu

### ✅ Onglet Analyse dans la page CRM (`CRM.tsx`)
- 4e tab "Analyse" (Pipeline / Actions / Calendrier / Analyse)
- Bloc 1 : analyse par client (total devis, acceptés, archivés, taux, CA)
- Bloc 2 : analyse par produit (gains, pertes, taux win, CA HT)
- Bloc 3 : raisons d'archivage globales (badges colorés)
- Bloc 4 : concurrents depuis devis archivés (nom, nb citations, prix moyen)
- Bloc 5 : **Analyse de prix concurrents** depuis actions CRM (voir ci-dessous)

### ✅ Infos concurrence dans "Nouvelle action" (`CRMActionDialog`)
- Section repliable "Infos concurrence" avec badge compteur
- S'ouvre automatiquement pour types Visite / Appel / RDV
- Par ligne : nom concurrent, produit/réf (dropdown si produits fournis), tarif €, délai (j), note
- Nouveau type `CrmActionConcurrent` + champ `concurrents?` sur `CrmAction`
- `dbToCrmAction` / `crmActionToDb` mis à jour
- `produits` prop passé depuis CRM.tsx, Devis.tsx et Clients.tsx

### ✅ Bloc "Analyse de prix concurrents" (CRM Analyse tab)
- Agrégation par concurrent+produit : tarif moyen, délai moyen, nb mentions, dernière date
- Historique détaillé (30 entrées) : concurrent, produit, tarif, délai, client, date, note
- État vide avec message d'invitation

---

## Architecture des types clés (état actuel)

```typescript
// Statuts devis
type DevisStatut = 'brouillon' | 'envoyé' | 'accepté' | 'refusé' | 'expiré' | 'système' | 'archivé'

// Raisons d'archivage
type RaisonArchive = 'doublon' | 'concurrent_prix' | 'concurrent_delai' | 'budget' | 'injoignable' | 'autre'

// Champs archive sur Devis
archiveDate?: string
archiveRaison?: RaisonArchive
archiveCommentaire?: string
archiveConcurrents?: ConcurrentProduit[]   // depuis DevisArchiveDialog

interface ConcurrentProduit {
  produitId?: string
  nomConcurrent?: string
  prixConcurrent?: number
  delaiConcurrent?: number
  note?: string
}

// Concurrent dans CrmAction (depuis visites/appels)
interface CrmActionConcurrent {
  produitRef?: string
  nomConcurrent: string
  tarif?: number
  delai?: number
  note?: string
}

interface CrmAction {
  // ...existant...
  concurrents?: CrmActionConcurrent[]   // ← nouveau
}

interface DevisMessageTemplate {
  id: string
  nom: string
  contenu: string
  raisonArchive?: RaisonArchive
  createdAt: string
}
```

---

## Fichiers modifiés (sessions récentes)

| Fichier | Changements |
|---|---|
| `src/lib/store.ts` | Statut `archivé`, 4 champs archive, `RaisonArchive`, `RAISON_ARCHIVE`, `ConcurrentProduit`, `CrmActionConcurrent`, `concurrents` sur `CrmAction`, `DevisMessageTemplate`, `useDevisMessageTemplates()` |
| `src/pages/Devis.tsx` | Onglet CRM, filtre archivés, dialog archivage, badge raison, `produits` prop sur CRMActionDialog |
| `src/pages/Clients.tsx` | Tabs Infos/CRM, historique devis, analyse win/loss, `produits` prop |
| `src/pages/CRM.tsx` | Onglet Analyse (5 blocs), `produits` prop sur CRMActionDialog |
| `src/pages/Produits.tsx` | Colonne `qteVendue`, fix localStorage merge |
| `src/components/DevisArchiveDialog.tsx` | **Nouveau** — dialog archivage complet |
| `src/components/CRMActionDialog.tsx` | Section "Infos concurrence" + prop `produits` |
| `supabase/migrations/20260524100000_*.sql` | Colonnes archive sur devis |
| `supabase/migrations/20260524110000_*.sql` | Table `devis_message_templates` |
| `supabase/migrations/20260524120000_*.sql` | Colonne `concurrents` sur `crm_actions` |

---

## Fonctionnalités antérieures (toujours en place)

- Groupes de lignes avec sous-total déplaçable
- Ligne de texte libre (`type: 'texte'`)
- Drag & drop pour réordonner les lignes
- Duplication de ligne
- Annulation Ctrl+Z (pile 30 snapshots)
- Calculateur IA (Edge Function Groq/Gemini)
- Surface globale → propagation aux lignes
- Aperçu PDF avec groupes, sous-totaux, texte, footer légal
- Consommation réelle chantier par ligne
- Sync Odoo (script console)

---

## Prochaines pistes possibles

- [ ] Signature électronique sur le devis
- [ ] Notifications devis arrivant à expiration (badge ou email)
- [ ] Export Excel du comparatif achat/vente
- [ ] Filtre date dans l'onglet Analyse CRM (par trimestre/année)
- [ ] Synchronisation Odoo : tester le script en production

---

## Commandes utiles

```bash
npm run dev          # Dev server localhost:8080
npm run build        # Build prod (vérification TypeScript incluse)
npx tsc --noEmit     # Vérification TypeScript seule
git log --oneline -10  # 10 derniers commits
# ⚠️ Ne jamais pusher sans confirmation explicite de l'utilisateur
```
