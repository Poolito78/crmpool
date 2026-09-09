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
- Le sélecteur reçoit le catalogue **entier** par `produits` et la
  pré-sélection par `suggestions`. Ne jamais borner `produits` aux candidats
  d'un rapprochement : la recherche manuelle devient aveugle.

## Les brides

**Une bride par rail.** Le nombre de rails se lit dans
`railsPanneaux.donnees.ts` — table du catalogue, famille par famille et taille
par taille. `compterBrides` (`bridesDevis.ts`) l'applique aux lignes du devis ;
un encart sous les lignes donne le total.

**On n'invente jamais un nombre de rails** : famille ou cote absente de la
table → « à vérifier », hors du total. Un rail en trop se facture au client, un
rail en moins manque sur le chantier. Voir `claude/brides-et-rails.md`.

## Pièges d'implémentation rencontrés

- **Pas de `<select>` natif dans un dialogue Radix** : sa liste s'ouvre hors du
  DOM, le dialogue la prend pour un clic « en dehors », reprend le focus et
  annule le choix. Utiliser le composant `Select` du projet. (C'est ce qui
  bloquait le niveau de remise sur R4.)
- **Fonction Edge** : ne pas appeler `fields_get` à chaque page d'un traitement
  par lots — c'est ce qui faisait tomber `odoo-designations` en 500 une page
  sur sept. Passer le nom du champ dans le corps.
- **Traitement long** : curseur sur une colonne unique et ordonnable (la
  référence), jamais un offset, et un fichier d'état pour reprendre.

## Ce qui reste ouvert

1. **Poser les lignes de brides au devis** : il manque la règle de choix de la
   référence. Le profil du panneau en désigne la moitié (BP → P25, BTR → P50) ;
   reste la section du mât — du mât présent au devis, ou demandée à l'écran ?
2. **Panonceau 350×350** : 1 rail page AB, 2 rails page B. On retient 2. À
   trancher sur le catalogue papier.
3. **Familles de rails non saisies** : fluviaux, décors spécifiques, points de
   rassemblement, volets d'occultation, J10.
4. **Assistant IA du devis** : la requête n'atteint pas la fonction — aucun
   journal Supabase, pas même en préflight. Le message d'erreur affiche
   désormais le détail ; le lire avant de chercher côté serveur.
