# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite, localhost:8080 by default)
npm run build        # Production build (clears Vite cache first via prebuild)
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Vitest in watch mode
```

## Architecture

**Tech stack:** React 18 + TypeScript + Vite 5, shadcn/ui (Radix), Tailwind CSS, Supabase (Postgres + Auth), React Router v6, deployed on Vercel.

### State management — `useStore` / `useCRM`

All application state lives in a single large hook `src/lib/store.ts → useStore()`. It is provided app-wide via `StoreContext` and consumed in every page via `useCRM()`.

`useStore` holds: `clients`, `fournisseurs`, `produits`, `devis`, `produitFournisseurs`, `commandesFournisseur`, `commandesClient`, `facturesClient`, `facturesFournisseur`.

Each collection has an `updateXxx(fn: prev => next)` callback that applies the mutation locally **and** diffs against the previous state to fire the correct Supabase inserts/updates/deletes. This means there is **no separate API layer** — mutations go through the updater callbacks.

### DB ↔ App mapping convention

Every entity has a pair of private functions in `store.ts`:
- `dbToXxx(row)` — snake_case DB row → camelCase TS interface
- `xxxToDb(obj, userId)` — reverse, adds `user_id`

These are the only places that touch raw DB column names.

### Key domain types (`src/lib/store.ts`)

| Type | Notes |
|---|---|
| `Produit` | `prixAchat` = prix achat conditionné (unit cost). `paliersPrix?: PrixPalier[]` = tiered pricing by quantity. `prixHT` = public price. Distinct from `ProduitFournisseur.prixAchat` (catalog price/kg). |
| `LigneDevis` | `type` = `'ligne' \| 'groupe' \| 'soustotal' \| 'texte'`. Only `'ligne'` rows count in totals. `prixAchatLigne` = free-line purchase cost (e.g. energy surcharges). |
| `ProduitFournisseur` | Links a product to a supplier. `prixAchat` here is a **different field** (price per kg from supplier catalog) — do NOT confuse with `Produit.prixAchat`. |
| `Devis` | `modeCalcul: 'standard' \| 'surface'`. Surface mode uses `surfaceGlobaleM2` + per-product `consommation` to auto-compute quantities. |

### Key utility functions (`src/lib/store.ts`)

- `getPrixPourQuantite(produit, quantite)` — returns `{ prixAchat, prixRevendeur, prixHT }` from the correct price tier. **Always use this instead of `produit.prixAchat` directly** when the quantity matters.
- `calculerTotalLigne(ligne)` — line total after remise + TVA.
- `calculerTotalDevis(lignes, fraisPortHT, fraisPortTVA)` — full devis totals.
- `calculerFraisPort(poidsKg, hasGranulat)` — standard transport barème (fixed tiers).
- `calculerFraisPortBareme(bareme, poidsKg)` — generic barème (UPS / messagerie / GLS).

### Pages (`src/pages/`)

| Page | Role |
|---|---|
| `Devis.tsx` | Largest file. Full devis lifecycle: list, create/edit dialog, comparatif achat/vente tab, PDF generation, email. |
| `Produits.tsx` | Product catalog with tiered pricing, variants, kit composition, supplier links. |
| `Clients.tsx` / `Fournisseurs.tsx` | CRM contacts with delivery addresses, per-category discounts. |
| `Commandes.tsx` / `CommandesClient.tsx` | Purchase & sales order management. |
| `FacturesClient.tsx` / `FacturesFournisseur.tsx` | Invoice tracking. |
| `GED.tsx` | Document management (pieces jointes per devis line via `devis_pieces_jointes` table). |
| `Dashboard.tsx` | KPI summary. |

### Key components (`src/components/`)

- `DevisPreview.tsx` — Read-only devis renderer, used for both on-screen preview and PDF generation. Receives `onSurfaceChange` callback for persisting per-line m² edits.
- `ProduitFournisseursPanel.tsx` — Supplier pricing panel inside the product form; uses `prixAchatConditionne` (= `prod.prixAchat`) for unit cost calculations.
- `DevisEmailDialog.tsx`, `CommandeEmailDialog.tsx` — Email composition with PDF attachment.
- `CommandeARDialog.tsx` / `CommandeARPreview.tsx` — Order acknowledgement (AR) document.

### PDF generation (`src/lib/pdfFolder.ts`)

- `generatePdfFromElement(element, opts)` — renders a DOM element to multi-page PDF via `html2canvas` + `jsPDF`. Handles smart page-break detection on `<tr>` boundaries and repeating headers.
- `savePdfFromElement(...)` — wraps the above + saves to a user-selected folder via the File System Access API (persisted in IndexedDB).
- `writeFileToSubfolder(subfolderName, fileName, content)` — saves to a named subfolder within the memorised directory.

### Devis — purchase/sale margin logic

The **comparatif achat/vente** tab in `Devis.tsx` uses these rules for `puAchat` per line:
1. `Surcharge énergie MMA` lines → `puVente × (14.8 / 15)` (fixed ratio, independent of current product mix)
2. `Surcharge énergie hors MMA` lines → `puVente × (4.8 / 5)`
3. Free lines with `prixAchatLigne` set → use that value
4. Product lines → `getPrixPourQuantite(prod, quantite).prixAchat`

The same logic must be applied consistently in: the comparatif IIFE, the devis card list (`totalAchatD`), and the aperçu summary (`totalAchat`). If you add a new context that shows marge/coeff, replicate this pattern.

### Supabase migrations (`supabase/migrations/`)

SQL migrations are numbered by timestamp. Apply new migrations via the Supabase CLI or the Supabase dashboard. The `src/integrations/supabase/types.ts` file is auto-generated from the DB schema.

### Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

### Git / deploy

- Repo: `Poolito78/crmpool` on GitHub
- Auto-deployed to Vercel on push to `main`
- **Never push automatically** — always ask for confirmation first
