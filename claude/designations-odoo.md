# Les désignations Odoo — l'import de `description_variante`

⚠️ **Ce fichier n'est PAS chargé automatiquement.** À ouvrir quand on touche à
l'import des désignations ou à `designationProduit()`.

Reconstitué le 10 septembre 2026 à partir des pièces réelles — les deux
migrations, la fonction Edge **déployée**, et des mesures sur la base — et non
de mémoire. Ce qui est chiffré ici a été compté.

---

## Le problème

`produits.description` porte la désignation du **MODÈLE** : elle vaut « IS A11 »
pour les huit déclinaisons de A11, « IS KC1 » pour les douze de KC1. Elle ne dit
donc jamais **ce qu'on vend**. Odoo, lui, nomme chaque déclinaison :

```
reference                    description   description_variante
A11.1000.C1.BTR.IS.BRUT      IS A11        A11 1000 C1 BTR ST BRUT (MAGELLAN)
A11.500.C2.BTR.IS.BRUT       IS A11        A11 500 C2 BTR BRUT (MAGELLAN)
```

Cette ligne-là n'existait nulle part chez nous. C'est elle qu'on lit pour
choisir un article, et sans elle le sélecteur proposait huit fois « IS A11 ».

**Un seul point de vérité : `designationProduit(p)`** dans `store.ts`. Elle rend
la déclinaison quand elle existe, le modèle sinon, efface les parenthèses vides
qu'Odoo laisse, et rapatrie ce que le modèle annonce après un `+` — sans quoi
« IS KD22A **+ PA** » perdait sa pointe amovible. Ne jamais lire `p.description`
directement pour afficher ou nommer une ligne.

---

## ⚠️ LE CHAMP ODOO EST « Variant Sale Description », PAS `name`

`product.product.name` est la colonne « Nom » de l'écran Odoo, et elle vaut
« IS A11 » — exactement comme chez nous. **La première version de l'import s'y
est trompée et a versé 5 616 fois la désignation du modèle.**

Le piège est qu'un export Odoo intitule parfois la colonne « Variant Sale
Description » alors que le champ technique s'appelle autrement, et que **son nom
technique varie d'une base à l'autre**. On ne peut donc pas l'écrire en dur.

La fonction le retrouve **par son libellé**, via `fields_get` sur
`product.product`, avec trois filets successifs (`trouverChamp`) :
1. libellé exactement égal à « variant sale description » ;
2. nom technique `variant_sale_description` ou `description_sale_variant` ;
3. un champ texte dont le libellé contient à la fois « sale description » et « variant ».

Et si rien ne répond, elle **échoue** au lieu de retomber sur `name` — c'est
précisément la régression qu'on ne veut pas revoir.

**Mode diagnostic** : `{ "jeton": "…", "champs": true }` rend tous les champs
texte de `product.product` avec leur libellé, pour reconnaître le bon à l'œil.
**Contournement** : passer `champ: "<nom technique>"` dans le corps force le
champ sans passer par `fields_get`.

---

## Comment l'import travaille

`supabase/functions/odoo-designations/index.ts` — appelée à la main, par pages.

**Curseur sur la référence, jamais un offset.** Le catalogue compte 22 723
articles et aucune requête ne les tient. Chaque appel rend `dernier`, à repasser
en `depuis` pour la page suivante, et `fini: true` quand il n'y a plus rien.
Un offset déraperait dès qu'une écriture change l'ordre entre deux appels ; la
référence, elle, est unique et ordonnable.

**Paquets de 200 vers Odoo** (`PAQUET_ODOO`). Un `default_code in [...]` avec
1 000 valeurs finit en requête SQL géante et en délai dépassé.

**`active_test: false`** : une déclinaison archivée chez Odoo garde sa
désignation, et nos fiches, elles, restent vendables.

**Le HTML est nettoyé** : certains champs sont de type `html`, les balises et
`&nbsp;` sont retirés avant écriture.

⚠️ **Ne pas appeler `fields_get` à chaque page.** C'est ce qui faisait tomber la
fonction en 500 une page sur sept. D'où le paramètre `champ` dans le corps :
on le résout une fois, puis on le passe.

**Écriture en bloc** — la migration `20260906170000_maj_description_variante.sql`
crée `maj_description_variante(lignes jsonb)` : un PATCH par ligne aurait pris
des heures, on envoie la page entière en un appel et Postgres fait la jointure.
Le `is distinct from` évite de réécrire une ligne déjà juste, pour que le compte
rendu (`ecrits`) dise ce qui a **vraiment** changé.

**Corps attendu :**
```json
{ "jeton": "…", "depuis": "", "limite": 1000, "simulation": false }
```
`simulation: true` lit Odoo sans rien écrire. La réponse porte `champ`, `lus`,
`trouves`, `ecrits`, `dernier`, `fini` et un `echantillon` de six lignes.

---

## Où en est le catalogue (mesuré le 10 septembre 2026)

| Famille | Avec désignation Odoo | Total |
|---|---|---|
| SIGNALISATION POLICE | **13 155** | 13 163 |
| SIGNALISATION TEMPORAIRE | **1 049** | 1 087 |
| PLASTIQUE | 479 | 664 |
| ELEMENTS DE FIXATION | 98 | 678 |
| ISOMARK | 9 | 985 |
| NEGOCE | 2 | 2 172 |
| SEMI-FINIS | 1 | 516 |
| SPEC | 0 | 2 417 |
| **Catalogue entier** | **14 806** | **22 723** |

⚠️ **Les 7 917 vides ne sont PAS un import inachevé.** Le curseur va d'un bout
à l'autre des références : il ne pourrait pas couvrir POLICE à 99,9 % et sauter
SPEC. Ce sont les familles qu'Odoo ne décline pas — négoce, semi-finis,
spécifiques — et où le champ est vide **chez Odoo**. `designationProduit()`
retombe alors sur `description`, ce qui est le comportement voulu.

Douze articles ont `description_variante = description`. C'est normal : leur
modèle n'a qu'une déclinaison.

---

## ⚠️ Le dépôt a divergé de la production (corrigé le 10 septembre 2026)

**Constaté** : le dépôt ne contenait qu'**une seule version** de la fonction
(commit `c39e601`), celle qui lit `name` — la version fautive. La production
tournait en **version 3**, corrigée. Personne n'avait recommité le correctif.

Un `.\deploy-function.ps1 odoo-designations` aurait donc **réécrit les 14 806
désignations avec « IS A11 »**, sans erreur ni avertissement, et la régression
ne se serait vue qu'au sélecteur d'article.

Le fichier du dépôt a été remis à l'identique de la production. Ses commentaires
sont **sans accents**, comme le déployé : le dépôt doit refléter ce qui tourne,
et l'écart d'accents suggère que le déploiement les a mangés une fois déjà.

**La leçon dépasse cette fonction :** une Edge Function corrigée directement en
production est un correctif qui n'existe pas. Vérifier `get_edge_function` contre
le dépôt avant tout redéploiement d'une fonction qu'on n'a pas soi-même poussée.
