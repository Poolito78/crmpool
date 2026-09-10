# CLAUDE.md

Guide pour Claude Code sur ce dépôt.

⚠️ **Ce fichier est chargé à CHAQUE session : il ne contient que ce qui est vrai
pour TOUTES les tâches.** Le détail par module vit ailleurs et se lit à la
demande — voir « Où est le détail » plus bas. Ne pas le regonfler : ce qui
n'est utile qu'à une tâche sur vingt appartient à `claude/*.md` ou à l'en-tête
du fichier source concerné.

## Commands

```bash
npm run dev          # Vite, http://localhost:8080 (SW PWA désactivé en dev)
npm run build        # Build production (vide le cache Vite via prebuild)
npm run lint         # ESLint
npm run test         # Vitest, une passe

npx vitest run src/lib/xxx.test.ts     # un seul fichier — à préférer
npx vitest run -t "nom du test"

npx tsc -p tsconfig.app.json --noEmit   # LE type-check (le tsc racine est un no-op)
```

⚠️ Garder `npx tsc -p tsconfig.app.json --noEmit` à **0 erreur**. Le build
esbuild réussit malgré les erreurs de types : il ne remplace pas le type-check.

## Garde-fous absolus

- ⚠️ **Ne jamais éditer un fichier source via PowerShell `Set-Content`/`Out-File`** : l'encodage casse les accents UTF-8 (mojibake `envoyÃ©`). Utiliser l'outil Edit.
- ⚠️ **Ne pas manipuler le token Supabase de l'utilisateur** — il lance `gen-types.ps1` / `deploy-function.ps1` lui-même.
- **Toujours pusher automatiquement** après chaque commit. Une session Claude parallèle pousse sur le même dépôt : `git pull`/rebase avant de pousser, **jamais** de force.
- **Jamais d'`enum`** — union de littéraux : `type Status = 'draft' | 'sent';`
- ⚠️ **`LigneDevis.type` `undefined` DÉSIGNE UNE LIGNE D'ARTICLE.** En base les 410 lignes d'article portent `type: null`, pas une seule la chaîne `'ligne'`. Reconnaître un article **par exclusion** (`!== 'groupe' && !== 'soustotal' && !== 'texte'`), jamais par `=== 'ligne'`.
- **On n'invente jamais une donnée métier.** Une valeur absente de la table se signale (« à vérifier ») au lieu de se deviner : un rail en trop se facture au client, un rail en moins manque sur le chantier — et aucun des deux ne se voit sur un total muet. Même règle pour les prix, les chantiers, les tags.

## Architecture

**Stack :** React 18 + TypeScript + Vite 5, shadcn/ui (Radix), Tailwind,
Supabase (Postgres + Auth), React Router v6, Vercel.

**Relation avec Veille :** crmpool partage le projet Supabase
(`qkjxcfosutclnahvxflf`) avec l'app `Poolito78/veille`. Tables communes :
`concurrents`, `concurrent_produits`, `concurrent_notes`. Les accès aux deux
apps se gèrent depuis le panel Admin de Veille via `veille_roles` (`role`,
`crm_access`).

### App bootstrap (`src/App.tsx`)

`ErrorBoundary → QueryClientProvider → TooltipProvider → BrowserRouter`. Dans
`AppRoutes`, `useAuth()` garde les routes : non authentifié → `/auth`,
récupération de mot de passe → `<ResetPassword>`. Toutes les routes
authentifiées rendent dans `<StoreProvider><CRMLayout>` — `useCRM()` n'est donc
valide que dans les pages authentifiées. ⚠️ La route publique `/p/:id`
(`FichePublique`) sort **en tête de `AppRoutes`**, avant tous les gardes.

**Droits (`src/hooks/useAuth.tsx`)** — lus dans `veille_roles`, partagés via
`<AuthProvider>` + `useCurrentUser()` :
`active` (interrupteur maître ; `null` = spinner, `false` = « Accès refusé »),
`canCrm` (page `/crm`), `canAchat` (menu Achat + masque coûts/marges partout),
`isAdmin`. `crm_active` retombe sur `crm_access` si la colonne manque.
Gestion dans `AdminAccessPanel.tsx` (Paramètres → Administration).
⚠️ Masquage **UI seulement** — pour un cloisonnement dur, ajouter des policies RLS.

### État — `useStore` / `useCRM`

Tout l'état vit dans `src/lib/store.ts → useStore()`, fourni via
`StoreContext` et consommé par `useCRM()`. Collections : `clients`,
`fournisseurs`, `produits`, `devis`, `produitFournisseurs`,
`commandesFournisseur`, `commandesClient`, `facturesClient`,
`facturesFournisseur`.

