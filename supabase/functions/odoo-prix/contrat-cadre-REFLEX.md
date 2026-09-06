# Tarification par contrat-cadre — comment ça marche

Référence de validation : devis Odoo **AF035681** (REFLEX SIGNALISATION),
contrat « CCI10019 TARIF R4 — 35 % REMISE … ISOSIGN 2026 » (id 276).

## Le problème corrigé

Le prix venait de la liste de prix Odoo (`property_product_pricelist`), dont
une règle de catégorie à ~70 % donnait **60,32 €** pour le B14#30km/h.650.C2
au lieu des **46,62 €** réellement facturés. Le vrai tarif vit ailleurs : dans
un objet Studio distinct, le *contrat-cadre*, accroché à la fiche société.

## La grille raisonne par gabarit, pas par référence

    article   A3A.700.C2.BTR.IS.BRUT
    grille    A*  .700.C2        .BRUT   →  36,010 €

Ce que le devis a permis d'établir :

- **L'étoile remplace le suffixe de famille.** Ce n'est pas un joker SQL mais
  un caractère stocké tel quel. `A*` couvre A3A, A14, A2B — tous facturés
  36,010 € au millième ; `B*` couvre B14, B15, B21A2, tous à 46,618 €.
  Le prix dépend du trio (type de panneau, dimension, classe), pas du code
  de famille complet. Cohérent avec le métier : A = triangle, B = rond,
  C = carré, M9Z = panonceau.
- **Les segments techniques BTR/IS sont tantôt omis, tantôt conservés.**
  Les panneaux s'écrivent `A*.700.C2.BRUT` sans eux, mais les mâts et
  supports les gardent : `SG60.3500.IS.BRUT`, `MA.60.3500.PLAST.IS.BRUT`,
  `B30*.500.650.C2.IS.BRUT`. Les deux formes sont donc essayées.
- **Certaines familles ont leur ligne propre**, sans étoile (`AB6.500.C2`,
  `B214RAILS.650.C1`, `SG60.3500`). Les gabarits sont donc essayés du plus
  spécifique au plus général : une ligne dédiée l'emporte sur le générique.
- **`x_studio_prix_unit` est le prix NET**, remise déduite (`x_studio_remise_1`
  vaut 0). Rien à recalculer.
- Arrondi au **millième** : la grille cote 36,5105 et Odoo affiche 36,511.

## Deux pièges rencontrés

1. `res.partner` porte **deux** champs vers `x_contrat_cadre` — `x_lien_cc` et
   `x_studio_many2many_field_G7Vp4`. N'en lire qu'un (le premier par ordre
   alphabétique) donnait un champ vide et faisait conclure « pas de contrat ».
   Les deux sont désormais lus et réunis.
2. Le contrat dépasse 5 000 lignes : tout rapatrier est impraticable. On
   envoie les gabarits en OR et on laisse Odoo filtrer.

## Résultat mesuré (traces du 19/08, 14:53)

| Référence | Gabarit retenu | Calculé | Devis |
|---|---|---|---|
| SG60.3500.IS.BRUT | `SG60.3500.IS.BRUT` | 30,740 | 30,740 |
| SG60.4000.IS.BRUT | `SG60.4000.IS.BRUT` | 34,760 | 34,760 |
| B14#30km/h.650.C2 | `B*.650.C2.BRUT` | 46,618 | 46,618 |
| B15.650.C2 | `B*.650.C2.BRUT` | 46,618 | 46,618 |
| B21A2.650.C2 | `B*.650.C2.BRUT` | 46,618 | 46,618 |
| C18.500.C2 | `C*.500.C2.BRUT` | 36,511 | 36,511 |
| C27.500.C2 | `C*.500.C2.BRUT` | 36,511 | 36,511 |
| A3A.700.C2 | `A*.700.C2.BRUT` | 36,010 | 36,010 |
| A14.700.C2 | `A*.700.C2.BRUT` | 36,010 | 36,010 |
| A2B.700.C2 | `A*.700.C2.BRUT` | 36,010 | 36,010 |

**10 / 10 exactes.** Non rejouées faute d'avoir été recherchées :
M9Z1LM#RAPPEL.700.200 (26,644), M9Z2L.700.350 (37,811),
DR50.1300.400 (116,920).

## Articles sans gabarit — comportement normal

Les variantes non prévues au contrat (`B15.650.C2.12V.NEG`,
`C18.500.C2.12V.NEG`, `PM60.4000.BRUT`, `SA603500CUS`) ne reçoivent aucun
prix inventé : la fonction retombe sur la liste de prix, et affiche
« hors barème » si celle-ci ne les couvre pas non plus. Une trace bornée
(2 articles, 1 requête, 40 lignes) montre alors ce que la grille contient
autour d'eux, pour distinguer « hors contrat » de « convention d'écriture
non prévue ».
