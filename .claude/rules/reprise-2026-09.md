# Reprise — travaux de septembre 2026

Ce que la session du 6-9 septembre 2026 a établi, pour qu'une session neuve
n'ait pas à le redécouvrir. Tout ce qui suit est **en production**.

⚠️ `.claude/session-handoff.md` date du **23 mai 2026** : ses « migrations en
attente » sont appliquées depuis longtemps. Ne pas s'y fier sans vérifier.

## La désignation d'un article

`produits.description` porte la désignation du **modèle** — « IS KC1 » pour les
douze déclinaisons de KC1. Elle ne dit jamais ce qu'on vend.
`produits.description_variante` porte celle de la **déclinaison**, importée
d'Odoo (« KC1 800 600 C1 BRUT (MARCO POLO) »).

**Un seul point de vérité : `designationProduit(p)`** dans `store.ts`. Elle rend
la déclinaison quand elle existe, le modèle sinon, efface les parenthèses vides
qu'Odoo laisse, et **rapatrie ce que le modèle annonce après un `+`** — sans
quoi « IS KD22A **+ PA** » perdait sa pointe amovible. Y passent : le sélecteur
d'article, la ligne de devis, la colonne Description de la page Produits, et le
référentiel envoyé au rapprochement. Ne jamais lire `p.description` directement
pour afficher ou nommer une ligne.

⚠️ **Le champ Odoo est `variant_description_sale`, PAS `name`** — `name` est la
colonne « Nom » de l'écran Odoo et vaut « IS A11 », comme chez nous. Une
première version de l'import s'y est trompée et a versé 5 616 fois la
désignation du modèle. Détails dans le doc projet `claude/designations-odoo.md`.

## La ligne de devis prend le nom de l'article

Dès qu'un article est retenu, **sa désignation fait foi**, pas le texte du
document client (« mât 1.50M », « plot PVC »). Ordre de priorité : libellé
corrigé à la main > désignation de l'article > texte du document. Une ligne
sans article garde le texte du document, où il EST l'information.

À l'ouverture d'un devis, une ligne dont le libellé est **exactement** la
désignation du modèle reprend celle de la déclinaison. L'égalité exacte est le
garde-fou : elle prouve que le libellé a été posé automatiquement et jamais
retouché.

## La recherche d'article

- **Mot à mot**, le point vaut l'espace : « A13A 700 » doit trouver
  `A13A.700.C1.BTR.IS.BRUT`. Un seul `includes` sur la saisie entière ne
  trouvait rien.
- **La vue « modèles » tombe dès qu'un mot est tapé** : le modèle des A13A est
  A13A.500, sa référence ne porte pas « 700 ». Chercher, c'est chercher partout.
- **BRUT devant les laquées** à rang égal, tant qu'aucun mot ne nomme un RAL
  (un mot qui commence par L, ou « BRUT »). Attention : « A11 **1000** » demande
  une cote, pas le laquage L1000.
- Les seaux de résultats sont plafonnés **séparément** : plafonner avant de
  trier ferait disparaître les BRUT quand assez de laquées les précèdent.
