# Pages, composants et conventions d'affichage — le détail

⚠️ **Ce fichier n'est PAS chargé automatiquement.** À ouvrir quand la tâche
touche une page, un composant, ou une vue en tableau. `CLAUDE.md` n'en garde
que la règle courte.

---

## Sidebar nav (`src/components/CRMLayout.tsx`)

La nav utilise un type union `NavEntry = NavLink | NavGroup`. Les groupes
(`Vente`, `Achat`) sont repliables, s'ouvrent quand une route enfant est
active, et gardent leur état dans `openGroups: string[]`. La liste plate
`NAV_FLAT` sert à la barre du bas mobile et au titre du bandeau.

- Tableau de bord, **Veille Concurrence** (`/veille-concurrence`), CRM
- **Vente** : Clients, Produits, Devis, Commandes Client, Factures Client
- **Achat** : Fournisseurs, **Devis Fournisseurs** (`/devis-fournisseurs`), Cmd Fournisseur, Factures Fourn.
- Stock, Calcul Transport
- **Paramètres** : Tableau de bord, Entrepôts, Devis, Veille Concurrence, Historique GED. Les 4 premiers sont des **liens profonds** vers les onglets de `/parametres` via `?tab=dashboard|entrepots|devis|veille` ; `Parametres.tsx` lit l'onglet actif depuis `useSearchParams`.

**Glisser-déposer d'un document — dans `CRMLayout`, donc sur TOUTES les pages.**
Les gestionnaires (`depotDragEnter/Over/Leave/Drop`), le voile et l'unique
`<AnalyseDocumentDialog>` vivent dans la coquille ; une page ne doit **pas** en
remettre une copie (elle ouvrirait deux fenêtres — c'était le cas du tableau de
bord). Fichiers et texte sont acceptés. ⚠️ Un **glisser interne** (réordonner
des colonnes via `useTableColumns`, déplacer une ligne de devis) émet les mêmes
événements : un écouteur `dragstart` en phase de capture lève `glisserInterne`,
et le dépôt est alors ignoré. Sans ce garde-fou, trier un tableau ouvrirait
l'analyse.

**Liens avec `?tab=` dans la nav** : un `NavLink.path` peut contenir une query
(`/parametres?tab=devis`). `CRMLayout` expose `isLinkActive(path)` (compare
`pathname` + `?tab=`, défaut `dashboard`) pour le surlignage, et
`isSectionActive(path)` (pathname seul, ignore la query) pour l'auto-ouverture
du groupe. `currentLabel` utilise `isLinkActive` puis un repli par pathname.

---

## Pages (`src/pages/`)

