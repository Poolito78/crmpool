# Modules `src/lib/` — le détail

⚠️ **Ce fichier n'est PAS chargé automatiquement.** Il est là pour être ouvert
quand la tâche touche l'un de ces modules, et pas avant. `CLAUDE.md` n'en garde
qu'une ligne par module.

⚠️ **La source fait foi.** Chaque module porte son propre en-tête documenté (13
à 28 lignes) : c'est lui qu'il faut lire en premier quand on ouvre le fichier.
Ce qui suit en est le résumé, plus le contexte que la source ne peut pas
porter (mesures sur la base, historique des régressions).

---

- **`concurrents.ts`** — `useConcurrents()` hook + `formatCreateur(emailOrName)` utility. `formatCreateur` resolves an email to a display name stored in localStorage key `crm_creator_names` (`{ "email": "displayName" }`). Used wherever creator identity is shown in competitor watch. La table `concurrent_produits` a des colonnes additionnelles ajoutées par migration et incluses **conditionnellement** dans `concurrentProduitToDb` (spread `...(p.x !== undefined ? {...} : {})`) : `client_nom`, `informateur`, `date_renseignement`, **`quantite`** (numeric, prix par quantité). `ConcurrentProduit.quantite?: number`.
- **`historique.ts`** — Fire-and-forget audit log via `logHistorique(entry)`. Never awaited — never blocks UI. `fetchHistorique(opts?)` retrieves entries. Table: `historique`.
- **`rapprochementArticle.ts` — la famille imposée par le code** : ⚠️ **UN CODE NOMMÉ FERME LES AUTRES FAMILLES.** « panneau personnalisé "Déviation cyclistes" avec le style des panneaux **KC1** » retenait THERMOVELO128080, un sigle thermoplastique de marquage au sol à 156,82 €, parce qu'un tag « cycliste » y était posé — le tag était juste dans son contexte et faux dans celui-ci. Le **premier segment de la catégorie** porte la famille (`KC1.*` → SIGNALISATION TEMPORAIRE, `THERMOVELO*` → ISOMARK / H2) et `famillesAttendues(texte, produits)` la relève **sur le catalogue** — aucune liste de codes écrite à la main, qui serait fausse à la première gamme nouvelle. Un mot n'est un code que s'il commence par une lettre, porte un chiffre, et existe comme premier segment de référence : « 80x40 » et « panneau » n'en sont pas. C'est une CONTRADICTION (comme un diamètre qui ne concorde pas), pas une préférence de classement — mais elle ne filtre **jamais jusqu'au vide**.
- **`rapprochementClient.ts`** — Reconnaître le client dans un **texte tapé**, quand il n'y a pas d'adresse e-mail (le courriel se rapproche d'abord par expéditeur puis domaine ; ceci est le dernier recours). ⚠️ **TOUS LES MOTS NE SE VALENT PAS, ET LE FICHIER CLIENT LE DIT** : `poidsDesMots` mesure la rareté de chaque mot parmi les clients — « SIGNALISATION » chez 7 sur 50 ne désigne personne, « HORUS » chez 1 désigne quelqu'un. Pas de liste de mots interdits, elle serait fausse en six mois. Deuxième garde-fou : `motsFrequentsDuCatalogue(produits)` fournit le **vocabulaire du métier** (un mot dans ≥ 10 désignations d'articles) — sans lui, « 30 m² de résine époxy » sortait SERVICES & RESINE, car RESINE est rare chez les clients mais figure dans 58 articles. `rapprocherClient` fouille le **texte entier** (pas seulement `nomPartenaire`), compare des **mots entiers** (« SUD » n'est pas dans « SUDOKU »), rattrape les apostrophes perdues par la forme collée (« Villequip » = « VILL'EQUIP »), tranche entre deux fiches d'une même société en gardant la plus renseignée, et **s'abstient en rendant `candidats`** quand plusieurs répondent — l'écran les propose en pastilles cliquables. Tests : `rapprochementClient.test.ts`.
- **`journalPrix.ts`** — Historique des prix en **périodes datées**. La table `journal_prix` est alimentée par le déclencheur Postgres `trg_noter_prix` (fonction `noter_prix()`), qui écrit une ligne à chaque changement de `prix_achat` ou `prix_ht` avec la valeur d'avant et celle d'après. `periodesDePrix(mouvements, actuel?)` reconstitue les périodes, **de la plus récente à la plus ancienne** : un mouvement FERME une période et en OUVRE une autre, la plus ancienne n'a pas de `debut` (le journal ne remonte pas avant sa création) et la plus récente pas de `fin`. ⚠️ La période en cours prend les prix de la **fiche article**, pas ceux du dernier mouvement ; quand les deux divergent (écriture hors application, ou antérieure au déclencheur) elle porte `ecartAvecFiche: true` — la fiche fait foi et l'écart est signalé. `useJournalPrix(produitId?)` lit **à la demande** (jamais au chargement du catalogue : 22 508 articles). Tests : `journalPrix.test.ts`.
- **`prixAchatFournisseur.ts`** — Reprise des prix d'**achat** depuis un devis fournisseur. `rapprocherFournisseur(nom, fournisseurs)` compare les mots qui distinguent (la forme juridique et « France » n'en sont pas) et **s'abstient** quand deux fournisseurs se valent. `coefficientVente(produits, categorie)` **mesure** le rapport prix public / prix d'achat sur les articles de la catégorie (repli sur le dernier segment : `ISOMARK / FLOORING / EPOXY` → `EPOXY`) et renvoie `fiable: false` quand la famille ne s'accorde pas avec elle-même — vrai sur les résines (EPOXY/PU/MMA tiennent à 2,29), faux sur la signalisation où `prix_achat` mélange coûts à l'unité et au kilo. `prixVenteDepuisAchat` ne renvoie **rien** sans coefficient fiable : un prix de vente vide se voit au premier devis, un prix plausible et faux part chez le client. `proposerPrix({...})` classe la ligne en `actualiser | rattacher | inchange | absent | sans_prix`. **`appliquerPrix({...})` est PURE** — elle rend les tableaux `produits` et `liens` mis à jour sans toucher au store ni à Supabase : c'est ce qui garantit qu'un prix appliqué depuis l'analyse de document et le même prix appliqué six mois plus tard depuis la page Devis Fournisseurs produisent le même résultat. Elle ne redate pas un `prixAchat` déjà égal (sinon l'historique montrerait un mouvement là où rien n'a bougé). Tests : `prixAchatFournisseur.test.ts`.
- **`devisFournisseur.ts`** — `useDevisFournisseur()` : les offres reçues (tables `devis_fournisseur` + `devis_fournisseur_lignes`, RLS « tous authentifiés » comme `systemes` — un tarif engage la société, pas un commercial). Lecture **à la demande**, jamais au démarrage. `enregistrer(devis, sourceTexte?)` crée ou remplace en bloc (les lignes n'ont pas d'existence propre hors de leur devis). `marquerAppliquees`, `changerStatut`, `supprimer`.
- **`categorieDocuments.ts`** — Documents attachés à une **CATÉGORIE** d'articles (table `categorie_documents`, RLS « tous authentifiés »). ⚠️ **LA CATÉGORIE EST UN CHEMIN, ET C'EST CE QUI PORTE L'HÉRITAGE** : `produit.categorie` s'écrit « ISOMARK / H2 / PREFA THERMO » et un document posé sur « ISOMARK / H2 » s'affiche aussi sur les articles rangés dessous. Sans héritage la fonction serait inutilisable : 29 articles thermoplastiques sont dans « ISOMARK / H2 », **2 seulement** dans « ISOMARK / H2 / PREFA THERMO ». `chaineCategories` rend les ancêtres du plus précis au plus général, `documentsPourCategorie` les documents applicables (chacun marqué `herite` + sa catégorie d'attache ; **le plus précis gagne** sur un doublon d'URL), `articlesConcernes` **compte les articles touchés** — à afficher avant d'attacher, « SIGNALISATION POLICE » en couvre 13 163. `normaliserCategorie` rapproche « ISOMARK/H2 » et « ISOMARK / H2 » (les chemins viennent d'Odoo ET de la saisie). ⚠️ **Certains niveaux n'ont aucun article en propre** — « ISOMARK » n'est la catégorie de personne mais couvre 985 articles, « SIGNALISATION POLICE / Carre (C) » en couvre 3 907 : le sélecteur d'attache les propose quand même. **Que des liens, aucun fichier** : un PDF d'homologation pèse 2-5 Mo et ne se compresse pas comme une photo — le forfait gratuit ne le supporterait pas. `liensDocumentsCategorie(articles, documents)` produit les liens collables du devis, **dédoublonnés** (six panneaux carrés ne proposent pas six fois le même masque). Tests : `categorieDocuments.test.ts`.
- **`produitImages.ts`** — Photos des fiches produit (table `produit_images`, seau **public** `produits-images`). ⚠️ **LA CONTRAINTE QUI COMMANDE LE MODULE** : forfait Supabase **gratuit** = 1 Go de fichiers, dont ~103 Mo déjà pris par `devis-pj`. Un PNG d'appareil photo pèse 3-5 Mo ; on **compresse dans le navigateur avant l'envoi** (`compresserImage` : canvas → 800 px de plus grand côté → WebP q=0,82, repli JPEG quand `toBlob` ne sait pas écrire du WebP), ce qui ramène une photo à 40-60 Ko et fait tenir 15 000 à 20 000 images. Ne **jamais** stocker une image en base : la base gratuite est limitée à 500 Mo. Le seau est public (et non signé comme `devis-pj`) pour que le navigateur mette en cache — le CDN dispose de ses propres 5 Go d'egress. Deux provenances dans la même table : image **déposée** (`chemin` renseigné, compte dans le quota, supprimée du seau avec sa ligne) et image **externe** (`chemin` nul, ne pèse rien, jamais supprimée chez son hébergeur). `ordre = 0` désigne la principale — pas de colonne `est_principale` qui finirait par en désigner deux ou aucune. `useProduitImages()` lit tout d'un bloc : une ligne par image ajoutée, pas par article. Tests : `produitImages.test.ts`.
- **`contactAffaire.ts`** — L'interlocuteur de l'affaire, du fichier Odoo jusqu'au devis. `rattacherContact(contactsExistants, source, nouvelId)` est **pure** et rend `{ contacts, contactId, modifie }`. ⚠️ **Deux écritures, pas une** : le contact appartient au CLIENT (colonne JSON `contacts` sur `clients`), le devis n'en retient que l'`id` — rattacher quelqu'un à une affaire, c'est d'abord l'inscrire au fichier client. Le doublon est le vrai risque (la même personne revient sur chaque demande), donc on rapproche avant de créer : **l'adresse tranche, le nom non** — `email` exact d'abord, `memePersonne` seulement à défaut, sinon « Jean MARTIN » et « Sophie MARTIN » se confondraient. **On complète, on n'écrase pas** : un champ vide se remplit, un champ saisi à la main reste. Le nom part entier dans `nom`, sans découpage prénom/nom (Odoo écrit tantôt « Thierry BARAILLER », tantôt « BARAILLER Thierry », et deviner à l'envers s'imprimerait sur le PDF). Tests : `contactAffaire.test.ts`.
- **`liensProduit.ts`** — Les liens d'article qu'on colle dans un mail. ⚠️ **« Lien raccourci » ne veut PAS dire URL raccourcie** : aucun service tiers, aucune table de redirection — c'est le **texte affiché** qu'on choisit (la désignation), l'URL se cache derrière un `<a href>`. Trois destinations, complémentaires et non interchangeables : `fiche` (fiche technique fabricant, `produits.fiche_url`), `image` (photo principale, `produit_images`), `page` (fiche publique du CRM `/p/<uuid>`, seul lien qui reste juste quand la photo change). **Quatrième destination `categorie`** : un document de FAMILLE (voir `categorieDocuments.ts`) — il n'appartient à aucun article, donc ni `liensDuProduit` ni `articlesLiesDuDevis` ne le produisent ; c'est l'écran qui l'ajoute. `liensDuProduit` / `liensDesProduits` (dédoublonne un article présent sur plusieurs lignes), `liensHtml` / `liensTexte` (rendu), `copierLiens` — le presse-papiers porte **les deux formes à la fois** (`text/html` pour Outlook/Gmail, `text/plain` pour les messageries brutes), avec repli `execCommand('copy')` sur une sélection hors écran puis `writeText`. Le libellé saisi sur l'article (`ficheLinkLabel`) gagne toujours sur le libellé construit. Styles **en ligne** obligatoires dans le HTML (Outlook jette les feuilles de style ; un lien sans `color` s'affiche en noir donc invisible). Tests : `liensProduit.test.ts`.
- **`produitTags.ts`** — Les mots par lesquels le CLIENT demande un article, table `produit_tags` (RLS « tous authentifiés »). ⚠️ **LE CLIENT N'EMPLOIE PAS LE VOCABULAIRE DU CATALOGUE** : il écrit « cycliste », l'article s'appelle « Homme à vélo » — ni la référence, ni la description, ni la catégorie ne portent le mot tapé, donc la recherche ne rend rien et le rapprochement est refait à neuf à chaque devis, par chaque commercial. Un tag est un **synonyme du catalogue**, vrai pour tout le monde dès qu'il a été constaté une fois. ⚠️ **JAMAIS AFFICHÉ DANS UN DEVIS** — c'est le mot du client, pas la désignation commerciale ; aucun rendu (`DevisPreview`, PDF, mail, Odoo) ne le lit. ⚠️ **UNE TABLE, PAS UNE COLONNE `tags text[]` SUR `produits`** : on apprend depuis l'ÉCRAN DEVIS, et l'application écrit les articles par ligne entière (`produitToDb`) — ajouter un tag par ce chemin réécrirait les quarante colonnes, `prix_achat_maj` compris, et écraserait un prix corrigé entre-temps par quelqu'un d'autre. `tagACandidat(demande, produit, tagsConnus)` ne garde de la demande que ce que l'article ne dit pas déjà (`motsDuProduit` écarte « résine » sur une résine), sans les quantités, unités ni liaisons, et n'inscrit **tout seul** que si ce reste tient en un ou deux mots — au-delà c'est une phrase de circonstance, proposée et non inscrite. Points de capture : `selectProduit` dans `Devis.tsx` (⚠️ **avant** la ligne qui écrase `description` par `designationProduit(p)` — après, le mot est perdu) et `choisirArticle` dans `AnalyseDocumentDialog.tsx`. ⚠️ **RÉSERVE PARTAGÉE** (`useSyncExternalStore`, pas un `useState` par composant) : `ProduitCombobox` est monté une fois par ligne de devis, un hook par instance ferait trente requêtes à l'ouverture d'un devis de trente lignes. Dans `indexProduits.ts`, les tags entrent au **rang 2** (le plus large, avec désignation et catégorie), jamais devant une référence, et l'index porte aussi leur **pluriel** — on retient « cycliste », le client suivant écrit « cyclistes ». ⚠️ **LES TAGS NOURRISSENT AUSSI LE RAPPROCHEMENT AUTOMATIQUE**, pas seulement la recherche à la main — sans quoi ils ne serviraient jamais quand l'appli choisit seule. `rapprocherArticle(texte, produits, limite, tags)` les passe à `noter`, où un tag reconnu vaut **60 points** (au-dessus du seuil de certitude de 55 : quelqu'un l'a constaté sur un vrai devis) et vaut `caracteristiqueCommune` — sinon le contrôle final « rien ne les rapproche » écarterait justement l'article que le tag désigne. Comparaison par **mots entiers au singulier** : « 14 plots PVC » reconnaît « plot », « platoplot » non, et un tag de plusieurs mots exige que la demande les porte tous. ⚠️ **UN CODE DU CATALOGUE N'EST PAS UN SYNONYME** : `vocabulaireCatalogue(produits)` relève les mots portés par les RÉFÉRENCES, et l'apprentissage automatique les écarte. Mesuré sur le catalogue : `ak3` figure dans 18 références, `panneau` dans 2 — la fausse leçon « panneau ak3 » inscrite sur un AK14 (retenu par erreur pendant un essai) n'aurait jamais été apprise. Elle était inerte tant que les tags ne servaient qu'à la recherche, et ravageuse dès qu'ils ont valu une certitude : toute demande « panneau AK3 » retenait un AK14 d'office. **Aucun seuil de fréquence sur les désignations** : `plot` en compte 38, et c'est précisément parce que le PLASTOBLOC n'en fait pas partie que le tag vaut quelque chose. Le garde-fou ne vise que l'apprentissage AUTOMATIQUE — un tag saisi à la main reste libre. Tests : `produitTags.test.ts`, `rapprochementArticle.test.ts`.
- **`indexProduits.ts`** — Index de recherche du catalogue (22 634 articles), mémorisé en WeakMap sur le tableau `produits`. ⚠️ **DEUX CACHES ET NON UN SEUL** : `produitParId` est appelée à chaque rendu de chaque ligne de devis et n'a pas besoin des tags ; les entrées de recherche, si. Un cache unique reconstruirait 22 634 entrées à chaque alternance. `chercherProduits` classe en trois rangs (référence en tête / référence contenue / le reste), BRUT devant les laquées à rang égal, seaux plafonnés **séparément**.
- **`bridesDevis.ts` / `railsPanneaux.donnees.ts`** — **Une bride par rail**, le nombre de rails se LIT dans la table du catalogue. On n'invente jamais : famille ou cote absente → « à vérifier », hors du total. La signalisation temporaire a ses rails elle aussi (segment `.R.` sur AK/BK/KC/KD/CK) : triangles et disques lisent la table de la police, les rectangles valent 2 rails quelle que soit la taille, et un article créé pour l'affaire (sans code) n'est compté que s'il annonce « KIT RAIL » et que sa cote tient sous 850. ⚠️ La CLASSE (`C1`, `C2`, `C3`) se faisait prendre pour un code de panneau dans `AK3.700.C1.BTR…` — `CLASSE_SEULE` l'écarte. Le détail complet est dans les deux en-têtes de source (`claude/brides-et-rails.md` n'existe pas, malgré le renvoi de `reprise-2026-09.md`).
- **`chantierDemande.ts`** — Le chantier proposé depuis la demande du client (case Odoo `x_studio_chantier`). ⚠️ « chantier » est aussi un mot de la signalisation : l'objet du mail d'abord, et ce qui suit doit s'écrire comme un nom propre.
- **`pdfFolder.ts`** — `generatePdfFromElement` / `savePdfFromElement` via `html2canvas` + `jsPDF`. Smart page-break detection on `<tr>` boundaries. `writeFileToSubfolder` persists to a user-chosen directory via File System Access API (stored in IndexedDB). `zoneLienSurPage(lien, page)` est **pure** : où poser l'annotation de lien sur une page donnée, ou `null` si le lien n'y est pas. Le HAUT du lien décide de sa page (un lien à cheval reste cliquable là où il commence) et la hauteur est bornée au bas de page — une annotation qui déborde est perdue sans rien signaler. Tests : `pdfLiens.test.ts`.
- **`exportExcel.ts`** — `exportMultiSheet` generates multi-sheet `.xlsx` files (used for global data export from the nav bar).
- **`parseEml.ts`** / **`parseMsgPdf.ts`** / **`parseExcel.ts`** — Parse raw email and Excel files into structured objects for AI analysis and import flows.
- **`analyseDocument.ts`** — PDF text extraction via `pdfjs-dist`. Exports `TypeDocument` union and `TYPE_LABELS`.
- **`analyseTransport.ts`** — `analyserDocumentTransport(file, apiKey?, geminiKey?, openrouterKey?)` extracts transport data from PDF/text via AI (Groq → Gemini → OpenRouter fallback). Returns `TransportExtrait`: `fournisseur` (donneur d'ordre / sender, e.g. QRM, TREMCO CPG) **distinct from** `transporteur` (carrier, e.g. UPS, Heppner). Used in the Achat tab of `CalculateurUPS.tsx`.
- **`odooSync.ts`** — Generates a JS script to paste into the Odoo browser console to create a `sale.order`. Entry point: `genererScriptOdoo(devis, client, produits, options?)`. Constants: `ODOO_COMPANY_ID = 13`, `ODOO_FALLBACK_PRODUCT_ID = 362577`. Uses `promptOdooPartnerName(clientId, defaultName)` to handle partner name mismatches (cached in `localStorage` as `odoo_partner_<clientId>`). Le **chantier** (`devis.chantier`, repli sur `referenceAffaire`) est écrit dans la case Chantier d'Odoo.
- **`ralColors.ts`** — RAL colour reference data. `getRalInfo('RAL XXXX')` returns `{ hex, dark }`. `VarianteSelect` auto-renders colour swatches for options whose `label` matches `RAL XXXX` — no `imageUrl` needed. Texture images (e.g. QuartzColor swatches) require `imageUrl` pointing to `/quartz/*.jpg`.

---

## `odoo-prix` (Edge Function) — qui tarife

⚠️ **LE CONTRAT-CADRE TARIFE DÈS QU'IL EST RATTACHÉ ; SANS CONTRAT, LA LISTE
DE PRIX FAIT FOI.** Une seule variable le décide, `cadreTarife`, calculée une
fois dans `serve` et lue par les **deux** blocs de tarification (articles
désignés par référence, propositions de recherche) — les laisser trancher
chacun de leur côté est ce qui les avait fait diverger. Elle est vraie quand
un contrat-cadre est rattaché (`cadre.actif`) ou qu'un **niveau R1-R4 est
imposé** au sélecteur ; fausse quand la grille n'est qu'un filet. La grille ne
tarife dans tous les cas que ce qu'un gabarit atteint : ailleurs, la liste
reprend.

⚠️ **CE CAS ÉTAIT ÉCRIT ET N'ÉTAIT PAS CODÉ.** Le commentaire de `serve`
annonçait « sauf si un contrat cadre est réellement rattaché, il tarife
alors » depuis l'origine, mais `cadre.actif` ne servait qu'à charger le filet
et à renseigner l'écran : les deux blocs faisaient
`listeTenable ? pListe : pCadre` **sans condition**, et la liste doublait donc
le contrat en silence, y compris chez les clients qui en ont un (AGILIS :
contrat « CCI10031 CONTRAT CADRE AGILIS 2026 R4 & PAL » **et** liste « AGILIS
/ NGE (ISO-STI) »). Un niveau imposé au sélecteur ne remplaçait rien non plus.
Référence de validation du contrat : **AF035681** (REFLEX) — la liste cotait
le B14#30km/h.650.C2 à 60,32 €, le contrat le facture **46,62 €**.

⚠️ **Sans contrat rattaché, ne PAS doubler la liste de prix.** Mesuré sur
**AF036911** (MGD, liste « 30/70/72/… ») : la grille R4 chargée en filet
cotait AK3.700.C1.BTR.R.IS.BRUT à 39,41 € quand le devis émis le facture
**37,475 €**. La grille reste néanmoins chargée, et ce n'est PAS pour
tarifer : sans elle, le garde-fou « sous le coût » **retire l'article des
propositions** — la demande MGD/PANTIN ne proposait plus aucun panneau (KC1,
EPI, FP, point de rassemblement). Ce garde-fou ne joue donc que si **plus
rien** ne tarife l'article.

⚠️ **CE QUE LE CONTRAT DU CLIENT NE COTE PAS SE TARIFE À SON NIVEAU, PAS AU
CATALOGUE.** L'ordre est : **contrat du client → grille de SON niveau → liste
de prix**. Le niveau est lu dans le NOM du contrat (`niveauDuNom`), jamais
choisi : « CCI10031 CONTRAT CADRE AGILIS 2026 **R4** & PAL » → R4. Un contrat
client ne cote pas tout — celui d'AGILIS (#309) tarife le support et la bride,
pas le bouchon ni les fourreaux platine (« sans gabarit », grille vide pour
BOUC% / FPLA%). Vérifié ligne à ligne contre la commande Odoo, grille #276
« CCI10019 TARIF R4 » : `BOUCHON8040=1,400`, `FPLATINE8040=36,600`,
`FPLATINE8080=39,640` — les trois montants exacts de la commande. Le repli vit
dans une **seconde instance** `ContratCadre` (`cadreRepli`), `chargerNiveau`
remplaçant les ids de celle qu'on lui passe. Inutile quand un niveau est
imposé (`cadre` EST déjà cette grille) ou quand rien ne tarife (`cadre` sert
de filet). `source` vaut alors `"grille"`, distinct de `"contrat"`.

⚠️ **LE DÉFAUT D'ODOO N'EST PAS UN CHOIX.** `property_product_pricelist` n'est
jamais vide : sans choix sur la fiche, Odoo rend la liste par défaut de la
société, si bien qu'« aucune liste » et « mise exprès au tarif public » se
lisaient à l'identique. Le code préférait « la liste du contact si elle lui est
propre » : #102108 « AGILIS » rendait le TARIF PUBLIC (le défaut), qui
l'emportait sur « AGILIS / NGE (ISO-STI) » porté par la mère #75036.
`listePrixParDefaut` lit la propriété globale (`ir.property`, `res_id` vide) et
la comparaison rend les deux cas distinguables. Sans réponse d'Odoo, on garde
le comportement d'avant.

⚠️ **LE CONTRAT SE CHERCHE DANS TOUT LE GROUPE** (`famillePartenaire`) — le
couple (contact, parent) est trop étroit dès qu'un groupe éclate ses agences.
Deux passes, aucune ne suffisant seule : la **branche** (`child_of` depuis le
sommet) et les **fiches de même raison sociale**, car une agence sœur peut
être une RACINE distincte. Mesuré sur AGILIS le 10/09/2026 : la boîte de
groupe `facture-agilis@nge.fr` menait à #111772 → chapeau « AGILIS » #102108,
sans contrat, TARIF PUBLIC ; le contrat #309 vit sur « AGILIS 27 » #75203, une
racine sans lien d'arborescence avec le chapeau. Le support 80x40 sortait à
**89,43 €** quand la commande le facture **22 €** — et la grille contenait
pourtant `SG80401_5.3000.IS.BRUT=22`. Décision métier actée : **le contrat de
groupe vaut pour toutes les fiches du groupe**. Plusieurs contrats trouvés →
grilles réunies, et un `console.warn` les nomme (sans lui, la première ligne
rencontrée trancherait en silence).

⚠️ **UNE FICHE ODOO SANS NOM N'EST JAMAIS UN CLIENT.** Odoo laisse des
enregistrements techniques (facturation, livraison) dont `name` est vide — le
journal les imprime « false ». Ils ne portent ni contrat ni liste propre :
`trouverPartenaire` remonte au parent. Le garde-fou `incertaine` ne les voyait
pas, puisqu'il exige `!parent_id` et que ces fiches ont un parent.

⚠️ **Le NIVEAU se lit dans le nom du CONTRAT-CADRE, pas dans celui de la liste
de prix.** `AnalyseDocumentDialog` passait `contratOdoo.contrat` — la liste,
qui ne porte jamais de R — à `niveauDepuisContrat` : la lecture échouait
toujours et R4 tombait par défaut. Le contrat, lui, l'annonce (« … 2026 **R4**
& PAL »). Chez AGILIS les deux voies donnent R4, l'une par lecture et l'autre
par hasard ; chez un client en R2, seul le contrat le dit.

**Ce que l'écran renvoie** : `contratCadreActif` (rattaché) et
`contratCadreTarife` (a réellement tarifé) sont **distincts** — un contrat
peut être rattaché sans qu'aucun gabarit n'atteigne l'article. Chaque ligne
porte en plus son `source` (`"contrat" | "liste" | "aucun"`). Au sélecteur, le
contrat est le **choix par défaut** et les R1-R4 le repli manuel : en choisir
un REMPLACE le tarif négocié, et l'écran le dit.

⚠️ **Le Tarificateur suit l'ordre d'Odoo, en entier** :
`applied_on, min_quantity desc, categ_id desc, id desc`
(`product.pricelist.item._order`). Les deux derniers critères manquaient —
quand plusieurs règles de CATÉGORIE répondent, cas courant sur une liste qui
remise par famille, le gagnant était celui qu'Odoo avait renvoyé en premier.

⚠️ **Et la VALIDITÉ des règles est enfin lue** : `date_start`/`date_end`
étaient demandés à Odoo puis jetés (absents du type `Regle`, jamais testés dans
`applicable()`), si bien qu'une règle périmée tarifait comme une règle en cours.
