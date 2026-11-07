import type { ComposantProduit } from './store';

/**
 * UN KIT SUR UN DEVIS FOURNISSEUR : une ligne chiffrée, ses composants dessous.
 *
 * Le devis TTS 74164 (22/10/2026) porte :
 *
 *   0046062 ! OPTIQUE 130/30 KIT TRIFLASH SOLAIRE   3,000  1435,00  861,00  2 583,00
 *   0055887   Optique noire 130-30 Slim             9,000
 *   0029815   Option 3 pinces de fixation           3,000
 *   …
 *             Pinces livrées non montées
 *
 * On achète TROIS kits à 861 € pièce. Pas neuf optiques à 861 €, ni un article
 * à 2 583 €. Deux pièges s'y cachent :
 *
 *  - les quantités des composants sont les TOTAUX de la ligne : 9 optiques pour
 *    3 kits, soit 3 par kit. L'article composé veut la quantité POUR UN kit ;
 *  - le code de tête 0046062 est GÉNÉRIQUE (« ! OPTIQUE ») : les deux kits de ce
 *    devis le portent. Il ne désigne donc pas un article à lui seul, contrairement
 *    au code d'une ligne ordinaire — c'est le code ET l'intitulé.
 *
 * Le fournisseur ne chiffre pas les composants : leur prix n'est pas inventé.
 * Le coût du kit est porté par `prixAchatManuel` (« coût saisi à la main » de la
 * fiche article, le mécanisme prévu pour un coût qui ne se déduit pas) sur la
 * 1re ligne, 0 sur les autres. Sans cela, la fiche recalculerait le prix d'achat
 * d'après des composants à 0 €.
 */

export interface ComposantLu {
  reference?: string;
  description: string;
  /** Quantité POUR UN kit (9 optiques ÷ 3 kits = 3). Corrigeable à l'écran. */
  quantite: number;
  /** Quantité écrite sur le document, pour le total de la ligne. */
  quantiteDocument: number;
  /** La division ne tombe pas juste, ou la quantité n'est pas écrite : à relire. */
  aVerifier?: boolean;
}

/** Ce qu'il faut d'une ligne lue pour reconnaître un kit (`LigneAnalysee`). */
export interface LigneAKit {
  reference?: string | null;
  description?: string | null;
  quantite?: number | string | null;
  prixUnitaireHT?: number | null;
  composants?: ComposantLu[];
  notesKit?: string[];
}

const nombre = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = parseFloat(v.replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** « ! OPTIQUE… » : le point d'exclamation de tête est une marque de TTS, pas un intitulé. */
export const intituleKit = (s: string): string => s.replace(/^[\s!]+/, '').trim();

const arrondi = (n: number) => Math.round(n * 10000) / 10000;

/** Le composant d'un kit de `kits` pièces, à partir de la quantité écrite sur le document. */
export function composantLu(
  l: { reference?: string | null; description?: string | null; quantite?: number | string | null },
  kits: number,
): ComposantLu {
  const ecrite = nombre(l.quantite);
  const reference = (l.reference || '').trim() || undefined;
  const description = (l.description || '').trim();
  if (ecrite == null || !(ecrite > 0)) {
    return { reference, description, quantite: 1, quantiteDocument: 0, aVerifier: true };
  }
  const parKit = arrondi(ecrite / (kits > 0 ? kits : 1));
  return {
    reference, description, quantite: parKit, quantiteDocument: ecrite,
    ...(Number.isInteger(parKit) ? {} : { aVerifier: true }),
  };
}

/**
 * Range sous chaque ligne chiffrée les lignes SANS PRIX qui la suivent.
 *
 * Fonction PURE, sans IA : le modèle n'a qu'à recopier les lignes dans l'ordre.
 * Une ligne à 0 € (« Maquette OFFERTE ») est chiffrée : elle n'est pas un
 * composant. Une mention sans code ni quantité (« Pinces livrées non montées »)
 * devient une note du kit. Une ligne chiffrée sans aucun composant reste une
 * ligne ordinaire, et ses mentions redeviennent des lignes : on ne fabrique pas
 * de kit avec une simple remarque.
 */
export function regrouperKits<L extends LigneAKit>(lignes: L[]): L[] {
  const sortie: L[] = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    i++;
    if (l.prixUnitaireHT == null) { sortie.push(l); continue; }

    const suite: L[] = [];
    while (i < lignes.length && lignes[i].prixUnitaireHT == null) { suite.push(lignes[i]); i++; }

    const estMention = (x: L) => !(x.reference || '').trim() && !((nombre(x.quantite) ?? 0) > 0);
    if (!suite.some(x => !estMention(x))) {
      sortie.push(l, ...suite);
      continue;
    }
    const kits = nombre(l.quantite) ?? 1;
    sortie.push({
      ...l,
      description: intituleKit(l.description || ''),
      composants: suite.filter(x => !estMention(x)).map(x => composantLu(x, kits)),
      /* « !!!!! », « _____ » : de la mise en page, pas une mention. */
      notesKit: suite.filter(estMention).map(x => (x.description || '').trim()).filter(t => /\p{L}/u.test(t)),
    });
  }
  return sortie;
}