- ⚠️ **Un code IISR nommé en tête retient l'article local d'office**
  (`codesEnTete`, `rapprochementArticle.ts`) : « B1 sens interdit » restait
  « à choisir » alors qu'Odoo trouvait B1.650.C2.BTR.IS.BRUT. Code écrit
  exactement comme le premier segment de la référence (B1, jamais B14), dans
  les trois premiers mots significatifs ; la variante suit ensuite l'écran.
  Un code en fin de phrase (« au style des panneaux KC1 ») reste proposé.
  « J 4 » se recolle en « J4 » (seulement si c'est un code du catalogue), un
  code se reconnaît aussi avant le `#` (J4#1CHEVRON), et « N flèche(s) »
  départage les familles N CHEVRON(S). À égalité, le plus petit format.
- ⚠️ **Un mot en L d'une demande n'est pas un RAL** (`buildFunnel`) :
  « B14 **limitation** de vitesse » exigeait une finition « LIMITATION », ne
  trouvait rien et laissait le B14 450 C1. Ne contraint que L + chiffre, BRUT,
  ou une finition réellement portée par une variante.
- ⚠️ **Code tronqué « B6- »** (`normaliserCodes`, `tarifPanneaux.ts`) : le
  catalogue n'a pas de B6 seul. Règle métier : avec M6i → **B6D** ; sinon
  « arrêt et stationnement interdits » → B6D, « stationnement interdit » →
  B6A1 ; sinon rien. Appliqué dans `texteDemande` (calcul), pas au champ
  affiché. Le panneau part au devis et le M6I en ligne panonceau dessous.
- Le sélecteur reçoit le catalogue **entier** par `produits` et la
  pré-sélection par `suggestions`. Ne jamais borner `produits` aux candidats
  d'un rapprochement : la recherche manuelle devient aveugle.

## La proposition Odoo retenue d'office : ISOSIGN d'abord

Odoo mélange sous un même code les articles **ISOSIGN** (« IS AB4 », segment
`.IS.` dans la référence) et ceux de **Sud Ouest Signalisation** (« SO AB4 »,
`AB4.600.C2.BRUT`, sans `.IS.`). Les SO ne se prennent **jamais par défaut** :
`variantesParDefaut` (`variantFunnel.ts`) écarte tout ce qui n'est pas
ISOSIGN dès qu'une variante ISOSIGN existe (`estIsosign`), sauf si la demande
nomme SO. Sans variante ISOSIGN, les SO restent proposés plutôt qu'une ligne
sans prix. Le choix à la main reste libre.

⚠️ **La règle vaut aussi pour l'article LOCAL retenu d'office** (tag,
rapprochement) : un tag « cédez passage » appris sur AB3A.700.C1 retenait le C1
avec Classe 2 à l'écran. `varianteSelonDemande` le ramène à la variante
conforme (classe, gamme, IS), et une proposition Odoo retenue d'office se
réévalue quand la classe change. Seul un clic fige le choix.

## Les brides

**Une bride par rail.** Le nombre de rails se lit dans
`railsPanneaux.donnees.ts` — table du catalogue, famille par famille et taille
par taille. `compterBrides` (`bridesDevis.ts`) l'applique aux lignes du devis ;
un encart sous les lignes donne le total.

**On n'invente jamais un nombre de rails** : famille ou cote absente de la
table → « à vérifier », hors du total. Un rail en trop se facture au client, un
rail en moins manque sur le chantier. Voir `claude/brides-et-rails.md`.

## L'ensemble de police est une somme d'options (septembre 2026)

Un panneau de police ne part plus seul au devis. L'encart de tarif de
`AnalyseDocumentDialog` porte, **une case par ligne**, le support et les
fixations ; seul ce qui est coché part au devis, et le total de l'écran ne
compte que cela — il annonçait 91,33 € pour une ligne qui en facturait 36,01.

- **Un seul calcul** : `ensembleDeLigne(i)` sert l'affichage ET
  `handleCreerDevis`. Deux calculs finiraient par se contredire.
- **La section commande la fixation** : sélecteur unique pour toute l'affaire
  (`sectionSupport`), et `fixationDeSection` (`bridesDevis.ts`) en déduit
  l'article — collier galvanisé sur Ø60, bride acier sur les profils carrés,
  collier alu sur les tubes. Les cases « tous les supports » / « toutes les
  fixations » cochent d'un geste.
- **Les fixations se comptent par les rails**, jamais « une par élément porté »
  comme le faisait `supportPour`. La fonction ne les compte plus du tout :
  `fixationsPour` s'en charge, et une cote hors table se signale au lieu de se
  deviner — la case reste alors hors de portée.
- ⚠️ **AUCUN PANONCEAU N'EST PROPOSÉ.** Un M9z partait d'office sous chaque
  panneau : il s'affichait, mais surtout il allongeait le mât de sa hauteur et
  ajoutait un rail, donc une bride — un « AB4 STOP » seul annonçait un mât de
  3,50 m et trois colliers pour un ensemble qui n'en demande que deux.
  `ensembleDeLigne` ne retient donc un panonceau **que si le client en nomme
  un**, de deux façons :
  - **sur la ligne du panneau** — « AB3a+M9c Cédez le passage »
    (`panonceauDansTexte`, qui cherche après le code du panneau) : la ligne ne
    désigne que le panneau, le panonceau a donc sa **case, cochée par défaut**
    (`d{i}:pano`, clé absente = coché) et part en ligne sous le panneau.
    ⚠️ **Décoché = le client n'en veut pas du tout** : il sort du devis, mais
    AUSSI de la hauteur du mât et du compte des brides (`panonceauPose`) ;
  - **à la ligne suivante** : il y a déjà sa ligne au devis (le reprendre le
    facturerait deux fois) et ne paraît à l'encart, en gris, que parce qu'il
    pèse sur le mât et sur les brides.
- ⚠️ **Une ligne chiffrée à la grille part SOUS SA RÉFÉRENCE, pas en négoce.**
  Panonceau d'option et panneau sans article partaient en ligne libre, sans
  référence : Odoo les créait en « GE NEGOCE ISO » (devis AF037419). La
  référence se déduit du chiffrage — `M9C.350.150.C1.BTR.IS.BRUT`, code,
  cotes, classe, BTR, IS, BRUT — et `articlePolice` ne la retient **que si
  l'article existe au catalogue** (une référence fabriquée se ferait
  rapprocher d'une voisine chez Odoo). Le panneau sans article part au prix de
  la grille, plus à 0 €. Et la recherche Odoo du panneau retire le panonceau
  accolé (« AB3a+M9c ») qui la brouillait.
- **`PANO_CLASS` se lit sans casse** : la table écrit « M4c », la lecture d'une
  demande rend « M4C » ; toute classe fixe était ratée.
- ⚠️ **Sous un AB3a, la page du catalogue l'emporte sur la table de groupe**
  (`PANO_PAR_PANNEAU`) : M9c 350x150 en P (et non 500x150), M5a 500x500 en N.
  Le panonceau prend la **classe de rétroréflexion du panneau** : classe 2 par
  défaut sur les AB, classe 1 si le client la demande — c'est le sélecteur de
  classe commun, la classe n'est pas lue dans le texte de la ligne.
- **`SUP_SECT` est troué** (pas de 2 m ni de 3 m en 80×40, rien au-delà de 4 m
  en alu) : une longueur absente se prolonge depuis la plus proche inférieure au
  mètre linéaire du tarif, et l'écran l'annonce. Vérifié : 1,5 m + 1 × 6,95
  donne 18,60 là où le tarif porte 18,58.

### La hauteur sous panneau

2,10 m et 0,50 m d'ancrage partout, **sauf en pose basse**. Les chevrons B21 et
les balises J5 bordent l'obstacle qu'ils signalent : `estPoseBasse` les
reconnaît, la hauteur sous panneau y vaut par défaut **la hauteur du panneau**
— un B21a de 650 se pose à 650 mm, un J5 de 500 à 500 mm — et un sélecteur
permet de revenir à 2,10 m ou de saisir la valeur du terrain.

⚠️ **Le J5 n'a aucune grille dans `TARIFS`** et `codeDansTexte` ne le reconnaît
pas : la règle l'attend, mais il n'atteint pas encore le chiffrage. C'est
voulu — on ne lui invente pas un prix de triangle.

## Les systèmes résine : petits mélanges et fiches du dossier (16 sept.)

- **Flowfast 319 Concrete** est en base (migration `20260916120000`), tiré de
  `Fiches système\Flowfast 319 Concrete`. Couche teintée en **kits de 5 m²**
  (319 Unp. 2,5 kg + SNL Concrete 1,255 kg + pigments 0,2 kg) :
  `systemes.surface_kit_m2` / `kit_surface_max_m2` (50),
  `systeme_composants.au_kit` / `conditionnement_kg`. Une **bande** (largeur
  ≤ 0,15 m) passe toujours en kits ; une surface pleine au-delà de 50 m²
  revient au kilo (`kitsPour`).
- **La surface d'un tracé se calcule** (`traceDansTexte`) : « 0,10 m de largeur
  x 965 ml » → 96,5 m². Une **flèche** se chiffre à sa surface peinte
  (`surfaceFleche`) : 0,123 m² pour 1 400 mm, au carré de la longueur —
  **0,56 m² pour 3 m** (règle du chargé d'affaires). Le **logo piéton**
  aussi (`PICTOGRAMMES`) : 0,129 m² pour 1 000 mm de haut. Un logo absent de
  la table reste compté au rectangle (maximum).
- ⚠️ SNL Concrete 1,255 kg et pigments 0,2 kg **n'ont pas d'article** : lignes
  libres sans prix. `SNLC2` (SNLC 319 Concrete 2,51 kg, ISOMARK) **n'existe
  pas chez Odoo** : sa `reference_odoo` valait à tort SNLR1 (le SNL 319
  **Road**) et l'envoi l'y rattachait — remise à NULL le 17/09, la ligne part
  en NEG.SH.ISO.
- **Système nommé mais absent de la base** (`ressembleASysteme`) : la table est
  relue, puis `SystemeIntrouvable` cherche la fiche dans le dossier (choisi une
  fois, droit mémorisé en IndexedDB), la fait lire par Gemini, montre les
  dosages à relire, et n'enregistre qu'au clic.
- **Système nommé une fois pour tout le document** (`systemeDocument`,
  `AnalyseDocumentDialog`) : « un système Flowfast 319 Concrete : » puis des
  lignes « Ligne jaune 0,10 m de largeur » (la lecture range les 965 ml dans
  la QUANTITÉ). Les lignes de tracé deviennent des ZONES (`zoneDeDemande`) et
  le chantier se chiffre en un bloc (`chiffrerZones`) : composants communs
  additionnés puis mis en seaux, un pigment par teinte, le jaune avec le sien.
  Au devis : en-tête, note des zones, composants — portés par la 1re zone.

## Le négoce Odoo dépend de la gamme (17 sept.)

Un article **ISOMARK / ISOFLOOR** absent d'Odoo part en **NEG.SH.ISO**, le
reste en NEG.ISO. `codeNegoce` (`odooSync.ts`) lit la gamme sur l'article
(catalogue, catégorie « ISOMARK /… », `niveauGamme`), à défaut sur
`LigneDevis.gamme` — que l'analyse pose à « ISOFLOOR » sur les composants de
système sans article. La ligne envoyée porte `negoce` ; `odoo-devis`, le pont
et le script console résolvent chaque code, et retombent sur NEG.ISO si le
code manque chez Odoo (`rapport.negoceIntrouvable`).
⚠️ **À déployer** : `.\deploy-function.ps1 odoo-devis` — sans cela la
fonction ignore `negoce` et tout part encore en NEG.ISO.

## L'export Odoo et la référence manquante (18 sept.)

Le devis partait avec la moitié de ses lignes en **GE NEGOCE SH ISO** alors
qu'Odoo porte les articles. Cause : les articles du **catalogue métier
ISOFLOOR** — `FLOWFAST319`, `QUARTZ0308`, `SNLFILLER`, `FLOWFAST107`,
`PIGMENTKG` — n'ont **pas de `reference_odoo`** (142 articles sur 22 726 ;
25 des 45 articles employés par les systèmes). L'export envoie alors la
référence MonCRM, qu'Odoo ne connaît pas, et `resoudreArticles` doit deviner.

⚠️ **ET IL DEVINAIT MAL.** `FLOWFAST107` — « FLOWFAST 107 Primer (20 kg) » —
se rapprochait à 92 % de `FLOWFASTF107`, « FLOWFAST 107 CERAMIC PRIMER
(**180KG**) » : treize unités commandées faisaient 2 340 kg au lieu de 260, et
rien ne le disait. Odoo porte pourtant `FLOWFASTPRIMER107.20` en 20 kg.

- **`conditionnementCompatible`** (`odoo-devis`) : quand les DEUX libellés
  annoncent un conditionnement et qu'ils diffèrent, le candidat est écarté —
  passes 3 et 4 seulement, un code exact fait toujours foi. Effet mesuré : le
  fût de 180 kg est refusé, et `FLOWFAST319` **se résout enfin** en
  `FLOWFAST31920` (100 %), le jumeau de 10 kg qui le bloquait à 97 % étant
  maintenant hors course.
- **`rapport.aRattacher`** : ce qui reste orphelin remonte avec les candidats
  Odoo nommés, et l'écran du devis propose « Retenir FLOWFASTPRIMER107.20 ».
  Le clic écrit `referenceOdoo` sur l'article : l'envoi suivant le trouve par
  code exact. Un candidat écarté au conditionnement s'affiche barré, sans
  bouton — on ne le retient pas d'un geste distrait.
- ⚠️ **On ne devine toujours pas à la place de l'utilisateur.** Un candidat
  sous le seuil est proposé, jamais retenu. C'est la règle de la maison : un
  rail en trop se facture, un rail en moins manque au chantier.
- ⚠️ **À déployer** : `.\deploy-function.ps1 odoo-devis`. Sans cela le
  rapport ne porte pas `aRattacher` et l'écran n'a rien à proposer (le front
  le supporte : liste vide).
- ⚠️ Les helpers `conditionnement` / `conditionnementCompatible` vivent dans
  la fonction Edge : **vitest ne les couvre pas** (`include: src/**`). Ils ont
  été vérifiés sur les vraies données du catalogue.

## EB10 / EB20 : des panneaux directionnels P50 (26 sept.)

Un panneau d'agglomération part en DR50 et se fixe comme un Lapérouse P50 :
`colliersAgglo` (`AnalyseDocumentDialog`) ajoute, case cochée par défaut, les
fixations `fixationsP50` (`bridesDevis.ts`) — 1 par rail et par support, rails
de `railsLaperouse`, référence d'après la section de l'affaire (Ø76 alu →
CO76SFP50, 80×80 → BR8080SFP50…), prix de la grille du niveau. Nombre de
supports saisissable (1 par défaut).

## odoo-prix : la Variant Sale Description (26 sept.)

La désignation renvoyée par `odoo-prix` est la **Variant Sale Description**
(« DF50 1000 250 C1 50 O BRUT FLECHE LAPEROUSE P50 »), champ retrouvé par son
libellé (`champDescriptionVariante`, un `fields_get` par instance, `null` en
cas d'échec → repli sur `display_name`). Avant, l'`Article` construit depuis
la lecture Odoo perdait `display_name` et la réponse de prix rendait le nom du
modèle (« IS DF [P50] »).
⚠️ **À déployer** : `.\deploy-function.ps1 odoo-prix`.

## Plans directionnels : les DV de position (27 sept.)

DV12, DV21a/b, DV43a/b, DV44, DV61 (« Dv21b 600x100 » chez Kadri) ne sont
pas des Lapérouse P50 : profil P25, deux finitions qui sont des GAMMES
comme Lapérouse ou Vasco, réglées sur la gamme Kadri qui les porte
(« MICROSERT CL1 », `gammeProposee` / `gammeDuPanneau`) — **bords pliés par défaut**
(modèle Odoo `IS BPSP`, référence LUE dans `VARIANTES_BPSP` : deux sans
`.ST`, quatre absentes) ou **Champlain** `DR25.l.h.Cn.25.IS.BRUT` (grille,
pas de 100 de haut). Colliers `CO{Ø}SFP25`, **2 rails** par panneau en
Champlain comme en bords pliés (confirmé le 27/09). BPSP n'est dans aucun
contrat cadre : Odoo le tarife à la liste de prix du client — **c'est voulu** (ATS 43,30 € là où le
catalogue R4 dit 34,71 €).

## Pavés à coller ISOMARK : un système au m² (28 sept.)

Demande EMPREINTE SIGNA « Pavé rustique 15×20 jaune clair avec la colle et la
silice pour les joints » : aucun système reconnu, et Odoo retenait d'office un
POCHOIR à 19,20 €. Migration `20260928100000` :

- **Système « Pavés à coller »**, variantes 10x10 / 15x15 / 15x20 (les formats
  du tarif ; le 10x20 est chez Odoo mais pas au tarif — pas proposé). Pavés
  **au m²** (`systeme_composants.unite = 'm2'` : la quantité est la surface,
  jamais convertie en contenants), **un article par tranche de surface**
  (`surface_min_m2` exclue / `surface_max_m2` incluse : < 30, 31-100, 101-300 ;
  > 300 = ligne sans article, « nous consulter »). La tranche se lit sur le
  chantier entier dans `chiffrerZones`. Colle **Eclipse** (ECLIPSE25) à
  **5 kg/m²** par défaut (le tarif dit 4), en seaux de 25 kg. **Silice
  par défaut = QUARTZGRI0.7-1.3** (quartz gris clair 0,7-1,3, sac 25 kg,
  acheté chez URBADECCO sous sa propre référence — règle du 28/09, migration
  `20260928120000`), à ½ sac par seau : facultative, **cochée d'office quand
  la demande nomme son rôle** (`composantDemande`). L'article `SILICE0409`
  (0,4/0,9 du tarif, créé le 28/09) n'est plus employé par le système.
- **Client retrouvé par la personne** (`clientsParPersonne`) : même partie
  personnelle d'adresse (`martialmarliere@gorez.fr` ↔
  `martialmarliere@empreintesignalisation.fr`) ou prénom + nom d'un contact
  cités dans le mail — entre l'adresse exacte et le domaine. Et **après la
  réponse d'Odoo** : si aucun client n'est retenu, le contact Odoo
  présélectionné et la fiche Odoo sont cherchés au fichier de la même façon
  (réponse unique seulement, jamais par-dessus un choix).
- **Note sous les pavés** (`precisionDemande`, `noteSysteme`) : l'aspect et la
  teinte du client (« Pavé rustique couleur Jaune clair ») partent en ligne
  de texte sous le premier composant vendu au m² ; champ modifiable à l'écran.
- **Des mètres linéaires ne sont pas des m²** (`lineaireDeDemande`,
  `surfaceDepuisLineaire`, `lineaireDeLigne`) : « 22 ml » de pavés 15×20 se
  chiffre en bande sur le plus petit côté du format, 22 × 0,15 = 3,3 m². L'unité
  vient de la lecture (`LigneAnalysee.unite`, ajoutée au prompt), à défaut du
  texte de la ligne ou du document (« 22ml »). Sans format lisible, rien n'est
  converti ; un tracé ou une surface écrite gardent leur calcul.
- **ADR** (`produits.adr`, case « Matière dangereuse (ADR) » de la fiche,
  migration `20260928160000`, cochée sur ECLIPSE25 / ECLIPSE) : un envoi
  ISOMARK H2 qui en contient se paie à la **grille au poids, sans franco**
  (règle du 28/09 ; le tarif dit « franco 1 000 € hors ADR »). Sans ADR, le
  forfait H2 reste de 51 €.
- **Le poids de la fiche passe avant le libellé** (`LigneGamme.poidsUnitaire`,
  `poidsUnitaireDe`) : pour des pavés au m², `produits.poids` = poids d'un m².
  Le bloc système affiche le poids de l'envoi et nomme ce qui n'en a pas ;
  le port affiche son poids. Les PAVPREF pèsent **8 kg/m²** (règle du 28/09, migration `20260928170000`).
- **Coût chantier : une ligne au m² se compte au m²** (`coutChantier`,
  `DevisPreview`) : les pavés (conso « 1 m²/m² ») étaient divisés par leur
  poids — DEV-2026-112 annonçait 31,55 €/m² pour 73,11.
- **Le port part sous son mode d'expédition Odoo** (`modeExpeditionSH`,
  `devis.frais_port_libelle`, migration `20260928180000`) : un envoi unique
  payé à la tranche de poids porte « FRAIS DE PORT SH DE 26 A 100KG » (1-25,
  26-100, 101-700, > 700), et `odoo-devis` retrouve l'article de ce nom
  (PORTSH100) au lieu du générique. Forfait, franco ou plusieurs expéditions
  payantes : port générique. ⚠️ **À déployer** : `.\deploy-function.ps1 odoo-devis`
  (sinon `portNom` est ignoré). Le script console n'en tient pas compte.
