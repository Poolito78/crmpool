/**
 * Lecture d'un carnet de plans de signalisation DIRECTIONNELLE exporté du
 * logiciel Kadri (« Signal 'Projet et Patrimoine' »), et sa mise en lignes de
 * devis.
 *
 * Un bureau d'études livre un PDF d'une page par ENSEMBLE — un mât et les
 * panneaux qu'il porte. Chaque page dit tout ce qu'il faut pour chiffrer, en
 * texte et non en image : la gamme du fabricant (« CAISSON CL1 »), puis pour
 * chaque panneau son code IISR, ses cotes et son sort (« D21 1900x250 »,
 * « Existant  Pose Depose »). La lecture est donc DÉTERMINISTE : aucune IA,
 * qui résumerait cent pages en inventant des quantités.
 *
 * LE SORT D'UN PANNEAU, tel que Kadri l'écrit au-dessus de ses cotes :
 *   « Pose »                    panneau neuf                    → à fabriquer
 *   « Existant  Pose Depose »   l'existant est remplacé         → à fabriquer
 *   « Existant  Depose »        l'existant est retiré, sans remplaçant
 *   « Existant »                l'existant reste en place
 *   « A Supprimer »             panneau à retirer
 * Seuls les deux premiers se fabriquent. Les autres ne sont pas chiffrés mais
 * restent comptés au bilan, à la vue du chargé d'affaires.
 *
 * LA RÉFÉRENCE se déduit de la forme, de la gamme et de la classe, dans
 * l'écriture de la grille contractuelle Odoo (`grille_contrat`) :
 *   D21 (flèche)                     → DF50.1900.250.C1.50.IS.BRUT
 *   D42, D43, E43… (rectangles)      → DR50.2500.400.C1.50.IS.BRUT
 * La GAMME est Lapérouse P50 (dos ouvert) par défaut ; Vasco de Gama (dos
 * fermé, option F) et Urville (caisson traversant) seulement si c'est dit
 * ou choisi à l'écran — voir `GammeDirectionnelle`. Une cote absente de la
 * grille reste « à vérifier » : une référence fabriquée serait rapprochée
 * d'une voisine chez Odoo.
 *
 * On ne chiffre QUE la fabrication : ni pose, ni dépose.
 *
 * Les SUPPORTS neufs sont relevés tels que Kadri les nomme (« MAT TRAV MC,
 * Lg 2,42 m (2,77) ») : le passage à une référence de mât n'est pas établi,
 * ils partent en lignes à vérifier, jamais au prix d'une longueur devinée.
 */

export type SortPanneau = 'neuf' | 'remplace' | 'depose' | 'existant' | 'supprime';

export interface PanneauPlan {
  /** Code IISR tel que Kadri l'écrit : « D21 », « D42b1 », « E43 ». */
  code: string;
  largeur: number;
  hauteur: number;
  /** Surface en m², lue et non recalculée. */
  surface: number;
  sort: SortPanneau;
  /** Film de fond : « Blanc 3290 », « Vert 3277 »… */
  fond?: string;
}

export interface SupportPlan {
  /** Désignation Kadri : « MAT TRAV MC », « Coulisseau MB », « TUBE GALV MC 80 ». */
  designation: string;
  /** Longueur calculée, en mètres. */
  longueur?: number;
  /** Longueur hors tout, entre parenthèses chez Kadri. */
  longueurTotale?: number;
  existant: boolean;
}

export interface EnsemblePlan {
  /** Rang de la page dans le PDF, à partir de 1. */
  page: number;
  dossier: string;
  section: string;
  /** Nom de l'ensemble : « DEM1-47 », « HARF-06 ». */
  ensemble: string;
  /** Gamme Kadri, classe comprise : « CAISSON CL1 », « ALU BT/M (NC) CL1 ». */
  produit: string;
  /** Classe de rétroréflexion lue dans la gamme, `null` si absente. */
  classe: number | null;
  /** Type de support de l'ensemble : « MAT TRAV REHAUSSE », « MAT ANCRE ». */
  support: string;
  panneaux: PanneauPlan[];
  supports: SupportPlan[];
}

/** Un panneau que le chantier demande de fabriquer. */
export function aFabriquer(p: PanneauPlan): boolean {
  return p.sort === 'neuf' || p.sort === 'remplace';
}

/** La page est-elle un « Plan avec détails » de Kadri ? */
export function estPageKadri(texte: string): boolean {
  return /Plan avec d[ée]tails/i.test(texte)
    && /Projet et Patrimoine|Kadri/i.test(texte);
}

/** Le document est-il un carnet de plans Kadri ? Une page suffit. */
export function estPlanKadri(pages: string[]): boolean {
  return pages.some(estPageKadri);
}

