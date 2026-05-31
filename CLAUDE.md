# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite, localhost:8080 by default)
npm run build        # Production build (clears Vite cache first via prebuild)
npm run build:dev    # Dev-mode build (skips minification, useful for debugging)
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Vitest in watch mode
```

## Architecture

**Tech stack:** React 18 + TypeScript + Vite 5, shadcn/ui (Radix), Tailwind CSS, Supabase (Postgres + Auth), React Router v6, deployed on Vercel.

**Relation avec Veille :** crmpool partage le même projet Supabase (`qkjxcfosutclnahvxflf`) avec l'app standalone `Poolito78/veille`. Les tables `concurrents`, `concurrent_produits`, `concurrent_notes` sont communes. Les accès aux deux apps sont gérés depuis le panel Admin de Veille via la table `veille_roles` (colonnes `role` pour Veille, `crm_access` pour crmpool).

### App bootstrap (`src/App.tsx`)

`App` wraps everything in `ErrorBoundary → QueryClientProvider → TooltipProvider → BrowserRouter`. Inside `AppRoutes`, `useAuth()` guards routes: unauthenticated users go to `/auth`, password-recovery flows show `<ResetPassword>` regardless of session. All authenticated routes render inside `<StoreProvider><CRMLayout>` — so `useCRM()` is only valid inside authenticated pages.

**Garde d'accès CRM :** après la session Supabase, `useAuth()` interroge `veille_roles.crm_access` pour l'utilisateur courant. Si `crm_access = false` (ou absent), un écran "Accès refusé" est affiché avec un bouton de déconnexion — l'app n'est jamais rendue. `crmAccess === null` pendant le chargement affiche un spinner. Les utilisateurs doivent être ajoutés dans `veille_roles` avec `crm_access = true` via le panel Admin de l'app Veille (`veille-alpha.vercel.app`).

### State management — `useStore` / `useCRM`

All application state lives in `src/lib/store.ts → useStore()`, provided app-wide via `StoreContext` and consumed in every page via `useCRM()`.

`useStore` holds: `clients`, `fournisseurs`, `produits`, `devis`, `produitFournisseurs`, `commandesFournisseur`, `commandesClient`, `facturesClient`, `facturesFournisseur`.

Each collection has an `updateXxx(fn: prev => next)` callback that applies the mutation locally **and** diffs against the previous state to fire the correct Supabase inserts/updates/deletes. There is **no separate API layer** — mutations go through the updater callbacks.

Three additional hooks live outside `useStore` and manage their own Supabase sync:
- `useCrmActions()` — CRM actions (table `crm_actions`). Returns `{ actions, addAction, updateAction, deleteAction }`.
- `useDevisMessageTemplates()` — archive comment templates (table `devis_message_templates`). Returns `{ templates, addTemplate, deleteTemplate }`.
- `useConcurrents()` (`src/lib/concurrents.ts`) — competitor watch (tables `concurrents`, `concurrent_produits`, `concurrent_notes`). Returns full CRUD for all three entity types.

### DB ↔ App mapping convention

Every entity has a pair of private functions in `store.ts`:
- `dbToXxx(row)` — snake_case DB row → camelCase TS interface
- `xxxToDb(obj, userId)` — reverse, adds `user_id`

These are the only places that touch raw DB column names. When adding a new optional field to a domain type, use spread to conditionally include it in `xxxToDb` to avoid PostgREST rejecting inserts when the column doesn't exist yet:
```ts
...(a.newField !== undefined ? { new_field: a.newField } : {}),
```

When adding a new field: update **both** `dbToXxx` and `xxxToDb` in `store.ts`, create a migration file, and apply it. Forgetting any one of these three causes silent data loss. The same pattern applies to the standalone `concurrents.ts` hook.

### Key domain types (`src/lib/store.ts`)

| Type | Notes |
|---|---|
| `Produit` | `prixAchat` = prix achat conditionné (unit cost). `paliersPrix?: PrixPalier[]` = tiered pricing by quantity. `prixHT` = public price. `ficheUrl?` + `ficheLinkLabel?` = product sheet URL injected into devis emails. Distinct from `ProduitFournisseur.prixAchat` (catalog price/kg). |
| `ComposantProduit` | Three quantity modes: plain `quantite`, `poidsKg` (weight → qty via `produit.poids`), or `consommationPct` (% of a base component). All three modes must be handled wherever composant cost is calculated. |
| `LigneDevis` | `type` = `'ligne' \| 'groupe' \| 'soustotal' \| 'texte'`. Only `'ligne'` rows count in totals. `prixAchatLigne` = free-line purchase cost (e.g. energy surcharges). |
| `ProduitFournisseur` | Links a product to a supplier. `prixAchat` here is price per kg from supplier catalog — **different** from `Produit.prixAchat`. |
| `Client` | `delaiReglement?: string` — preset payment terms (`'Comptant' \| '30J' \| '30J FDM' \| '45J' \| '45J FDM'`). Drives auto-fill of the `conditions` textarea in the devis form when client changes. `DELAI_REGLEMENT_OPTIONS` (label + full text) exported from `Clients.tsx`. |
| `Devis` | `modeCalcul: 'standard' \| 'surface'`. Surface mode uses `surfaceGlobaleM2` + per-product `consommation`. `statut` includes `'archivé'` in addition to the standard statuses. Archived devis carry: `archiveDate?`, `archiveRaison?`, `archiveCommentaire?`, `archiveConcurrents?`. |
| `CrmAction` | Has `concurrents?: CrmActionConcurrent[]` for recording competitor prices observed during visits/calls. Only include in DB payload when defined (column may not exist yet). |
| `RaisonArchive` | `'doublon' \| 'concurrent_prix' \| 'concurrent_delai' \| 'budget' \| 'injoignable' \| 'autre'`. Constant `RAISON_ARCHIVE` holds label/color/messageDefaut per key. |

### Key utility functions (`src/lib/store.ts`)

- `getPrixPourQuantite(produit, quantite)` — returns `{ prixAchat, prixRevendeur, prixHT }` from the correct price tier. **Always use this instead of `produit.prixAchat` directly** when the quantity matters.
- `calculerTotalLigne(ligne)` — line total after remise + TVA.
- `calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA)` — full devis totals.
- `calculerFraisPort(poidsKg, hasGranulat)` — standard transport barème.
- `calculerFraisPortBareme(bareme, poidsKg)` — generic barème (UPS / messagerie / GLS).

**Local helpers in `Devis.tsx`** (defined after `calcQuantiteSurface`, hoisted):
- `getVarianteDiff(produit, variantesChoisies?)` — sums `prixDiff` from all chosen variant options.
- `getPrixLigne(produit, quantite, variantesChoisies?, isRevendeur?)` — `getPrixPourQuantite` base + `getVarianteDiff`. **Always use instead of `getPrixPourQuantite` alone whenever variants may be chosen** (quantity change, surface/conso change, populateForm). The existing `VarianteSelect onChange` handler is the canonical reference for this pattern.
- `calcQuantiteSurface(prod, surface, consoOverride?)` — `Math.ceil(surface × conso / poids)`.

**Devis comparatif manual overrides:** states `compaEditingId / compaEditVal` (per-line puAchat) and `portAchatManuel` (transport). Click-to-edit inline input, amber colour when overridden, ↺ reset. `portAchat = portAchatManuel ?? portAchatCalcule` in the IIFE.

### Sidebar nav structure (`src/components/CRMLayout.tsx`)

The nav uses a `NavEntry = NavLink | NavGroup` type union. Groups (`Vente`, `Achat`) are collapsible, auto-expand when a child route is active, and persist open state in `openGroups: string[]`. The flat list `NAV_FLAT` is used for the mobile bottom bar and the top-bar title.

Current structure:
- Tableau de bord, CRM (top-level)
- **Vente** group: Clients, Produits, Devis, Commandes Client, Factures Client
- **Achat** group: Fournisseurs, Cmd Fournisseur, Factures Fourn.
- Stock, Calcul Transport, Historique GED (top-level)

### Pages (`src/pages/`)

| Page | Role |
|---|---|
| `Devis.tsx` | Largest file. Full devis lifecycle: list, create/edit dialog (tabs: Devis / Comparatif / CRM), archive dialog, PDF, email. Supports `?editDevis=<id>` URL param to auto-open the edit dialog after data loads (uses a `useRef` guard to fire only once). |
| `CRM.tsx` | 5-tab page: Pipeline / Actions / Calendrier / Analyse / Veille. Uses its own scroll container (see below). |
| `VeilleConcurrence.tsx` | Competitor watch: 4 sub-tabs (Fiches / Produits / Notes / Tableau pivot). Embeds `useConcurrents()`. Also embedded as a tab inside CRM.tsx. |
| `Produits.tsx` | Product catalog with tiered pricing, variants, kit composition, supplier links, qteVendue column. |
| `Clients.tsx` | CRM contacts. Edit dialog has tabs: Infos / CRM (actions + devis history + win/loss). |
| `Stock.tsx` | Stock level tracking. |
| `Fournisseurs.tsx` | Supplier contacts with delivery addresses, per-category discounts. |
| `Commandes.tsx` / `CommandesClient.tsx` | Purchase & sales order management. |
| `FacturesClient.tsx` / `FacturesFournisseur.tsx` | Invoice tracking. |
| `GED.tsx` | Document management (pieces jointes per devis line via `devis_pieces_jointes` table). |
| `CalculateurUPS.tsx` | Shipping cost calculator. 5 tabs: Standard, Transporteurs, Barèmes transporteurs, Saisie manuelle, **Achat**. The Achat tab stores real transport purchase history (drag-and-drop reorder, sortable, AI PDF extraction). localStorage key `crm_transport_achats`. `AchatTransport` interface has `fournisseur` (sender/client, e.g. QRM) distinct from `transporteur` (carrier, e.g. UPS). |
| `StatsVariantes.tsx` | Sales statistics by product variant. |
| `Dashboard.tsx` | KPI summary. |

### CRM page scroll architecture

`CRM.tsx` uses a self-contained scroll container to keep the tab bar always visible regardless of content length:

```
<div style={{ height: 'calc(100vh - 4rem)' }} className="flex flex-col -m-4 md:-m-6">
  <div className="flex-none">   ← alert bar (when actions overdue)
  <div className="flex-none">   ← tab bar (Pipeline / Actions / Calendrier / Analyse / Veille) — NEVER scrolls
  <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">  ← all tab content scrolls here
