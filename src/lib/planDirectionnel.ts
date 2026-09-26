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
 * ⚠️ On n'invente pas la gamme. Seul « CAISSON » a une correspondance posée
 * d'office (profil 50) ; toute autre gamme Kadri (« ALU BT/M ») attend un
 * choix à l'écran, et une cote absente de la grille reste « à vérifier » —
 * une référence fabriquée serait rapprochée d'une voisine chez Odoo.
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
 * Gamme de fabrication retenue pour une gamme Kadri.
 *   '50'      caisson, profil 50           DF50 / DR50
 *   '50F'     la même, option F             DF50…F / DR50…F
 *   '25'      profil 25 (rectangles seuls)  DR25
 *   'aucune'  pas de correspondance : la ligne reste à vérifier
 */
export type GammeDirectionnelle = '50' | '50F' | '25' | 'aucune';

export const LIBELLE_GAMME: Record<GammeDirectionnelle, string> = {
  '50': 'Profil 50 (DF50 / DR50)',
  '50F': 'Profil 50 option F',
  '25': 'Profil 25 (DR25, rectangles)',
  aucune: 'À vérifier — pas de référence',
};

/**
 * Seul le CAISSON a une correspondance établie. Le reste attend un choix :
 * « ALU BT » peut désigner plusieurs fabrications, et une gamme devinée
 * change le prix de chaque panneau du carnet.
 */
export function gammeParDefaut(produitKadri: string): GammeDirectionnelle {
  return /\bCAISSON\b/i.test(produitKadri) ? '50' : 'aucune';
}

/** Le panneau a-t-il une pointe ? D21 (et ses variantes) seulement. */
export function estFleche(code: string): boolean {
  return /^D21/i.test(code);
}

/** Pourquoi une ligne n'a pas de référence, quand c'est le cas. */
export type RaisonSansReference = 'gamme' | 'classe' | 'fleche25' | 'hors-grille';

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
  if (gamme === 'aucune') return { raison: 'gamme' };
  if (!classe) return { raison: 'classe' };
  const fleche = estFleche(p.code);
  if (fleche && gamme === '25') return { raison: 'fleche25' };
  const profil = gamme === '25' ? '25' : '50';
  const famille = `${fleche ? 'DF' : 'DR'}${profil}`;
  const option = gamme === '50F' ? '.F' : '';
  const reference =
    `${famille}.${p.largeur}.${p.hauteur}.C${classe}${option}.${profil}.IS.BRUT`;
  if (existe && !existe(reference)) return { raison: 'hors-grille' };
  return { reference };
}

export const LIBELLE_RAISON: Record<RaisonSansReference, string> = {
  gamme: 'gamme Kadri sans correspondance — à choisir',
  classe: 'classe de rétroréflexion absente du plan',
  fleche25: 'pas de flèche en profil 25 à la grille',
  'hors-grille': 'format absent de la grille',
};

/* ── Regroupement en lignes de devis ────────────────────────────────────── */

export interface LignePanneauPlan {
  code: string;
  largeur: number;
  hauteur: number;
  /** Gammes Kadri regroupées sur la ligne. */
  produits: string[];
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
    const gamme = gammes[e.produit] ?? gammeParDefaut(e.produit);
    for (const p of e.panneaux) {
      if (!aFabriquer(p)) continue;
      const r = referencePanneau(p, gamme, e.classe, existe);
      const reference = 'reference' in r ? r.reference : null;
      const cle = reference ?? `${p.code}|${p.largeur}|${p.hauteur}|${e.produit}`;
      let l = m.get(cle);
      if (!l) {
        l = {
          code: p.code, largeur: p.largeur, hauteur: p.hauteur,
          produits: [], classe: e.classe, quantite: 0,
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
  /* La gamme Kadri n'est répétée que sur une ligne SANS référence : c'est
     alors la seule chose qui dise ce qu'il faut fabriquer. */
  const fonds = l.fonds.length ? ` — fond ${l.fonds.join('/').toLowerCase()}` : '';
  const gamme = l.reference ? '' : ` ${l.produits.join(' / ')}`;
  const classe = l.classe ? ` classe ${l.classe}` : '';
  return `${forme} ${l.code} ${l.largeur}x${l.hauteur}${classe}${gamme}${fonds}`;
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
  ensembles: string[];
  /** Pourquoi la ligne n'a pas de référence ; `null` quand elle en a une. */
  aVerifier: string | null;
}

/**
 * Le carnet en lignes de demande de devis : les panneaux à fabriquer, puis
 * les supports neufs. L'ordre est stable pour un même choix de gammes.
 */
export function lignesDuPlan(
  ensembles: EnsemblePlan[],
  gammes: Record<string, GammeDirectionnelle>,
  existe?: (codification: string) => boolean,
): LigneDemandePlan[] {
  const out: LigneDemandePlan[] = panneauxAFabriquer(ensembles, gammes, existe).map(l => ({
    reference: l.reference ?? '',
    description: designationPanneau(l),
    quantite: l.quantite,
    ensembles: l.ensembles,
    aVerifier: l.raison ? LIBELLE_RAISON[l.raison] : null,
  }));
  for (const s of supportsNeufs(ensembles)) {
    out.push({
      reference: '',
      description: designationSupport(s),
      quantite: s.quantite,
      ensembles: s.ensembles,
      aVerifier: 'support neuf : article de mât à choisir',
    });
  }
  return out;
}
