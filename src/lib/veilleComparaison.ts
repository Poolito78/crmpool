import { formatMontant, type Produit } from '@/lib/store';

/**
 * Comparaison d'un relevé de veille à notre propre article.
 *
 * Le piège de cette comparaison est l'unité. Les concurrents annoncent la
 * peinture routière et l'enduit à froid au kilo — Morphée à 2,75 €, Colorado à
 * 5,40 € — alors que notre catalogue porte un prix au conditionnement : un
 * seau, un pot, un sac. Rapprocher 2,75 € d'un seau à 63,60 € ne veut rien
 * dire ; il faut d'abord ramener les deux au même dénominateur.
 *
 * On sait le faire quand l'article porte son poids (€/kg) ou son poids et sa
 * consommation (€/m²). Quand on ne sait pas, on le dit plutôt que d'afficher
 * un écart inventé : un mauvais chiffre de comparaison est plus nuisible que
 * pas de chiffre du tout, parce qu'on s'en sert pour décider d'un prix.
 */

export interface Comparaison {
  /** Notre prix, ramené à l'unité du concurrent quand c'est possible. */
  notreTexte: string;
  leurTexte: string;
  /** Écart en %, positif si nous sommes plus chers. `null` = incomparable. */
  ecartPct: number | null;
  /** Unité sur laquelle la comparaison a été faite, pour l'afficher. */
  unite?: string;
  /** Pourquoi l'écart n'a pas été calculé — à montrer tel quel. */
  obstacle?: string;
  /** D'où vient notre prix : « ISOMARK », « ISOFLOOR » ou « catalogue ». */
  notreSource: string;
}

/** Normalise « €/KG », « kg », « € / kg » → « kg ». */
function uniteDe(brut?: string): string {
  return (brut || '')
    .toLowerCase()
    .replace(/€/g, '')
    .replace(/[\s/]/g, '')
    .trim();
}

export function comparerAuConcurrent(
  notre: Produit,
  leurPrix: number,
  leurUnite?: string,
): Comparaison {
  const u = uniteDe(leurUnite);
  const leurTexte = `${formatMontant(leurPrix)}${u ? ` /${u}` : ''}`;

  /* On se compare au tarif métier quand il existe (ISOMARK, ISOFLOOR), pas au
     tarif public. C'est le prix auquel on se bat réellement : sur ARAVIS, le
     public affiche 90,86 € quand l'applicateur paie 63,60 €. Comparer le
     public au prix d'un concurrent gonfle l'écart d'un tiers et donne à croire
     qu'on est hors marché quand on ne l'est pas. */
  const prixUnitaire = notre.prixTarif ?? notre.prixHT ?? 0;
  const notreSource = notre.prixTarif != null
    ? (notre.sourceTarif || 'tarif métier')
    : 'catalogue';
  const poids = notre.poids ?? 0;
  const conso = notre.consommation ?? 0;

  /* Unité absente : on ne devine pas. Sur les relevés existants, les prix vont
     de 2,84 € à 779,93 € sans unité renseignée — le premier est un prix au
     kilo, le second un rouleau de bande. Supposer l'un ou l'autre produirait
     un écart faux, et un écart faux sert à fixer un prix. */
  if (!u) {
    return {
      notreTexte: prixUnitaire > 0 ? `${formatMontant(prixUnitaire)} /u` : '—',
      leurTexte,
      ecartPct: null,
      obstacle: 'unité de leur prix non renseignée',
      notreSource,
    };
  }

  let notrePrix: number | null = null;
  let unite: string | undefined;

  if (u === 'u' || u === 'unite' || u === 'unité') {
    // Prix à l'unité des deux côtés : rien à convertir.
    notrePrix = prixUnitaire;
    unite = 'u';
  } else if ((u === 'kg' || u === 'l') && poids > 0) {
    // Le litre est assimilé au kilo : pour ces produits la densité est proche
    // de 1, et les tarifs des deux camps mélangent déjà les deux.
    notrePrix = prixUnitaire / poids;
    unite = u;
  } else if ((u === 'm2' || u === 'm²') && poids > 0 && conso > 0) {
    notrePrix = (prixUnitaire / poids) * conso;
    unite = 'm²';
  }

  if (notrePrix == null || !Number.isFinite(notrePrix) || notrePrix <= 0) {
    return {
      notreTexte: prixUnitaire > 0 ? `${formatMontant(prixUnitaire)} /u` : '—',
      leurTexte,
      ecartPct: null,
      obstacle: (u === 'kg' || u === 'l') && poids <= 0
        ? 'poids absent de la fiche article'
        : (u === 'm2' || u === 'm²')
          ? 'poids ou consommation absents de la fiche article'
          : `unité « ${u} » non convertible`,
      notreSource,
    };
  }

  return {
    notreTexte: `${formatMontant(notrePrix)} /${unite}`,
    leurTexte,
    ecartPct: ((notrePrix - leurPrix) / leurPrix) * 100,
    unite,
    notreSource,
  };
}