const nombre = (s: string | undefined) => {
  if (!s) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Le sort, lu sans espaces : « ExistantPoseDepose », « Pose », « ASupprimer ». */
function sortDe(mots: string): SortPanneau {
  const m = sansEspaces(mots).toLowerCase().replace(/é/g, 'e');
  if (/supprimer/.test(m)) return 'supprime';
  const depose = /depose/.test(m);
  /* « Pose » seul, pas celui qu'on lit dans « Depose ». */
  const pose = /(^|[^e])pose/.test(m.replace(/depose/g, '|'));
  if (pose) return /existant/.test(m) || depose ? 'remplace' : 'neuf';
  if (depose) return 'depose';
  return 'existant';
}

/**
 * Les six lignes du cartouche, dans l'ordre où Kadri les écrit juste après
 * « Hauteur de base » : dossier, sous-dossier, section, ensemble, gamme,
 * support. L'ordre des blocs AVANT varie (« Sol Correct » s'intercale ou
 * non) ; celui-ci ne varie pas.
 */
function cartouche(lignes: string[]) {
  const i = lignes.findIndex(l => /^Hauteur de base/i.test(l));
  const suite = i >= 0 ? lignes.slice(i + 1, i + 7) : [];
  /* La ligne du support porte parfois, collée, l'adresse du concepteur :
     « MAT TRAV REHAUSSE  47 av. de LUGO… ». */
  const support = (suite[5] || '').split(/\s{2,}|\s+\d+\s+av\.?\s/i)[0].trim();
  return {
    dossier: [suite[0], suite[1]].filter(Boolean).join(' / '),
    section: suite[2] || '',
    ensemble: suite[3] || '',
    produit: suite[4] || '',
    support,
  };
}

/**
 * ⚠️ **LES ESPACES DU PDF NE SONT PAS FIABLES.** Kadri compose en police
 * étroite, et pdf.js restitue « D21 2200x400 » en « D 212200x400 »,
 * « Depose » en « D epose », « Existant » en « Ex istant ». On lit donc
 * chaque ligne SANS SES ESPACES, et on sépare le code de la largeur par la
 * surface que Kadri imprime à côté : « D212200x400=0.880 » ne se coupe
 * qu'en D21 + 2200, seule découpe dont 2200 × 400 donne 0,880 m².
 */
const sansEspaces = (s: string) => s.replace(/\s+/g, '');

/* « D21 », « D42b1 », mais aussi « Dc43 » (cartouche touristique),
   « EB_20 » (agglomération) et « plaque » (sans code), tels que Kadri les
   écrit. */
const MOTIF_CODE_IISR = /^(?:[A-Z][A-Za-z]{0,2}_?\d{1,3}[a-z]{0,2}\d?[a-z]?|[A-Za-z]{3,12})$/;

/**
 * Lit « D212200x400=0.880m² » (espaces retirés) : code, largeur, hauteur,
 * surface. `null` si la ligne n'est pas une cote de panneau, ou si aucune
 * découpe du code ne s'accorde avec la surface imprimée.
 */
export function lireCotePanneau(ligne: string): Omit<PanneauPlan, 'sort' | 'fond'> | null {
  const m = sansEspaces(ligne).match(/^([A-Za-z][0-9A-Za-z_]*?\d)x(\d{2,5})=([\d.,]+)m²?$/);
  if (!m) return null;
  const tete = m[1];
  const hauteur = Number(m[2]);
  const surface = nombre(m[3]);
  if (!hauteur || surface === undefined) return null;
  /* Toutes les découpes « code + largeur » possibles ; la surface tranche.
     Kadri l'arrondit au millième : on tolère le demi-millième. */
  for (let n = 5; n >= 2; n--) {
    const largeurTxt = tete.slice(-n);
    const code = tete.slice(0, -n);
    if (!/^\d+$/.test(largeurTxt) || largeurTxt.startsWith('0')) continue;
    if (!MOTIF_CODE_IISR.test(code)) continue;
    const largeur = Number(largeurTxt);
    if (Math.abs((largeur * hauteur) / 1e6 - surface) <= 0.0006) {
      return { code, largeur, hauteur, surface };
    }
  }
  return null;
}

const MOTIF_SORT = /^(?:Existant|Pose|D[ée]pose|ASupprimer)+$/i;
const MOTIF_FOND = /^(Blanc|Vert|Bleu|Jaune|Noir|Rouge|Marron|Orange|Gris|Brun|Violet)/i;
const MOTIF_SUPPORT =
  /^(MAT(TRAV|ANCRE)|TUBE|Coulisseau|CANDELABRE|IPN|HEA|PORTIQUE|POTENCE|POTELET)/i;

/**
 * Lit une page de plan, un élément de texte par ligne (voir
 * `extrairePagesPDF`) ; `null` si la page n'est pas un plan Kadri.
 */
export function lireEnsemble(texte: string, page: number): EnsemblePlan | null {
  if (!estPageKadri(texte)) return null;
  const lignes = texte.split('\n').map(l => l.trim()).filter(Boolean);
  const plates = lignes.map(sansEspaces);
  const c = cartouche(lignes);

  const panneaux: PanneauPlan[] = [];
  lignes.forEach((l, j) => {
    const cote = lireCotePanneau(l);
    if (!cote) return;
    /* Le sort est écrit sur la ligne du dessus. Sans mention, on ne le
       tient pas pour une commande : il reste « existant », donc non chiffré. */
    const dessus = plates[j - 1] || '';
    const fond = (plates[j + 1] || '').match(MOTIF_FOND)?.[1];
    panneaux.push({
      ...cote,
      sort: MOTIF_SORT.test(dessus) ? sortDe(dessus) : 'existant',
      fond: fond ? fond[0].toUpperCase() + fond.slice(1).toLowerCase() : undefined,
    });
  });

  const supports: SupportPlan[] = [];
  plates.forEach((p, j) => {
    if (!MOTIF_SUPPORT.test(p)) return;
    /* Un support est suivi de son moment : c'est ce qui le distingue de la
       ligne « Produit » du cartouche, qui porte la même désignation. */
    if (!/^Mt:/i.test(plates[j + 1] || '')) return;
    const lg = plates.slice(j + 1, j + 4).join(' ')
      .match(/Lg:([\d.,]+)m(?:\(([\d.,]+)\))?/i);
    supports.push({
      designation: lignes[j].replace(/\s+/g, ' '),
      longueur: nombre(lg?.[1]),
      longueurTotale: nombre(lg?.[2]),
      existant: /^Existant$/i.test(plates[j - 1] || ''),
    });
  });

  const cl = c.produit.match(/\bCL\s*([123])\b/i);
  return {
    page,
    dossier: c.dossier,
    section: c.section,
    ensemble: c.ensemble || `page ${page}`,
    produit: c.produit,
    classe: cl ? Number(cl[1]) : null,
    support: c.support,
    panneaux,
    supports,
  };
}

/** Lit tout le carnet ; les pages qui ne sont pas des plans (garde) sont sautées. */
export function lirePlanDirectionnel(pages: string[]): EnsemblePlan[] {
  const out: EnsemblePlan[] = [];
  pages.forEach((t, i) => {
    const e = lireEnsemble(t, i + 1);
    if (e) out.push(e);
  });
  return out;
}

/* ── Références ─────────────────────────────────────────────────────────── */

/**
 * Gamme de fabrication ISOSIGN retenue pour une gamme Kadri.
 *
 *   'laperouse'  LAPÉROUSE P50, dos ouvert — LA GAMME PAR DÉFAUT     DF50 / DR50
 *   'vasco'      VASCO DE GAMA : la même en dos FERMÉ (même
 *                certificat CE « Lapérouse dos ouvert et Vasco de
 *                Gama dos fermé »), option F de la grille          DF50…F / DR50…F
 *   'urville'    URVILLE : caisson TRAVERSANT, plus épais, traversé
 *                par le support — il n'a pas de fixation. Absent de
 *                la grille contractuelle : cherché chez Odoo et
 *                proposé, jamais retenu d'office.
 *   'tasman'     TASMAN : panneau à lames emboîtées (PAL), modèle Odoo
 *                « IS D3 », sans limite de dimensions — hauteur en
 *                lames de 150 mm, longueur libre. C'est la gamme des
 *                GRANDS FORMATS, que Lapérouse ne fabrique pas
 *                (`estGrandFormat`). Une variante Odoo par format :
 *                D3.1900.1500.C1.ST.IS.BRUT — ST = face STANDARD, la
 *                face par défaut (l'autre est occultable). Absent de la
 *                grille : c'est Odoo qui la tarife, par sa référence
 *                exacte.
 */
export type GammeDirectionnelle = 'laperouse' | 'vasco' | 'urville' | 'tasman';

export const LIBELLE_GAMME: Record<GammeDirectionnelle, string> = {
  laperouse: 'Lapérouse P50 (dos ouvert)',
  vasco: 'Vasco de Gama (dos fermé)',
  urville: 'Urville (caisson traversant)',
  tasman: 'Tasman PAL — IS D3 (grand format)',
};

/**
 * Lapérouse P50 par défaut, quoi que Kadri écrive (« CAISSON », « ALU BT/M »…) :
 * c'est la gamme courante d'ISOSIGN. Les deux autres ne se prennent que si
 * elles sont DITES — le nom de la gamme, « dos fermé », « traversant ». Un
 * simple « CAISSON » ne dit pas « traversant ».
 */
export function gammeParDefaut(produitKadri: string): GammeDirectionnelle {
  const t = produitKadri.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  if (/TASMAN|\bPAL\b/.test(t)) return 'tasman';
  if (/URVILLE|TRAVERSANT/.test(t)) return 'urville';
  if (/VASCO|DOS\s*FERME/.test(t)) return 'vasco';
  return 'laperouse';
}

/**
 * Trop grand pour Lapérouse P50 : la grille s'arrête à 2500 de large et
 * 1200 de haut. Au-delà, c'est un panneau à lames — Tasman —, quelle que
 * soit la gamme Kadri : aucune autre gamme ne le fabrique.
 */
export function estGrandFormat(p: Pick<PanneauPlan, 'largeur' | 'hauteur'>): boolean {
  return p.largeur > 2500 || p.hauteur > 1200;
}

/** Hauteur d'une lame Tasman, en mm : la hauteur fabriquée en est un multiple. */
export const LAME_TASMAN = 150;

/**
 * Le panneau Tasman FABRIQUÉ : la hauteur monte au multiple de 150
 * supérieur (2474 → 2550), la longueur est libre. Les lattes sont d'abord
 * des planches de 300 — le plus possible —, complétées d'une de 150 si la
 * hauteur l'exige : 2100 = 7 × 300 ; 2550 = 8 × 300 + 1 × 150.
 */
export function surfaceTasman(p: Pick<PanneauPlan, 'largeur' | 'hauteur'>): {
  lames: number; lames300: number; lames150: number; hauteur: number; surface: number;
} {
  const hauteur = Math.ceil(p.hauteur / LAME_TASMAN) * LAME_TASMAN;
  const lames300 = Math.floor(hauteur / 300);
  const lames150 = (hauteur - lames300 * 300) / LAME_TASMAN;
  return {
    lames: lames300 + lames150, lames300, lames150, hauteur,
    surface: Math.round((p.largeur * hauteur) / 1000) / 1000,
  };
}

/** « 8 lattes de 300 + 1 de 150 », « 7 lattes de 300 ». */
export function composition(t: { lames300: number; lames150: number }): string {
  const parts = [];
  if (t.lames300) parts.push(`${t.lames300} latte(s) de 300`);
  if (t.lames150) parts.push(`${t.lames150} de 150`);
  return parts.join(' + ');
}

/** Le panneau a-t-il une pointe ? D21 (et ses variantes) seulement. */
export function estFleche(code: string): boolean {
  return /^D21/i.test(code);
}

/** Pourquoi une ligne n'a pas de référence, quand c'est le cas. */
export type RaisonSansReference = 'classe' | 'urville' | 'hors-grille';

/**
 * Référence de grille d'un panneau, ou la raison de son absence.
 *
 * `existe` dit si la codification figure à la grille ; sans elle (grille pas
 * encore chargée) la référence est rendue telle quelle.
 */
export function referencePanneau(
  p: Pick<PanneauPlan, 'code' | 'largeur' | 'hauteur'>,
  gamme: GammeDirectionnelle,
  classe: number | null,
  existe?: (codification: string) => boolean,
): { reference: string } | { raison: RaisonSansReference } {
  if (gamme === 'urville') return { raison: 'urville' };
  if (!classe) return { raison: 'classe' };
  /* Tasman : la variante Odoo du format FABRIQUÉ, hauteur en lames
     entières. Pas à la grille — `existe` ne la juge donc pas : Odoo dira
     s'il la connaît. */
  if (gamme === 'tasman') {
    return { reference: `D3.${p.largeur}.${surfaceTasman(p).hauteur}.C${classe}.ST.IS.BRUT` };
  }
  const famille = estFleche(p.code) ? 'DF50' : 'DR50';
  const dos = gamme === 'vasco' ? '.F' : '';
  const reference = `${famille}.${p.largeur}.${p.hauteur}.C${classe}${dos}.50.IS.BRUT`;
  if (existe && !existe(reference)) return { raison: 'hors-grille' };
  return { reference };
}

export const LIBELLE_RAISON: Record<RaisonSansReference, string> = {
  classe: 'classe de rétroréflexion absente du plan',
  urville: 'Urville absent de la grille — article Odoo à choisir',
  'hors-grille': 'format absent de la grille',
};

/** Nom court de la gamme, tel qu'il part dans la désignation. */
const NOM_GAMME: Record<GammeDirectionnelle, string> = {
  laperouse: 'Lapérouse P50',
  vasco: 'Vasco de Gama dos fermé',
  urville: 'Urville caisson traversant',
  tasman: 'Tasman PAL',
};

/* ── Regroupement en lignes de devis ────────────────────────────────────── */

export interface LignePanneauPlan {
  code: string;
  largeur: number;
  hauteur: number;
  /** Gammes Kadri regroupées sur la ligne. */
  produits: string[];
  /** Gamme de fabrication retenue. */
  gamme: GammeDirectionnelle;
  classe: number | null;
  quantite: number;
  /** Ensembles où il figure, dans l'ordre du carnet. */
  ensembles: string[];
  fonds: string[];
  reference: string | null;
  raison: RaisonSansReference | null;
}

/**
 * Les panneaux À FABRIQUER, regroupés en lignes de devis.
 *
 * Deux panneaux vont sur la même ligne quand ils ont la même RÉFÉRENCE :
 * « CAISSON CL1 » et « CAISSON (NC) CL1 » donnent le même DF50, et le devis
 * n'a pas à les séparer. Sans référence, on ne regroupe que ce que Kadri
 * décrit à l'identique — code, cotes et gamme.
 */
export function panneauxAFabriquer(
  ensembles: EnsemblePlan[],
  gammes: Record<string, GammeDirectionnelle>,
  existe?: (codification: string) => boolean,
): LignePanneauPlan[] {
  const m = new Map<string, LignePanneauPlan>();
  for (const e of ensembles) {
    const gammeProduit = gammes[e.produit] ?? gammeParDefaut(e.produit);
    for (const p of e.panneaux) {
      if (!aFabriquer(p)) continue;
      const gamme: GammeDirectionnelle = estGrandFormat(p) ? 'tasman' : gammeProduit;
      const r = referencePanneau(p, gamme, e.classe, existe);
      const reference = 'reference' in r ? r.reference : null;
      const cle = reference ?? `${p.code}|${p.largeur}|${p.hauteur}|${gamme}|${e.classe}`;
      let l = m.get(cle);
      if (!l) {
        l = {
          code: p.code, largeur: p.largeur, hauteur: p.hauteur,
          produits: [], gamme, classe: e.classe, quantite: 0,
          ensembles: [], fonds: [],
          reference,
          raison: 'raison' in r ? r.raison : null,
        };
        m.set(cle, l);
      }
      l.quantite += 1;
      if (!l.produits.includes(e.produit)) l.produits.push(e.produit);
      if (!l.ensembles.includes(e.ensemble)) l.ensembles.push(e.ensemble);
      if (p.fond && !l.fonds.includes(p.fond)) l.fonds.push(p.fond);
    }
  }
  /* Ordre de lecture d'un bordereau : les flèches, puis par code et cote,
     les lignes à vérifier après celles qui ont leur référence. */
  return [...m.values()].sort((a, b) =>
    Number(estFleche(b.code)) - Number(estFleche(a.code))
    || a.code.localeCompare(b.code)
    || a.largeur - b.largeur || a.hauteur - b.hauteur
    || Number(!a.reference) - Number(!b.reference)
    || a.produits.join().localeCompare(b.produits.join()));
}

export interface LigneSupportPlan {
  designation: string;
  longueur?: number;
  longueurTotale?: number;
  quantite: number;
  ensembles: string[];
}

/** Les supports NEUFS, regroupés par désignation et longueur. */
export function supportsNeufs(ensembles: EnsemblePlan[]): LigneSupportPlan[] {
  const m = new Map<string, LigneSupportPlan>();
  for (const e of ensembles) {
    for (const s of e.supports) {
      if (s.existant) continue;
      const cle = `${s.designation}|${s.longueur ?? ''}|${s.longueurTotale ?? ''}`;
      const l = m.get(cle) ?? {
        designation: s.designation, longueur: s.longueur,
        longueurTotale: s.longueurTotale, quantite: 0, ensembles: [],
      };
      l.quantite += 1;
      if (!l.ensembles.includes(e.ensemble)) l.ensembles.push(e.ensemble);
      m.set(cle, l);
    }
  }
  return [...m.values()];
}

/** Ce que le carnet contient, sort par sort : ce qu'on ne chiffre pas se voit. */
export function bilanPlan(ensembles: EnsemblePlan[]) {
  const panneaux: Record<SortPanneau, number> = {
    neuf: 0, remplace: 0, depose: 0, existant: 0, supprime: 0,
  };
  let surfaceAFabriquer = 0;
  let supportsNeufsN = 0;
  let supportsExistants = 0;
  for (const e of ensembles) {
    for (const p of e.panneaux) {
      panneaux[p.sort] += 1;
      if (aFabriquer(p)) surfaceAFabriquer += p.surface;
    }
    for (const s of e.supports) {
      if (s.existant) supportsExistants += 1; else supportsNeufsN += 1;
    }
  }
  return {
    ensembles: ensembles.length,
    panneaux,
    surfaceAFabriquer: Math.round(surfaceAFabriquer * 1000) / 1000,
    supportsNeufs: supportsNeufsN,
    supportsExistants,
    /** Ensembles dont aucun panneau n'a pu être lu (portique hors normes,
        page vide) : ils se regardent sur le plan. */
    sansPanneau: ensembles.filter(e => !e.panneaux.length)
      .map(e => ({ ensemble: e.ensemble, page: e.page })),
    /** Gammes Kadri rencontrées, dans l'ordre du carnet. */
    produits: [...new Set(ensembles.map(e => e.produit).filter(Boolean))],
  };
}

/** Désignation d'une ligne de panneau, telle qu'elle part au devis. */
export function designationPanneau(l: LignePanneauPlan): string {
  const forme = estFleche(l.code) ? 'Panneau directionnel' : 'Panneau';
  const fonds = l.fonds.length ? ` — fond ${l.fonds.join('/').toLowerCase()}` : '';
  const classe = l.classe ? ` classe ${l.classe}` : '';
  if (l.gamme === 'tasman') {
    const t = surfaceTasman(l);
    return `${forme} ${NOM_GAMME.tasman} ${l.code} ${l.largeur}x${l.hauteur}${classe}${fonds}`
      + ` — fabriqué ${l.largeur}x${t.hauteur} (${composition(t)}), `
      + `${t.surface.toLocaleString('fr-FR')} m²`;
  }
  return `${forme} ${NOM_GAMME[l.gamme]} ${l.code} ${l.largeur}x${l.hauteur}${classe}${fonds}`;
}

/** Désignation d'un support neuf, longueur lue sur le plan. */
export function designationSupport(s: LigneSupportPlan): string {
  const lg = s.longueurTotale ?? s.longueur;
  const cote = lg ? ` — longueur ${lg.toLocaleString('fr-FR')} m (plan Kadri)` : '';
  return `${s.designation}${cote}`;
}

/* ── Lignes de la demande ───────────────────────────────────────────────── */

export interface LigneDemandePlan {
  /** Référence de grille, vide quand elle reste à établir. */
  reference: string;
  description: string;
  quantite: number;
  unite: 'u';
  ensembles: string[];
  /** L'ensemble du plan, quand les lignes sont données ensemble par ensemble. */
  ensemble?: { numero: number; nom: string; section: string; page: number };
  /** Pourquoi la ligne n'a pas de référence ; `null` quand elle en a une. */
  aVerifier: string | null;
  /**
   * Texte à chercher chez Odoo par mots, pour PROPOSER quand la référence
   * manque (Urville) ou peut manquer chez Odoo (Tasman : toutes les
   * variantes D3 ne sont pas créées). Vide sinon. Ce qui en sort n'est
   * jamais retenu d'office.
   */
  recherche: string;
}

/**
 * Comment présenter le carnet au devis :
 *   'ensemble'   ENSEMBLE PAR ENSEMBLE, sous le nom et le numéro que porte
 *                le plan Kadri (« HARF-06 ») — c'est ainsi que le client
 *                relit le chiffrage et que le poseur prépare le chantier ;
 *   'reference'  une ligne par référence, quantités additionnées.
 */
export type RegroupementPlan = 'ensemble' | 'reference';

/* ── Fixations ─────────────────────────────────────────────────────────── */

/**
 * Rails d'un panneau Lapérouse P50, lus dans la table du catalogue (« Nombre
 * de rails ») : 2 jusqu'à 600 de haut — cartouches compris —, 3 pour 750 et
 * 900, 4 pour 1200. Une hauteur absente de la table rend `null` : on ne
 * devine pas un nombre de rails.
 */
export function railsLaperouse(hauteur: number): number | null {
  if ([150, 200, 250, 300, 400, 500, 600].includes(hauteur)) return 2;
  if (hauteur === 750 || hauteur === 900) return 3;
  if (hauteur === 1200) return 4;
  return null;
}

/** Diamètre des mâts selon leur type : MB.76, MC.89, MD.114, ME.114, MF.140. */
const DIAMETRE_TYPE: Record<string, number> = { A: 60, B: 76, C: 89, D: 114, E: 114, F: 140 };

export type SectionSupport = { rond: number } | { carre: [number, number] };

/**
 * Section d'un support Kadri, lue dans sa désignation : « MAT TRAV MC » →
 * Ø89, « MAT TRAV 114E » → Ø114, « Coulisseau MCrenf » → Ø89, « TUBE GALV
 * 40x27 » → 40×27. `null` quand la désignation ne dit pas la section
 * (« TUBE GALV MC 80 », « CANDELABRE »).
 */
export function sectionSupport(designation: string): SectionSupport | null {
  /* Sans ses espaces, comme les cotes : pdf.js rend « Coulisseau M Crenf »
     et « M AT ANCRE M C ». « TUBE GALV MC 80 » devient « MC80 », qui ne se
     lit ni en type ni en diamètre — il reste illisible, et c'est voulu. */
  const type = sansEspaces(designation).toUpperCase()
    .replace(/^(MAT(TRAV|ANCRE)|COULISSEAU|TUBE(GALV|ROND)|CANDELABRE)/, '');
  const carre = type.match(/^(\d{2,3})X(\d{2,3})$/);
  if (carre) return { carre: [Number(carre[1]), Number(carre[2])] };
  const lettre = type.match(/^M([A-F])(RENF|_G)?$/);
  if (lettre) return { rond: DIAMETRE_TYPE[lettre[1]] };
  const nombre = type.match(/^(\d{2,3})(E|D|G|ALU)?$/);
  if (nombre) return { rond: Number(nombre[1]) };
  return null;
}

/** Un coulisseau prolonge le mât : ce n'est pas un support de plus. */
const estCoulisseau = (s: SupportPlan) => /^coulisseau/i.test(s.designation);

/**
 * Les fixations des panneaux Lapérouse / Vasco de Gama d'un ensemble.
 *
 * **UNE FIXATION PAR RAIL ET PAR SUPPORT**, du type que commande la SECTION
 * du support : collier simple face P50 sur un mât rond (CO89SFP50.BRUT),
 * bride sur un profil carré (BR8080SFP50.BRUT). Règle vérifiée sur vingt
 * devis Odoo, soixante ensembles sur soixante : 2 panneaux de 250 et 300
 * sur un MC.89 → 4 CO89SFP50.
 *
 * UN MÂT BI-SECTION SE FIXE SUR SA PLUS PETITE SECTION : c'est la section
 * haute qui porte les panneaux. Le coulisseau qui la forme ne compte pas
 * comme un support de plus. Tasman (`bridesPal`) et Urville (traversant,
 * sans fixation) n'entrent pas ici.
 *
 * `null` si l'ensemble n'a aucun panneau P50 à fixer ; sinon la référence,
 * ou la raison pour laquelle elle manque.
 */
export function fixationsEnsemble(
  e: EnsemblePlan,
  gammes: Record<string, GammeDirectionnelle>,
  existe?: (codification: string) => boolean,
): { reference: string | null; quantite: number; description: string; aVerifier: string | null } | null {
  const gammeProduit = gammes[e.produit] ?? gammeParDefaut(e.produit);
  const panneaux = e.panneaux.filter(p => aFabriquer(p)
    && !estGrandFormat(p) && (gammeProduit === 'laperouse' || gammeProduit === 'vasco'));
  if (!panneaux.length) return null;

  const railsParPanneau = panneaux.map(p => railsLaperouse(p.hauteur));
  const rails = railsParPanneau.reduce<number>((t, r) => t + (r ?? 0), 0);
  const horsTable = panneaux.filter((_, i) => railsParPanneau[i] === null);

  const coulisseaux = e.supports.filter(estCoulisseau);
  const mats = e.supports.filter(s => !estCoulisseau(s));
  const nbSupports = mats.length || coulisseaux.length;
  const porteurs = e.supports;
  const sections = porteurs.map(s => sectionSupport(s.designation));
  /* Tous ronds : la plus petite section. Tous du même carré : ce carré.
     Mélange ou section illisible : on ne tranche pas. */
  const ronds = sections.filter((x): x is { rond: number } => !!x && 'rond' in x);
  const carres = sections.filter((x): x is { carre: [number, number] } => !!x && 'carre' in x);
  const section: SectionSupport | null = !sections.length || sections.some(x => !x) ? null
    : ronds.length === sections.length ? { rond: Math.min(...ronds.map(r => r.rond)) }
      : carres.length === sections.length
        && carres.every(c => c.carre.join('x') === carres[0].carre.join('x')) ? carres[0]
        : null;
  const porteurSection = section && 'rond' in section
    ? porteurs.find((_, i) => { const x = sections[i]; return !!x && 'rond' in x && x.rond === section.rond; })
    : porteurs[0];

  const quantite = rails * nbSupports;
  const detail = `1 par rail : ${rails} rail(s) × ${nbSupports} support(s)`;
  const porteur = porteurSection?.designation ?? '';

  let aVerifier: string | null = null;
  if (horsTable.length) {
    aVerifier = `rails inconnus pour ${horsTable.map(p => `${p.code} ${p.largeur}x${p.hauteur}`).join(', ')}`
      + ' — hauteur absente de la table';
  } else if (!nbSupports) {
    aVerifier = 'aucun support lu sur le plan : nombre de fixations à établir';
  } else if (!section) {
    aVerifier = `section du support non lue (${porteurs.map(s => s.designation).join(', ')})`;
  }
  if (aVerifier || !section) {
    return { reference: null, quantite: quantite || 1, aVerifier,
      description: `Fixations P50 — ${detail}` };
  }

  const reference = 'rond' in section
    ? `CO${section.rond}SFP50.BRUT` : `BR${section.carre[0]}${section.carre[1]}SFP50.BRUT`;
  const nom = 'rond' in section
    ? `Collier Ø${section.rond} simple face P50` : `Bride ${section.carre[0]}x${section.carre[1]} simple face P50`;
  if (existe && !existe(reference)) {
    return { reference: null, quantite, description: `${nom} — ${detail} (${porteur})`,
      aVerifier: `${reference} absent de la grille` };
  }
  return { reference, quantite, description: `${nom} — ${detail} (${porteur})`, aVerifier: null };
}

/** La bride des panneaux à lames, telle qu'Odoo la vend. */
export const BRIDE_PAL = 'BR.PAL.H10X60.BRUT';

/**
 * Les brides des panneaux Tasman (PAL) d'un ensemble :
 *
 *   lattes × supports + 2
 *   + 4 brides par mètre linéaire de hauteur, pour le profil d'entourage,
 *     arrondi à la bride la plus proche.
 *
 * Exemple du chargé d'affaires : PAL de 2100 sur 2 supports = 7 planches
 * de 300 → 7 × 2 = 14, + 2 = 16, + 2 ml × 4 = 8 → 24. C'est exactement ce
 * que portent les devis Odoo (AF036471 : 24 brides pour 2100 comme pour
 * 1950 de haut, sur 2 IPN). ⚠️ La fiche du fabricant écrit « (lattes + 2)
 * × supports », qui en donnerait 26 : on suit l'exemple, que les devis
 * confirment.
 *
 * Les lattes sont celles du panneau FABRIQUÉ (`surfaceTasman` : planches de
 * 300, complétées de 150). Sans support lu sur le plan, le compte reste à
 * vérifier.
 */
export function bridesPal(
  e: EnsemblePlan,
  gammes: Record<string, GammeDirectionnelle>,
): { reference: string | null; quantite: number; description: string; aVerifier: string | null } | null {
  const gammeProduit = gammes[e.produit] ?? gammeParDefaut(e.produit);
  const panneaux = e.panneaux.filter(p => aFabriquer(p)
    && (estGrandFormat(p) || gammeProduit === 'tasman'));
  if (!panneaux.length) return null;
  const supports = e.supports.filter(s => !estCoulisseau(s)).length;
  const parPanneau = panneaux.map(p => {
    const t = surfaceTasman(p);
    return { lattes: t.lames, entourage: Math.round((4 * t.hauteur) / 1000) };
  });
  const detail = parPanneau.map(x => `${x.lattes} lattes × ${supports || '?'} + 2 + ${x.entourage}`)
    .join(' ; ');
  if (!supports) {
    return { reference: null, quantite: 1, description: `Brides PAL — ${detail}`,
      aVerifier: 'aucun support lu sur le plan : nombre de brides PAL à établir' };
  }
  const quantite = parPanneau.reduce((n, x) => n + x.lattes * supports + 2 + x.entourage, 0);
  return { reference: BRIDE_PAL, quantite, aVerifier: null,
    description: `Bride PAL H10x60 — ${detail}` };
}

function lignesDe(
  ensembles: EnsemblePlan[],
  gammes: Record<string, GammeDirectionnelle>,
  existe?: (codification: string) => boolean,
): LigneDemandePlan[] {
  const out: LigneDemandePlan[] = panneauxAFabriquer(ensembles, gammes, existe).map(l => {
    const classe = l.classe ? ` C${l.classe}` : '';
    return {
      reference: l.reference ?? '',
      description: designationPanneau(l),
      quantite: l.quantite,
      unite: 'u',
      ensembles: l.ensembles,
      aVerifier: l.raison ? LIBELLE_RAISON[l.raison] : null,
      recherche: l.raison === 'urville' ? `URVILLE ${l.largeur} ${l.hauteur}${classe}`
        : l.gamme === 'tasman' ? `D3 ${l.largeur} ${surfaceTasman(l).hauteur}${classe}` : '',
    };
  });
  /* Les fixations des panneaux P50, ensemble par ensemble — une
     référence commune s'additionne d'un ensemble à l'autre. */
  const fixations = new Map<string, LigneDemandePlan>();
  for (const e of ensembles) {
    const f = fixationsEnsemble(e, gammes, existe);
    if (f) {
      const cle = f.reference ?? `${e.ensemble}|${f.description}`;
      const deja = fixations.get(cle);
      if (deja && f.reference) {
        deja.quantite += f.quantite;
        if (!deja.ensembles.includes(e.ensemble)) deja.ensembles.push(e.ensemble);
        /* Cumulées, le détail « N rails × M supports » d'un seul ensemble
           ne vaudrait plus : on ne garde que l'article. */
        deja.description = deja.description.split(' — ')[0] + ' — 1 par rail et par support';
      } else {
        fixations.set(cle, {
          reference: f.reference ?? '', description: f.description, quantite: f.quantite,
          unite: 'u', ensembles: [e.ensemble], aVerifier: f.aVerifier, recherche: '',
        });
      }
    }
    const pal = bridesPal(e, gammes);
    if (pal) {
      const cle = pal.reference ? `${pal.reference}` : `${e.ensemble}|tasman`;
      const deja = fixations.get(cle);
      if (deja && pal.reference) {
        deja.quantite += pal.quantite;
        if (!deja.ensembles.includes(e.ensemble)) deja.ensembles.push(e.ensemble);
        deja.description = deja.description.split(' — ')[0]
          + ' — lattes × supports + 2 + 4 par ml de hauteur';
      } else {
        fixations.set(cle, {
          reference: pal.reference ?? '', description: pal.description, quantite: pal.quantite,
          unite: 'u', ensembles: [e.ensemble], aVerifier: pal.aVerifier, recherche: '',
        });
      }
    }
  }
  out.push(...fixations.values());
  for (const s of supportsNeufs(ensembles)) {
    out.push({
      reference: '',
      description: designationSupport(s),
      quantite: s.quantite,
      unite: 'u',
      ensembles: s.ensembles,
      aVerifier: 'support neuf : article de mât à choisir',
      recherche: '',
    });
  }
  return out;
}

/**
 * Le carnet en lignes de demande de devis : les panneaux à fabriquer, puis
 * les supports neufs — pour tout le carnet, ou ensemble par ensemble dans
 * l'ordre du plan. L'ordre est stable pour un même choix de gammes.
 */
export function lignesDuPlan(
  ensembles: EnsemblePlan[],
  gammes: Record<string, GammeDirectionnelle>,
  existe?: (codification: string) => boolean,
  regroupement: RegroupementPlan = 'ensemble',
): LigneDemandePlan[] {
  if (regroupement === 'reference') return lignesDe(ensembles, gammes, existe);
  /* Le numéro compte les ensembles QUI ONT QUELQUE CHOSE À CHIFFRER, dans
     l'ordre du plan : le devis n'a pas de trou dans sa numérotation. */
  let numero = 0;
  return ensembles.flatMap(e => {
    const lignes = lignesDe([e], gammes, existe);
    if (!lignes.length) return [];
    numero += 1;
    const ensemble = { numero, nom: e.ensemble, section: e.section, page: e.page };
    return lignes.map(l => ({ ...l, ensemble }));
  });
}

/**
 * Titre d'un ensemble au devis, écrit comme les sections des devis Odoo :
 * « Ensemble 0001/HARF-06 » — numéro d'ordre sur quatre chiffres, puis le
 * nom que porte le plan Kadri. C'est ce titre qui part chez Odoo comme
 * section (`line_section`) à l'export.
 */
export function titreEnsemble(e: { numero: number; nom: string }): string {
  return `Ensemble ${String(e.numero).padStart(4, '0')}/${e.nom}`;
}