- **Le port des gammes compte les composants d'un système** (`transport`,
  `composantAuPort`) : une ligne système ne retient aucun article et était
  sautée — « Pavés à coller », tout en ISOMARK H2, partait sans les 51 € de
  port H2. Chaque composant rattaché à un article rejoint le sac de sa gamme
  (ISOMARK H1/H2, ISOFLOOR, sinon ISOSIGN), système de ligne comme système
  du document.
- La fonction Odoo « (Vide) » n'est pas une fonction : filtrée à la lecture
  des contacts (3 fiches nettoyées en base le 28/09).
- ⚠️ **LES PRIX ODOO DES PAVÉS SONT FAUX, LE TARIF FAIT FOI.** Le public Odoo
  est divisé deux fois par 0,7 (96,96 € pour 47,50 € applicateur), > 300 m² à
  1,41 €, ECLIPSE25 à 202,84 € pour 99,50 €. Le tarif applicateur du
  15/07/2026 est rangé en **`prix_tarif` = tarif ÷ 0,7** (le public), que
  `prixDetail` lit avant `prix_ht` et remise de 30 % (H2) — il l'emporte sur
  le contrat Odoo quand ils diffèrent. `prix_ht` n'est pas touché (la synchro
  Odoo le réécrit).
- **Reconnaissance** : `rapprocherSysteme` compare des **radicaux** (« pavé »
  = « Pavés », « colle » = « coller ») et **le format choisit la variante**
  (« 15×20 », « 15 x 20 »).