| Page | Rôle |
|---|---|
| `Devis.tsx` | Le plus gros fichier. Cycle de vie complet : liste (vue liste cartes / vue tableau colonnes), dialogue création/édition (onglets **Devis / Comparatif / MO / CRM / Notes & Fichiers**), dialogue d'archivage, PDF, email. Lignes éditables en mode cartes OU tableau (`lignesView`, persisté) — la vue tableau utilise `TABLE_LIGNE_COLS` + `useTableColumns('devis_lignes_table')` (colonnes resize/drag), en-tête figé dans la barre sticky, scroll H synchronisé. Sélection multi-lignes (cases à cocher) pour déplacer un bloc (groupe + lignes + sous-total) ensemble. **Fermeture / retour** : pattern historique navigateur — ouverture liste = `pushState` factice (back ferme la modale, reste sur la liste) ; ouverture via `?editDevis=` (navigation) = `navigate(-1)`. Voir `openedViaUrlRef` / `closeDevisDialog`. |
| `CRM.tsx` | 4 onglets : Pipeline / Actions / Calendrier / Analyse. Conteneur de scroll propre (voir plus bas). |
| `VeilleConcurrence.tsx` | Export par défaut `VeilleConcurrence` (page dédiée, wrapper flex pleine hauteur) + export nommé **`VeilleContent({ embedded? })`**. 4 sous-onglets (Fiches / Produits / Notes / Analyse) rendus **sur la ligne du titre**, actions à droite : menu **Action** (Export Excel / Envoi par email / Importer tarif) + bouton **+ Ajout**. `embedded` masque le titre et désactive le flex-fill. **Onglet Produits** : tableau data-driven (`PROD_COLS`/`PCol`) via `useTableColumns('veille_prod_table')`, filtres/tri **inline dans les en-têtes**, gear « colonnes » dans la dernière cellule d'en-tête, en-tête sticky, scroll unique flex-fill (`<Table containerClassName="flex-1 min-h-0">`). Colonne **Quantité** (prix par quantité). |
| `Produits.tsx` | Catalogue : paliers de prix, variantes, composition kit, liens fournisseurs, colonne qteVendue. Onglet **Images & fiches techniques** : adresse et libellé de la **fiche technique** (`ficheUrl` / `ficheLinkLabel`) — ⚠️ le bloc est rendu **avant** le garde-fou « enregistrez d'abord l'article », sinon on ne pourrait plus renseigner une fiche à la création. Bloc **« Documents de la catégorie »** : documents de famille hérités des catégories parentes, attachables depuis l'article — le sélecteur propose toute la chaîne avec le nombre d'articles touchés. Lien à texte raccourci par photo (`libelle`, éditable sous la vignette) + copie, bloc « Liens à coller » (voir `liensProduit.ts`). Glisser-déposer de photos (compressées avant envoi, `produitImages.ts`), galerie, choix de la principale, champ « adresse d'une image en ligne », jauge de place. ⚠️ La zone de dépôt fait `stopPropagation` : sinon le glisser-déposer global de `CRMLayout` intercepterait l'image. Onglet **Informations** : bloc **Tags** (`TagsArticle.tsx`) sous « Description détaillée ». Onglet **Prix** : historique en périodes datées (`useJournalPrix` + `periodesDePrix`). Prix d'achat et marge masqués sans `canAchat`. |
| `DevisFournisseurs.tsx` | Les offres **reçues** (Achat → Devis Fournisseurs). Page de consultation : ces devis entrent par `AnalyseDocumentDialog`, pas par une saisie. Liste dépliable, filtres par statut, export Excel. Une ligne montre son **sort** et si son prix a été **appliqué**. Le panneau déplié permet de **(ré)appliquer** les prix. ⚠️ Le `action` gardé en base dit ce qui était vrai le jour de la lecture ; l'écran **recalcule** l'état d'aujourd'hui via `proposerPrix` et l'écriture passe par `appliquerPrix`, la même fonction pure que le dialogue d'analyse. |
| `Clients.tsx` | Contacts CRM. Dialogue d'édition : onglets Infos / CRM (actions + historique devis + gagné/perdu). |
| `Stock.tsx` | Niveaux de stock. |
| `Fournisseurs.tsx` | Contacts fournisseurs, adresses de livraison, remises par catégorie. |
| `Commandes.tsx` / `CommandesClient.tsx` | Commandes achat & vente. |
| `FacturesClient.tsx` / `FacturesFournisseur.tsx` | Suivi des factures. |
| `GED.tsx` | Documents (pièces jointes par ligne de devis, table `devis_pieces_jointes`). |
| `CalculateurUPS.tsx` | Calcul des frais de port. 5 onglets : Standard, Transporteurs, Barèmes, Saisie manuelle, **Achat**. L'onglet Achat garde l'historique réel des achats de transport (réordonnable, triable, extraction PDF par IA). localStorage `crm_transport_achats`. `AchatTransport.fournisseur` (donneur d'ordre, ex. QRM) est distinct de `transporteur` (ex. UPS). |
| `StatsVariantes.tsx` | Statistiques de vente par variante. |
| `Parametres.tsx` | Onglets (`Tabs` contrôlé par `?tab=`) : **Tableau de bord** (visibilité des tuiles), **Entrepôts** (CRUD `useEntrepots`), **Devis** (vue par défaut + colonnes), **Veille Concurrence** (`<VeilleDisplayName>` + `<VeilleCorrectionPanel>`). |
| `FichePublique.tsx` | **Route publique `/p/:id`, hors authentification.** Ce qu'un client ouvre depuis un lien de mail : désignation, photos, description, bouton vers la fiche technique. **Aucun prix** — et la frontière est tenue en base : la fonction Postgres `fiche_publique(uuid)` (`security definer`, `grant execute to anon`) ne renvoie ni prix, ni coût, ni stock, ni fournisseur. ⚠️ **Fonction et non vue** : une vue ouverte à `anon` se lirait sans filtre et le catalogue entier (22 500 désignations) partirait au premier `select *`. La fonction exige l'UUID — indevinable, non énumérable. Filtre `disponible_vente`. La sortie de route est faite **en tête de `AppRoutes`**, avant les gardes chargement/session/compte actif : un lien de mail qui atterrit sur l'écran de connexion est un lien mort. |
| `Dashboard.tsx` | 2 onglets (localStorage `dashboard_tab`) : **Vue d'ensemble** (KPIs, alertes, derniers devis) et **Prévisionnel devis** — pipeline pondéré par `probabiliteReussite` : CA pondéré, coût fournisseur pondéré, marge pondérée ; filtres statut + période ; groupement par mois ; graphe `recharts` + export Excel. Liens devis avec `&returnTo=dashboard`. |

---

## Architecture de scroll de la page CRM

`CRM.tsx` remplit la hauteur de `<main>` en flex-fill et annule son padding via
marges négatives (alignées sur le padding réel de `main`) :

```
<div className="flex flex-col flex-1 min-h-0 -mx-4 md:-mx-6 -mt-2 -mb-20 md:-mb-6">
  <button className="flex-none">   ← bandeau « N actions en retard »
  <div className="flex-none">      ← barre d'onglets — NE scrolle JAMAIS
  <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">  ← le contenu scrolle ici
```

Les éléments sticky dans la zone de scroll utilisent `top-0` (pas `top-16`). Ce
motif évite le bug CSS où `overflow-x: hidden` sur un parent casse
`position: sticky`. ⚠️ Ne pas utiliser `-m-4` + `height: calc(100vh-4rem)`
(ancien hack) : depuis le passage de `<main>` en flex (`pt-2`), ça décalait le
bandeau sous le header.

---

## Composants (`src/components/`)

- `DevisPreview.tsx` — Rendu lecture seule du devis, pour l'aperçu écran et le PDF. Option **Fiches & photos** (`showLiens`) : ajoute en bas du devis, par article, sa fiche technique et sa photo. ⚠️ **Les liens y sont cliquables DANS LE PDF** grâce à `data-pdf-href` : le PDF étant une capture d'écran, un `<a href>` n'y serait qu'une image de texte — `generatePdfFromElement` relève ces éléments, mesure leur position et pose une annotation jsPDF par-dessus. Porter l'attribut sur le texte du lien, jamais sur la ligne entière, sinon toute la largeur devient cliquable.
- `DevisArchiveDialog.tsx` — Archivage : raison, commentaire pré-rempli éditable, concurrents (nom/prix/délai), modèles de message enregistrables.
- `CRMActionDialog.tsx` — Action CRM avec section repliable « Infos concurrence ». S'ouvre d'office pour Visite/Appel/RDV. Prop optionnelle `produits`.
- `ConcurrentDialog.tsx` — Fiche concurrent : 3 onglets (Infos / Produits / Notes). Prop `clients` pour le « client source ».
- `DevisEmailDialog.tsx`, `CommandeEmailDialog.tsx` — Composition d'email avec PDF joint. Génèrent des `.eml` RFC 822 (MIME multipart/mixed, `X-Unsent: 1` pour Outlook). Mobile : Web Share API ; repli téléchargement + `mailto:`. **Section « Liens produit »** : par article, jusqu'à trois liens (fiche technique, photo principale, fiche publique `/p/<id>`), cases + pastilles « tout cocher » par destination, **libellé éditable** et bouton **« Copier les liens »** (voir `liensProduit.ts`). Défaut : fiches techniques et photos cochées, fiches CRM **et documents de famille décochés** — une homologation ne s'invite pas d'elle-même dans tous les devis. Les photos sont lues **bornées aux articles du devis** (`.in('produit_id', …)`), jamais la table entière.
- `CommandeARDialog.tsx` / `CommandeARPreview.tsx` — Accusé de réception de commande.
- `ProduitFournisseursPanel.tsx` — Panneau des prix fournisseurs dans le formulaire article.
- `AnalyseDocumentDialog.tsx` — Classifieur de document par IA : lit PDF/EML/MSG, classe le type, extrait les champs. **Trois débouchés** : devis/commande client → `handleCreerDevis` / `handleCreerCC` ; commande ou BL fournisseur → réception (`handleReception`, `handleCreerCF`) ; **devis fournisseur → `handleAppliquerPrixAchat`**. Ce dernier écrit la fiche fournisseur (`produit_fournisseurs`, coché d'office) et, **seulement si la case est cochée**, le `prixAchat` de la fiche article — celui qui commande toutes les marges. Le rapprochement passe d'abord par `reference_fournisseur` (lien exact) avant `rapprocherArticle` (ressemblance). L'offre est enregistrée dans `devis_fournisseur` **même si aucun prix n'est appliqué**. ⚠️ **La reprise d'office d'une proposition Odoo applique les défauts métier** (`variantesParDefaut`, `variantFunnel.ts`) et non l'ordre d'Odoo : sur « panneau AK3 » il rend le AK3.1000 avant le AK3.700, et retenir le premier posait un 1000 à 50,02 € là où la règle dit gamme **Petite** — 39,41 €. Ce que le client précise l'emporte, et le filtre ne va **jamais jusqu'au vide** : une ligne sans article part au devis sans prix. **Fournisseur inconnu** : le nom lu part automatiquement en recherche Odoo (`rechercheOdoo('fournisseur')` → `importerFournisseurOdoo`), repli `creerFournisseurDepuisDocument(nom)`. Une seule requête par nom (`chercheFaitePour`). **Contact de l'affaire** : le sélecteur présélectionne l'interlocuteur (voir `contactRetenu`) ; `handleCreerDevis` le rattache via `rattacherContact` puis le porte sur `devis.contactId`. Une fiche Odoo **rattachée** (`estSociete: false`) est une personne : `importerClientOdoo` met la société mère dans `societe` **et** inscrit la personne dans `contacts`. ⚠️ `nomDuFournisseur()` écarte ISOSIGN : sur un devis reçu notre propre société figure en destinataire. Champ **Chantier** + proposition (`chantierDansTexte`), encart **brides** (`compterBrides`), sablier `tarificationEnCours` pendant les mises à jour de prix, zone de texte redimensionnable à hauteur mémorisée.
- `DevisAssistantDialog.tsx`, `AiCalculatorDialog.tsx`, `EmailAnalyzerDialog.tsx`, `EmailToContactDialog.tsx` — Workflows assistés par IA.
- `DevisChatter.tsx` — Fil de commentaires/historique sur un devis. Prop `embedded` pour l'onglet « Notes & Fichiers ».
- `ClientCombobox.tsx`, `ProduitCombobox.tsx`, `VarianteSelect.tsx` — Sélecteurs. `ClientCombobox` accepte `onCreateNew(societe)` : si aucune société trouvée, propose « Créer la société … ».
- `TagsArticle.tsx` — Puces de tags + saisie dans l'onglet Informations des Produits ; les tags **appris** portent une icône Sparkles.
- `TruncTooltip.tsx` — Texte tronqué avec infobulle au survol.
- `RichTextEditor.tsx` — Éditeur HTML riche (contentEditable + `execCommand`, sans dépendance) : gras/italique/souligné, titres, listes, taille, **couleur**. Utilisé par l'onglet MO. CSS placeholder `.rte-content:empty::before` dans `index.css`.
- `RowActionsMenu.tsx` — Roue crantée d'actions par ligne (menu en **portail** position fixe, jamais rogné). Actions = `{ icon, label, onClick, danger?, hidden? }`.
- `TableGearMenu.tsx` / `PageHeaderSlot.tsx` — voir « Tableaux de données » ci-dessous.
- `VeilleDisplayName.tsx` — Éditeur du nom d'affichage Veille (localStorage `crm_creator_names` + `veille_roles.display_name`).
- `VeilleCorrectionPanel.tsx` — Correction globale catégories/informateurs des produits concurrents (sous-composant `RenameGroup`).
- `ui/table.tsx` — le `<Table>` shadcn accepte un **`containerClassName`** optionnel (mergé sur le wrapper `relative w-full overflow-auto`). Indispensable pour borner le conteneur de scroll en flex-fill et obtenir un **en-tête `<th>` sticky**.

---

## Devis — logique de marge achat/vente

L'onglet **comparatif achat/vente** applique ces règles pour `puAchat` par ligne :
1. Lignes `Surcharge énergie MMA` → `puVente × (14.8 / 15)`
2. Lignes `Surcharge énergie hors MMA` → `puVente × (4.8 / 5)`
3. Lignes libres avec `prixAchatLigne` → cette valeur
4. Lignes produit → `getPrixPourQuantite(prod, quantite).prixAchat`

À reproduire à l'identique dans : l'IIFE du comparatif, la liste de cartes
(`totalAchatD`), et le récapitulatif d'aperçu (`totalAchat`).

**Overrides manuels du comparatif** : états `compaEditingId / compaEditVal`
(puAchat par ligne) et `portAchatManuel`. Saisie inline au clic, couleur ambre
quand surchargé, ↺ pour réinitialiser. `portAchat = portAchatManuel ?? portAchatCalcule`.

**Recalcul de prix dans `populateForm`** : à l'ouverture d'un devis existant,
`prixUnitaireHT` est recalculé pour toute ligne d'article où `getVarianteDiff > 0`.
Corrige les valeurs enregistrées avant la logique prixDiff, sans écraser les
prix posés à la main sur les lignes sans variante.

**Onglet MO (Mise en œuvre)** : `RichTextEditor` sur `moContent`. Bouton
« (Re)générer » construit le récap depuis groupes (titres), notes (texte) et
lignes produit. « PDF Mise en œuvre » → `generatePdfFromElement`, enregistré
dans le dossier devis **et** joint aux Notes & Fichiers (bucket `devis-pj` +
table `devis_pieces_jointes`).

**Aperçu/PDF (`DevisPreview`)** : les colonnes « Unité » (Condit.) et « KG »
retombent sur `l.quantite` (× poids) quand le calcul auto surface×conso
n'aboutit pas. Le PDF de l'email capture `#devis-print` (pas le wrapper) pour un
rendu identique au bouton PDF direct. Pagination : `minBreak` à 0.82 pour éviter
un grand vide en bas de page.

---

## Colonnes visibles en localStorage

Quand on ajoute une colonne visible par défaut, **fusionner** l'ensemble
enregistré avec les nouveaux défauts au chargement — sinon la colonne est
invisible pour les utilisateurs existants :

```ts
const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
const merged = [...new Set([...DEFAULT_VISIBLE_COLS, ...saved.filter(k => ALL_COLS.includes(k))])];
```

---

## Tableaux de données — colonnes & filtres (CONVENTION OBLIGATOIRE)

**Toute vue en tableau (desktop) DOIT** utiliser l'infrastructure partagée
plutôt que des `<th>`/`<td>` codés en dur.

- **`useTableColumns<K>(storageKey, allKeys)`** (`src/hooks/useTableColumns.tsx`) : largeur (resize) + ordre (drag) des colonnes, persistés en localStorage (`${storageKey}_widths`, `${storageKey}_order`). API : `ordered(allCols, isVisible?)`, `widthStyle(key)`, `thProps(key)`, `resizeHandleProps(key)`, `dragKey`, `dragOverKey`.
- **`<ColResizeHandle {...cols.resizeHandleProps(key)} />`** : poignée de redimensionnement, dans un `<th class="relative">`.
- En-tête, ligne de filtres ET corps doivent tous itérer via `cols.ordered(...)` (même ordre partout, sinon colonnes désalignées).

**Filtres de colonne** — composants partagés, menus rendus en **portail**
(position fixe, échappent à l'`overflow` du tableau) :
- **`FilterSuggestInput`** — texte libre + suggestions (ouvertes au focus).
- **`FilterChoiceInput`** — choix fixes ; `excludable` active l'exclusion (clic prolongé/droit = masquer, valeur encodée `!a,b`). Helper `parseChoiceFilter`.
- **`FilterDateInput`** — Le / Avant / Après / Entre. Helper `matchDateFilter`.
- **`FilterAmountInput`** — = / < / > / Entre. Helper `matchAmountFilter`.

**Comportement attendu** :
- En-tête = libellé + flèche de tri + **icône filtre**. Clic sur l'icône → contrôle affiché **inline dans l'en-tête** (pas de ligne dédiée qui pousse le contenu).
- Fermé **sans** valeur → la colonne se replie sur l'icône seule (`onClose` retire la clé de `openFilterCols`). Avec valeur → le contrôle reste visible.
- Une barre **« Filtres actifs »** au-dessus du tableau (chips avec ✕) + bouton « Effacer ».
- **Roue crantée (`Settings`) dans la dernière cellule d'en-tête** : composant partagé **`TableGearMenu`** = colonnes visibles + export Excel. (Produits/Devis ont leur variante inline ; `Produits` ajoute `Columns2` + reset via `cols.reset()`.)

**Bandeau titre fixe + en-tête sticky + pleine page** :
- **Coquille `CRMLayout`** : racine en **`h-screen overflow-hidden`**. Le bandeau titre (`<header>`) est `shrink-0`, et **`<main>` est l'unique zone qui défile** (`relative flex flex-col min-h-0 overflow-x-hidden`). → un seul scrollbar.
- **`<PageHeaderSlot>`** (`src/components/PageHeaderSlot.tsx`) : portaile son contenu dans le bandeau titre fixe, à droite du titre. Y placer la **recherche** + le **bouton d'action principal**. (Le layout rend `<PageHeaderSlotTarget />`.)
- Page « tableau seul » → carte en **`md:flex md:flex-col flex-1 min-h-0 bg-card rounded-xl border overflow-hidden`** ; conteneur de scroll interne en **`flex-1 min-h-0 overflow-auto`** (PAS de `max-h`). Racine de page en `flex flex-col flex-1 min-h-0`. ⚠️ Ne PAS utiliser `md:absolute md:inset-0` : ça recouvre un éventuel bandeau au-dessus (ex. « Retour au devis » via `?returnDevis`). Devis (vue tableau plein écran) reste l'exception en `md:absolute`.
- Page multi-sections (Commandes Client, Factures) → racine en **`flex flex-col flex-1 min-h-0 gap-4`** ; contenu au-dessus auto ; conteneur de tableau en **`flex-1 min-h-0 overflow-auto`**.
- Chaque `<th>` reste `sticky top-0 z-10 bg-muted`.
- ⚠️ Ne PAS utiliser `max-h-[calc(...)]` sur le conteneur de scroll (double scrollbar). Exception connue : `Stock.tsx` conserve encore `max-h` (refonte à faire).

Référence d'implémentation complète : **`Devis.tsx`** et **`Produits.tsx`**.
Filtres inline + barre « Filtres actifs » + bandeau fixe + sticky sont faits sur
**toutes** les vues tableau : Devis, Produits, Clients, Stock (×3), Commandes
Client, Factures Client, Factures Fournisseur, Veille Concurrence (Produits).

## Le client du bloc « Créer comme devis »

⚠️ **PLUSIEURS FICHES PEUVENT RÉPONDRE, ET L'ORDRE DU TABLEAU N'EST PAS UNE
RÈGLE.** `AnalyseDocumentDialog` prenait la **première** fiche dont l'adresse
figure dans le document (`clients.find`), sans regarder s'il y en avait
d'autres. Mesuré le 10/09/2026 sur la commande AGILIS/Roissy : le document
porte deux adresses connues du fichier — `bduflo@agilis.net` (M. Benjamin
DUFLO, société « AGILIS (27) », BEUZEVILLE) et `facture-agilis@nge.fr`
(« AGILIS IDF ROISSY CDG », LE THOR 84250, l'adresse de facturation de la
commande) — et le devis se créait sur AGILIS (27), au hasard du rang.

Désormais : on relève **toutes** les fiches qui répondent par adresse exacte ;
ce que le document **nomme** tranche ; et à défaut on **s'abstient**, les fiches
en lice partant en pastilles cliquables.

⚠️ **LA RAISON SOCIALE D'ABORD, LE NOM DE LA FICHE SEULEMENT À DÉFAUT.**
Tester les deux ensemble donne la victoire à l'expéditeur : son nom est
**toujours** dans le document, il le signe. « M. Benjamin DUFLO » l'emportait
ainsi sur « AGILIS IDF ROISSY CDG », alors que c'est la seconde qui désigne le
client de l'affaire. Une fiche de personne ne porte pas la société dans `nom` ;
une fiche de société, si — d'où le repli, qui ne sert qu'à celles-là. La
comparaison ignore la ponctuation : le fichier écrit « AGILIS (27) » là où le
client écrit « AGILIS 27 ».

⚠️ **Une ambiguïté au niveau le plus sûr ne se tranche pas plus bas** : quand
deux adresses exactes désignent deux fiches, on ne laisse PAS courir jusqu'au
domaine puis au nom deviné — les deux fiches partagent le groupe AGILIS, et on
retomberait sur un choix arbitraire en croyant l'avoir déduit.

⚠️ **LE DOMAINE DÉSIGNE LA SOCIÉTÉ, PAS L'AGENCE — et c'est lui qui mordait
pour de bon.** Même `clients.find` à l'étape suivante. Mesuré le 11/09/2026 :
la demande vient de Cyprien ALLART, `callart@agilis.net`, dont la signature dit
« AGILIS AIRPORT — Aéroport Roissy CDG, 77990 Le Mesnil-Amelot ». Cette adresse
n'est PAS au fichier client, donc la correspondance exacte échoue et l'on passe
au domaine — où **quatre** fiches portent `@agilis.net` (DUFLO, BRUGEL,
DE MELO, BLOTIAU). Le devis se créait sur « AGILIS (27) », à Beuzeville.
Désormais le texte départage, et c'est `rapprocherClient` qui s'en charge — il
pèse les mots par leur rareté (« AGILIS » ne désigne personne, « ROISSY »
désigne quelqu'un) et s'abstient quand plusieurs répondent. On lui passe la
main plutôt que de refaire un classement à côté du sien. Figé par deux tests
dans `rapprochementClient.test.ts`, avec le texte réel du message.

⚠️ **L'ADRESSE D'UN CONTACT DÉSIGNE SA SOCIÉTÉ, et le contact s'inscrit avec
elle.** Deux moitiés d'une même règle, inutiles l'une sans l'autre.

1. **Le rapprochement interroge les contacts**, pas seulement `client.email` —
   qui est souvent une boîte générique de facturation. Les demandes viennent
   des personnes : `callart@agilis.net` n'était nulle part, et rien ne menait à
   « AGILIS IDF ROISSY CDG », dont la fiche porte `facture-agilis@nge.fr`.
2. **L'expéditeur est enregistré** — à la création du client depuis Odoo comme
   à la création du devis, via `rattacherContact` (qui ne crée rien sans nom,
   n'écrase aucun champ saisi, et tranche sur l'adresse plutôt que sur le nom).
   Le contact Odoo DÉSIGNÉ garde la priorité ; l'expéditeur n'est qu'un constat.

`contactExpediteur` exige **un nom ET une adresse**, sinon il ne rend rien : une
adresse sans nom est un enregistrement technique, un nom sans adresse ne
retrouvera jamais la société. La signature lue prime (elle porte fonction et
téléphones) ; à défaut, `extraireIndices().expediteur` lit la ligne « De : ».
⚠️ Ne PAS se servir de `noms[0]` pour cela : ce tableau mêle expéditeur,
raisons sociales et lignes de signature — il désignerait une société dès
qu'aucune ligne « De : » n'existe, et créerait une fiche fantôme.