Chaque collection a un `updateXxx(fn: prev => next)` qui applique la mutation
localement **et** diffe contre l'état précédent pour déclencher les
inserts/updates/deletes Supabase. **Il n'y a pas de couche API séparée.**

Hors `useStore`, trois hooks gèrent leur propre synchro : `useCrmActions()`
(`crm_actions`), `useDevisMessageTemplates()` (`devis_message_templates`),
`useConcurrents()` (`src/lib/concurrents.ts`).

### Convention DB ↔ App

Chaque entité a une paire de fonctions privées dans `store.ts` :
`dbToXxx(row)` (snake_case → camelCase) et `xxxToDb(obj, userId)` (l'inverse,
ajoute `user_id`). **Seuls endroits qui touchent aux noms de colonnes bruts.**

Pour un champ optionnel nouveau, spread conditionnel — sinon PostgREST rejette
l'insert tant que la colonne n'existe pas :
```ts
...(a.newField !== undefined ? { new_field: a.newField } : {}),
```

⚠️ Nouveau champ = **trois** gestes : `dbToXxx`, `xxxToDb`, **et** la migration
appliquée. En oublier un cause une perte de données silencieuse.

### Types métier (`src/lib/store.ts`)

| Type | Notes |
|---|---|
| `Produit` | `prixAchat` = prix achat conditionné. `paliersPrix?: PrixPalier[]` = prix par quantité. `prixHT` = prix public. `ficheUrl?` + `ficheLinkLabel?` = fiche technique injectée dans les mails. Distinct de `ProduitFournisseur.prixAchat` (prix/kg catalogue). |
| `ComposantProduit` | Trois modes de quantité : `quantite`, `poidsKg` (poids → qté via `produit.poids`), `consommationPct` (% d'un composant de base). Les trois doivent être gérés partout où un coût de composant est calculé. |
| `LigneDevis` | `type` = `'ligne' \| 'groupe' \| 'soustotal' \| 'texte'`, **optionnel** (voir garde-fous). `prixAchatLigne` = coût d'achat d'une ligne libre. |
| `ProduitFournisseur` | Lie un article à un fournisseur. `prixAchat` = prix au kg du catalogue fournisseur — **différent** de `Produit.prixAchat`. |
| `Client` | `delaiReglement?` (`'Comptant' \| '30J' \| '30J FDM' \| '45J' \| '45J FDM'`) pré-remplit le textarea `conditions` du devis. `DELAI_REGLEMENT_OPTIONS` exporté de `Clients.tsx`. |
| `Devis` | `modeCalcul: 'standard' \| 'surface'`. `statut` inclut `'archivé'` (+ `archiveDate/Raison/Commentaire/Concurrents`). Prévisionnel : `probabiliteReussite?` (0/25/50/75/100), `dateRealisation?`, `moContent?`. `chantier?` (case Chantier d'Odoo, sous Réf. affaire). Passer à `'accepté'` met auto `probabiliteReussite=100` + `dateRealisation=today` sur les 3 sélecteurs. |
| `CrmAction` | `concurrents?: CrmActionConcurrent[]`. À n'inclure dans le payload que si défini. |
| `RaisonArchive` | `'doublon' \| 'concurrent_prix' \| 'concurrent_delai' \| 'budget' \| 'injoignable' \| 'autre'`. Constante `RAISON_ARCHIVE` (label/couleur/messageDefaut). |

**⚠️ `designationProduit(p)` est le SEUL point de vérité pour nommer un
article.** `produits.description` porte la désignation du *modèle* (« IS KC1 »
pour douze déclinaisons) ; `description_variante` celle de la *déclinaison*.
Ne jamais lire `p.description` directement pour afficher ou nommer une ligne.

### Fonctions utilitaires (`src/lib/store.ts`)

- `getPrixPourQuantite(produit, quantite)` → `{ prixAchat, prixRevendeur, prixHT }` du bon palier. **Toujours l'utiliser** plutôt que `produit.prixAchat` quand la quantité compte.
- `calculerTotalLigne(ligne)`, `calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA)`
- `calculerFraisPort(poidsKg, hasGranulat)`, `calculerFraisPortBareme(bareme, poidsKg)`

**Helpers locaux de `Devis.tsx`** (après `calcQuantiteSurface`, hoistés) :
- `getVarianteDiff(produit, variantesChoisies?)` — somme des `prixDiff`.
- `getPrixLigne(produit, quantite, variantesChoisies?, isRevendeur?)` — base + diff. **Toujours l'utiliser plutôt que `getPrixPourQuantite` seul dès que des variantes sont possibles** (changement de quantité, surface/conso, `populateForm`). Le handler `VarianteSelect onChange` est la référence.
- `calcQuantiteSurface(prod, surface, consoOverride?)` — `Math.ceil(surface × conso / poids)`.

## Où est le détail

Ces fichiers ne sont **pas** chargés automatiquement : les ouvrir quand la
tâche les concerne, pas avant.

| Fichier | Contenu |
|---|---|
| `claude/modules.md` | Les modules `src/lib/` un par un + la règle de tarification `odoo-prix`. |
| `claude/ui.md` | Pages, composants, nav, scroll CRM, **convention obligatoire des vues tableau**, marge achat/vente du devis. |
| `claude/designations-odoo.md` | L'import de `description_variante` : **le champ est « Variant Sale Description », PAS `name`**, le curseur par référence, l'état du catalogue. |
| `.claude/rules/reprise-2026-09.md` | Ce que la session de septembre 2026 a établi + ce qui reste ouvert. **Chargé automatiquement.** |

⚠️ `reprise-2026-09.md` renvoie aussi à `claude/brides-et-rails.md`, qui
**n'existe pas** : pour les brides, la source fait foi — `bridesDevis.ts` et
`railsPanneaux.donnees.ts` portent chacun un en-tête complet.

⚠️ **La source fait foi avant ces fichiers.** Chaque module de `src/lib/` porte
un en-tête documenté de 13 à 28 lignes qui explique le *pourquoi* — c'est la
première chose à lire en ouvrant un fichier, et c'est là que va toute nouvelle
explication.

**Index des modules `src/lib/`** (détail dans `claude/modules.md`) :
`rapprochementArticle` (un code nommé ferme les autres familles) ·
`rapprochementClient` (la rareté d'un mot fait sa valeur) ·
`produitTags` (les mots du client, jamais affichés dans un devis) ·
`indexProduits` (index catalogue en WeakMap, deux caches) ·
`bridesDevis` + `railsPanneaux.donnees` (une bride par rail, jamais devinée) ·
`chantierDemande` · `contactAffaire` · `liensProduit` · `categorieDocuments` ·
`produitImages` · `journalPrix` · `prixAchatFournisseur` · `devisFournisseur` ·
`odooSync` · `pdfFolder` · `analyseDocument` / `analyseTransport` ·
`parseEml` / `parseMsgPdf` / `parseExcel` · `exportExcel` · `historique` ·
`concurrents` · `ralColors`

## Supabase

Migrations dans `supabase/migrations/`, numérotées par horodatage. Appliquer via
l'éditeur SQL du dashboard ou `supabase db push`.
`src/integrations/supabase/types.ts` est **généré** et resynchronisé avec la base.

**Régénérer `types.ts`** — script racine `gen-types.ps1` (lit
`SUPABASE_ACCESS_TOKEN` depuis l'env, gère le `--project-id` et l'encodage) :
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_xxx"   # https://supabase.com/dashboard/account/tokens
.\gen-types.ps1
```
⚠️ Régénérer **après** les `ALTER TABLE`. Les commandes `npx supabase …`
s'exécutent dans un **terminal**, jamais dans l'éditeur SQL.

**Edge Functions** (`supabase/functions/*`) : déployer avec
`.\deploy-function.ps1 <nom>` (ou `-All`). Fonctions : `extract-client`,
`extract-contact`, `analyze-email`, `ai-calculator`, `devis-assistant`,
`send-devis-email`, `odoo-prix`, `gemini`.

**Diagnostic « ça ne persiste pas »** : les `updateXxx` écrivent en
fire-and-forget. Un upsert qui envoie une colonne inexistante reçoit un 400 et
**toute la ligne est rejetée silencieusement**. Les écritures clients loggent
`console.error('[clients update] …')` ; une erreur `Could not find the 'X'
column` = colonne manquante → `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Les
écritures `clients` utilisent `upsert` (pas insert/update séparés) pour éviter
les courses création-puis-modif.

⚠️ **`odoo-prix` : le CONTRAT-CADRE tarife dès qu'il est rattaché ; sans
contrat, la LISTE DE PRIX fait foi** — et la grille reste alors chargée en
filet, sans quoi le garde-fou « sous le coût » retire les articles des
propositions. Un niveau R1-R4 imposé remplace tout. Détail et mesures dans
`claude/modules.md`.

## Variables d'environnement

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

## Git / deploy

- Dépôt : `Poolito78/crmpool`, branche `main`
- Déploiement Vercel automatique au push sur `main`
- Projet Supabase : `qkjxcfosutclnahvxflf`