- **Système choisi à la main après l'analyse** : lien « chiffrer en
  système… » sous chaque ligne de demande (`systemeManuel`, `systemeImpose`) ;
  « aucun — chiffrer en article » annule une reconnaissance.
- Teintes standard : sable, rouge brun, gris. « Jaune clair » n'y est pas —
  à valider avec ISOMARK (BAT), le système ne le dit que dans sa description.

## Pièges d'implémentation rencontrés

- **Pas de `<select>` natif dans un dialogue Radix** : sa liste s'ouvre hors du
  DOM, le dialogue la prend pour un clic « en dehors », reprend le focus et
  annule le choix. Utiliser le composant `Select` du projet. (C'est ce qui
  bloquait le niveau de remise sur R4.)
- ⚠️ **Une notification (sonner) vit hors du dialogue Radix** : un clic sur son
  bouton est un « clic à l'extérieur ». Sur l'analyse, « Retenir « … » comme
  tag ? » fermait le dialogue et `reset()` effaçait tout. `onInteractOutside`
  ignore désormais `[data-sonner-toaster]`, et tout clic extérieur une fois
  l'analyse faite. Même garde à poser sur tout dialogue qui émet un toast à
  bouton.
- ⚠️ **Une pièce jointe de .msg se lit dans la STRUCTURE, pas au flair**
  (`lirePiecesJointesMsg`, `lireMsg.ts`) : le balayage binaire coupait le PDF
  au PREMIER `%%EOF`, or un PDF linéarisé en porte un dès sa table de première
  page — le fichier partait tronqué et pdf.js le refusait avec « Invalid Root
  reference. » On lit désormais l'arbre du conteneur OLE : le dossier
  `__attach_version1.0_#…`, son flux `37010102` pour les octets, `3707`/`3704`
  pour le nom — qui devient celui affiché, au lieu de « piece-jointe-1.pdf ».
  Le balayage reste en secours et garde le DERNIER `%%EOF`.