```

Sticky elements inside the scroll zone use `top-0` (not `top-16`). This pattern avoids the CSS bug where `overflow-x: hidden` on a parent breaks `position: sticky`.

### Key components (`src/components/`)

- `DevisPreview.tsx` — Read-only devis renderer for on-screen preview and PDF generation.
- `DevisArchiveDialog.tsx` — Dialog for archiving a devis: raison select, pre-filled editable comment, competitor entries (nom/prix/délai), saveable message templates.
- `CRMActionDialog.tsx` — Create/edit CRM action with collapsible "Infos concurrence" section (competitor name, product ref, tarif, délai, note). Auto-opens for Visite/Appel/RDV types. Accepts optional `produits` prop for product dropdown.
- `ConcurrentDialog.tsx` — Create/edit competitor fiche: 3 tabs (Infos / Produits / Notes). Passes `clients` prop for "client source" tracking on product entries.
- `DevisEmailDialog.tsx`, `CommandeEmailDialog.tsx` — Email composition with PDF attachment. Generate RFC 822 `.eml` files (MIME multipart/mixed, `X-Unsent: 1` for Outlook). On mobile: Web Share API; fallback to download + `mailto:`.
- `CommandeARDialog.tsx` / `CommandeARPreview.tsx` — Order acknowledgement document.
- `ProduitFournisseursPanel.tsx` — Supplier pricing panel inside the product form.
- `AnalyseDocumentDialog.tsx` — AI-powered document classifier: reads PDF/EML/MSG, classifies type, and extracts structured fields.
- `DevisAssistantDialog.tsx`, `AiCalculatorDialog.tsx`, `EmailAnalyzerDialog.tsx`, `EmailToContactDialog.tsx` — AI-assisted workflows.
- `DevisChatter.tsx` — Threaded comments/history on a devis.
- `ClientCombobox.tsx`, `ProduitCombobox.tsx`, `VarianteSelect.tsx` — Reusable entity pickers.
- `TruncTooltip.tsx` — Text truncation with hover tooltip.

### Library modules (`src/lib/`)

- **`concurrents.ts`** — `useConcurrents()` hook + `formatCreateur(emailOrName)` utility. `formatCreateur` resolves an email to a display name stored in localStorage key `crm_creator_names` (`{ "email": "displayName" }`). Used wherever creator identity is shown in competitor watch. La table `concurrent_produits` a 3 colonnes additionnelles gérées depuis Veille : `client_nom`, `informateur`, `date_renseignement`.
- **`historique.ts`** — Fire-and-forget audit log via `logHistorique(entry)`. Never awaited — never blocks UI. `fetchHistorique(opts?)` retrieves entries. Table: `historique`.
- **`pdfFolder.ts`** — `generatePdfFromElement` / `savePdfFromElement` via `html2canvas` + `jsPDF`. Smart page-break detection on `<tr>` boundaries. `writeFileToSubfolder` persists to a user-chosen directory via File System Access API (stored in IndexedDB).
- **`exportExcel.ts`** — `exportMultiSheet` generates multi-sheet `.xlsx` files (used for global data export from the nav bar).
- **`parseEml.ts`** / **`parseMsgPdf.ts`** / **`parseExcel.ts`** — Parse raw email and Excel files into structured objects for AI analysis and import flows.
- **`analyseDocument.ts`** — PDF text extraction via `pdfjs-dist`. Exports `TypeDocument` union and `TYPE_LABELS`.
- **`analyseTransport.ts`** — `analyserDocumentTransport(file, apiKey?, geminiKey?, openrouterKey?)` extracts transport data from PDF/text via AI (Groq → Gemini → OpenRouter fallback). Returns `TransportExtrait`: `fournisseur` (donneur d'ordre / sender, e.g. QRM, TREMCO CPG) **distinct from** `transporteur` (carrier, e.g. UPS, Heppner). Used in the Achat tab of `CalculateurUPS.tsx`.
- **`odooSync.ts`** — Generates a JS script to paste into the Odoo browser console to create a `sale.order`. Entry point: `genererScriptOdoo(devis, client, produits, options?)`. Constants: `ODOO_COMPANY_ID = 13`, `ODOO_FALLBACK_PRODUCT_ID = 362577`. Uses `promptOdooPartnerName(clientId, defaultName)` to handle partner name mismatches (cached in `localStorage` as `odoo_partner_<clientId>`).
- **`ralColors.ts`** — RAL colour reference data. `getRalInfo('RAL XXXX')` returns `{ hex, dark }`. `VarianteSelect` auto-renders colour swatches for options whose `label` matches `RAL XXXX` — no `imageUrl` needed. Texture images (e.g. QuartzColor swatches) require `imageUrl` pointing to `/quartz/*.jpg`.

### PDF generation (`src/lib/pdfFolder.ts`)

- `generatePdfFromElement(element, opts)` — renders a DOM element to multi-page PDF via `html2canvas` + `jsPDF`. Smart page-break detection on `<tr>` boundaries with repeating headers.
- `savePdfFromElement(...)` — wraps above + saves via File System Access API (persisted in IndexedDB).
- `writeFileToSubfolder(subfolderName, fileName, content)` — saves to a named subfolder within the memorised directory.

### Devis — purchase/sale margin logic

The **comparatif achat/vente** tab uses these rules for `puAchat` per line:
1. `Surcharge énergie MMA` lines → `puVente × (14.8 / 15)`
2. `Surcharge énergie hors MMA` lines → `puVente × (4.8 / 5)`
3. Free lines with `prixAchatLigne` set → use that value
4. Product lines → `getPrixPourQuantite(prod, quantite).prixAchat`

Replicate this pattern consistently in: the comparatif IIFE, devis card list (`totalAchatD`), and aperçu summary (`totalAchat`).

**`populateForm` price recalculation:** when loading an existing devis into the edit dialog, `prixUnitaireHT` is recalculated for any `'ligne'`-type row where `getVarianteDiff > 0`. This corrects values saved before the variant-prixDiff logic was added without overriding manually set prices on non-variant lines.

### Supabase migrations (`supabase/migrations/`)

SQL migrations are numbered by timestamp. Apply via Supabase dashboard SQL editor or CLI (`supabase db push`). `src/integrations/supabase/types.ts` is auto-generated — regenerate with `supabase gen types typescript`.

To apply programmatically from the browser, use the Supabase Management API with `localStorage.getItem('supabase.dashboard.auth.token')` at `https://api.supabase.com/v1/projects/qkjxcfosutclnahvxflf/database/query`.

### localStorage column visibility (table pages)

Pages like `Produits.tsx` persist visible columns in localStorage. When adding a new default-visible column, merge the saved set with the new defaults on load — otherwise new columns are invisible for existing users:
```ts
const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
const merged = [...new Set([...DEFAULT_VISIBLE_COLS, ...saved.filter(k => ALL_COLS.includes(k))])];
```

### Tableaux de données — colonnes & filtres (CONVENTION OBLIGATOIRE)

**Toute vue en tableau (desktop) DOIT** utiliser l'infrastructure partagée plutôt que des `<th>`/`<td>` codés en dur. Réutiliser systématiquement dans les futurs développements :

- **`useTableColumns<K>(storageKey, allKeys)`** (`src/hooks/useTableColumns.tsx`) : largeur (resize) + ordre (drag) des colonnes, persistés en localStorage (`${storageKey}_widths`, `${storageKey}_order`). API : `ordered(allCols, isVisible?)`, `widthStyle(key)`, `thProps(key)`, `resizeHandleProps(key)`, `dragKey`, `dragOverKey`.
- **`<ColResizeHandle {...cols.resizeHandleProps(key)} />`** : poignée de redimensionnement à poser dans un `<th class="relative">`.
- En-tête, ligne de filtres ET corps doivent tous itérer via `cols.ordered(...)` (même ordre partout, sinon colonnes désalignées).

**Filtres de colonne** — composants partagés, menus rendus en **portail** (position fixe, échappent à l'`overflow` du tableau) :
- **`FilterSuggestInput`** — texte libre + liste de suggestions (ouverte au focus). Pour colonnes texte.
- **`FilterChoiceInput`** — choix fixes ; `excludable` active le mode exclusion (clic prolongé/clic droit = masquer, valeur encodée `!a,b`). Helper `parseChoiceFilter`.
- **`FilterDateInput`** — Le / Avant / Après / Entre (calendrier). Helper `matchDateFilter`.
- **`FilterAmountInput`** — = / < / > / Entre (montant). Helper `matchAmountFilter`.

**Comportement attendu (à respecter partout)** :
- En-tête = libellé + flèche de tri + **icône filtre**. Clic sur l'icône → contrôle de filtre affiché **inline dans l'en-tête** (pas de ligne dédiée qui pousse le contenu).
- Fermé **sans** valeur → la colonne se replie sur l'icône seule (`onClose` retire la clé de `openFilterCols`). Avec valeur → le contrôle reste visible.
- Une barre **« Filtres actifs »** au-dessus du tableau liste les filtres en cours (chips avec ✕) + bouton « Effacer ».
- **Sélecteur de colonnes (`Columns2`) + roue crantée (`Settings`)** dans la dernière colonne d'en-tête : choix des colonnes visibles, réinitialiser ordre/largeurs (`cols.reset()`), import/export. À reproduire sur toute vue tableau.

**Bandeau titre fixe + en-tête sticky (à respecter partout)** :
- **`<PageHeaderSlot>`** (`src/components/PageHeaderSlot.tsx`) : portaile son contenu dans le bandeau titre fixe de `CRMLayout`, à droite du titre de page. Y placer la **barre de recherche** et le **bouton d'action principal** (ex. « Nouveau … ») + actions contextuelles → restent visibles au scroll. (Le layout rend `<PageHeaderSlotTarget />`.)
- L'**en-tête du tableau est sticky** : conteneur de scroll `overflow-auto max-h-[calc(100vh-9rem)]`, et chaque `<th>` en `sticky top-0 z-10 bg-muted` → la ligne d'en-tête reste figée pendant le défilement.
- Référence d'implémentation complète : **`Devis.tsx`** et **`Produits.tsx`** (filtres + colonnes + bandeau fixe + sticky). Tables converties à ce jour : **Devis, Produits**. À convertir : Stock (×3), Clients, Commandes Client, Factures Client/Fournisseur.

### TypeScript conventions

- **Never use `enum`** — always prefer string literal unions:
  ```ts
  type Status = 'draft' | 'sent' | 'signed'; // ✅
  enum Status { ... }                          // ❌
  ```

### Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

### Git / deploy

- Repo: `Poolito78/crmpool` on GitHub, branch `main`
- Auto-deployed to Vercel on push to `main`
- **Toujours pusher automatiquement** après chaque commit
- Supabase project ref: `qkjxcfosutclnahvxflf`