/**
 * « Ce n'est pas un kit » : la ligne redevient ordinaire et ses composants des
 * lignes, à la quantité écrite. Rendues À PART : l'écran les ajoute en FIN de
 * liste, ses choix étant rangés par indice de ligne.
 */
export function separerKit<L extends LigneAKit>(l: L): { ligne: L; lignes: { reference: string; description: string; quantite: number }[] } {
  const { composants, notesKit: _notes, ...reste } = l;
  return {
    ligne: reste as L,
    lignes: (composants ?? []).map(c => ({
      reference: c.reference ?? '',
      description: c.description,
      quantite: c.quantiteDocument || c.quantite,
    })),
  };
}

const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Même intitulé, à la casse, aux accents et à la ponctuation près. */
export const memeIntitule = (a?: string | null, b?: string | null): boolean => {
  const x = sansAccent(a || '');
  return !!x && x === sansAccent(b || '');
};

/**
 * Ce qui désigne l'article d'une ligne de devis fournisseur : son code — et,
 * pour un kit, aussi son intitulé, le code de tête étant générique.
 */
export function cleLigneAchat(l: { reference?: string | null; description?: string | null; composants?: unknown[] }): string {
  const code = (l.reference || '').trim().toUpperCase();
  return code && l.composants?.length ? `${code}|${sansAccent(l.description || '')}` : code;
}

/**
 * Les composants de l'article à créer : le coût du kit sur la 1re ligne, 0 sur
 * les autres. Le total fait le prix d'achat du kit, sans prêter de prix à un
 * composant que le fournisseur ne chiffre pas.
 */
export function composantsDuKit(
  composants: { produitId: string; quantite: number }[],
  prixKit: number,
): ComposantProduit[] {
  return composants.map((c, i) => ({
    produitId: c.produitId,
    quantite: c.quantite,
    prixAchatManuel: i === 0 ? prixKit : 0,
  }));
}

/**
 * Un nouveau prix de kit, reporté sur ses composants.
 *
 * La fiche recalcule le prix d'achat d'un composé depuis ses composants : écrire
 * le seul `prixAchat` ne tiendrait pas au prochain enregistrement. On ne touche
 * qu'aux composés dont TOUS les coûts sont saisis à la main (les autres se
 * calculent vraiment) ; une répartition faite à la main garde ses proportions.
 */
export function reporterPrixKit(composants: ComposantProduit[] | undefined, prix: number): ComposantProduit[] | undefined {
  if (!composants?.length) return undefined;
  const comptes = composants.filter(c => !c.forfaitCommande);
  if (!comptes.length || comptes.some(c => c.prixAchatManuel == null)) return undefined;
  const somme = comptes.reduce((s, c) => s + (c.prixAchatManuel ?? 0), 0);
  let reste = prix;
  let premier = true;
  const sortie = composants.map(c => {
    if (c.forfaitCommande) return c;
    const part = somme > 0 ? Math.round((c.prixAchatManuel ?? 0) / somme * prix * 100) / 100 : (premier ? prix : 0);
    premier = false;
    reste = Math.round((reste - part) * 100) / 100;
    return { ...c, prixAchatManuel: part };
  });
  /* L'arrondi retombe sur la 1re ligne comptée : le total reste le prix du kit. */
  if (reste !== 0) {
    const k = sortie.findIndex(c => !c.forfaitCommande);
    sortie[k] = { ...sortie[k], prixAchatManuel: Math.round(((sortie[k].prixAchatManuel ?? 0) + reste) * 100) / 100 };
  }
  return sortie;
}

/** La composition écrite dans les notes de l'article créé, mentions du fournisseur comprises. */
export function noteKit(l: { composants?: ComposantLu[]; notesKit?: string[] }): string {
  if (!l.composants?.length) return '';
  const lignes = ['Composition pour un kit (devis fournisseur) :'];
  for (const c of l.composants) {
    lignes.push(`- ${String(c.quantite).replace('.', ',')} × ${c.reference ? `${c.reference} ` : ''}${c.description}`);
  }
  for (const n of l.notesKit ?? []) lignes.push(`Mention : ${n}`);
  lignes.push('Prix des composants non détaillé par le fournisseur : le coût du kit est porté par la 1re ligne.');
  return lignes.join('\n');
}