- **Fonction Edge** : ne pas appeler `fields_get` à chaque page d'un traitement
  par lots — c'est ce qui faisait tomber `odoo-designations` en 500 une page
  sur sept. Passer le nom du champ dans le corps.
- **Traitement long** : curseur sur une colonne unique et ordonnable (la
  référence), jamais un offset, et un fichier d'état pour reprendre.

## Ce qui reste ouvert

1. **La RÉFÉRENCE de la bride** reste à trancher. La section est désormais
   demandée à l'écran, et l'article s'en déduit par famille (collier galva,
   bride acier, collier alu) avec son prix — mais pas encore par référence
   catalogue : le profil du panneau en désigne la moitié (BP → P25, BTR → P50)
   et cette moitié-là n'est pas lue. Les lignes partent donc au devis en ligne
   libre, sans `produitId`.
1bis. **Le J5 n'est ni détecté ni tarifé** : `codeDansTexte` ne le reconnaît
   pas et `TARIFS` ne le porte pas. La règle de pose basse l'attend
   (`estPoseBasse`), le chiffrage ne l'atteint pas.
2. **Panonceau 350×350** : 1 rail page AB, 2 rails page B. On retient 2. À
   trancher sur le catalogue papier.
3. **Familles de rails non saisies** : fluviaux, décors spécifiques, points de
   rassemblement, volets d'occultation, J10.
4. **Assistant IA du devis — LENT, PAS EN PANNE** (18 sept.). La chaîne de
   repli du 14 sept. est **déployée** (version 7, vérifiée identique au dépôt) :
   l'ancienne mention « à déployer » était périmée. Mesuré le 18 :
   `gemini-3.6-flash` répond **503 « high demand »** en une demi-seconde (sans
   gravité, c'est un incident Google du jour) et `gemini-3.5-flash-lite` prend
   **62 s** sur un devis de vingt lignes — il réfléchit avant d'écrire. La
   fonction rendait donc bien sa réponse ; l'écran ne montrait qu'un rouet.
   Depuis : chrono à l'écran, mot qui rassure passé 15 s, bouton « Arrêter »,
   modèle et durée sous la réponse ; côté fonction, une borne par appel
   (`ATTENTE_MODELE_MS`, 90 s), un budget de chaîne (`BUDGET_MS`, 170 s) et la
   durée de chaque tentative dans les journaux comme dans `essais`.
   **À déployer** : `.\deploy-function.ps1 devis-assistant`.
