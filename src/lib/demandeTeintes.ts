/**
 * demandeTeintes.ts — UNE DEMANDE EN SURFACES PAR COULEUR, CHIFFRÉE EN PIGMENTS.
 *
 * EMPREINTE SIGNA (09/11/2026) colle dans « Nouveau devis — dictée ou email »
 * un tableau : « RAL 5017 bleu · Anti glissant · 13 allées piétonnes : 290 +
 * 48 + … · 493,6 m² », cinq lignes de surfaces, puis des traçages au mètre
 * linéaire et des pictos. L'IA n'en rendait qu'un client et une surface : ni
 * les zones, ni les teintes, ni un seul pot de pigment.
 *
 * Ce module lit la demande SANS IA, ligne à ligne — une ligne qui porte une
 * teinte (RAL ou couleur) et une mesure (m², ml, nombre) est une ZONE — puis
 * chiffre les pigments comme les devis déjà réalisés le font :
 *
 *   - la résine « Blank » et ses accompagnements viennent du DEVIS MODÈLE
 *     (statut « système »), à la surface peinte totale ;
 *   - UN PIGMENT PAR TEINTE, à la dose de la ligne pigment du modèle
 *     (0,072 kg/m² sur « SF41 0,5-1mm Quarté Anti Glisse » : un pot d'1 kg par
 *     kit de 14 kg) ;
 *   - une teinte que les devis réalisés dosent AUTREMENT garde sa règle : le
 *     RAL 1023 part en pot de 2 kg à dose double (DEV-2026-168, 0,114 contre
 *     0,057). La règle se LIT dans les devis, elle n'est écrite nulle part ici.
 *
 * ⚠️ ON NE DEVINE RIEN. Une bande donnée en mètres linéaires n'a pas de
 * surface tant que sa largeur n'est pas saisie ; un picto compté à l'unité
 * non plus. La zone reste « à préciser », hors du total. Un zébra bicolore
 * suit DEV-2026-029 : la première teinte sur toute la surface, la seconde sur
 * la moitié (221 m² de jaune, 110 m² de noir) — l'écran le dit et laisse
 * corriger. Le détail d'une ligne (« 1 + 17,6 + 2 + 58 ») est recalculé : un
 * écart avec la surface annoncée se signale, la surface annoncée reste.
 */

import type { Devis, LigneDevis, Produit } from './store';
import { libelleTeinte } from './ralColors';
import { ralDeLibelle } from './referenceTeinte';
import { traceDansTexte } from './rapprochementSysteme';

/* ── Lecture ─────────────────────────────────────────────────────────────── */

export interface TeinteZone {
  ral?: string;
  /** Le mot de couleur, au masculin singulier : « bleu », « blanc ». */
  couleur?: string;
  /** Part de la surface de la zone que la teinte couvre — 0,5 pour les bandes d'un zébra. */
  part: number;
}

export interface ZoneLue {
  id: string;
  /** Ce que la ligne dit, sans sa mesure. */
  libelle: string;
  teintes: TeinteZone[];
  /** « Anti glissant », « Anti dérapant » — tel que la demande l'écrit. */
  finition?: string;
  /** Surface écrite, ou calculée d'une longueur ET d'une largeur écrites. */
  surfaceM2?: number;
  /** Longueur seule : la largeur reste à saisir. */
  lineaireMl?: number;
  /** Pictos, logos, flèches comptés à l'unité : la surface d'un seul reste à saisir. */
  nombre?: number;
  /** « 493,6 m² », « 979 ml × 0,1 m = 97,9 m² » — complété à l'écran. */
  calcul?: string;
  /** Le détail de la ligne ne retombe pas sur la surface annoncée. */
  ecart?: string;
}

export interface DemandeLue {
  client?: string;
  chantier?: string;
  /** La ligne qui nomme le système : « flowcoat sf41 version Blank et pigment ». */
  systeme?: string;
  zones: ZoneLue[];
  /** « Total 637,1 m² » : contrôle de la somme des surfaces écrites. */
  totalAnnonceM2?: number;
}

const enNombre = (v: string) => parseFloat(v.replace(/\s/g, '').replace(',', '.'));
export const enFrancais = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const arrondi = (n: number) => Math.round(n * 1000) / 1000;

/** Minuscules, sans accents, « m² » → « m2 », « × » → « x ». Les « + » restent. */
function aplatir(texte: string): string {
  return (texte || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/×/g, 'x');
}

const COULEURS: readonly [string, RegExp][] = [
  ['jaune', /\bjaunes?\b/], ['noir', /\bnoire?s?\b/], ['blanc', /\bblanc(?:he)?s?\b/],
  ['bleu', /\bbleue?s?\b/], ['rouge', /\brouges?\b/], ['vert', /\bverte?s?\b/],
  ['gris', /\bgrise?s?\b/], ['orange', /\borangee?s?\b/], ['ivoire', /\bivoires?\b/],
  ['beige', /\bbeiges?\b/], ['violet', /\bviolet(?:te)?s?\b/], ['brun', /\b(?:bruns?|marrons?)\b/],
  ['rose', /\broses?\b/],
];

/** Un motif bicolore : la seconde teinte n'en couvre que la moitié. */
const BICOLORE = /\b(zebras?|hachures?|damiers?|rayures?)\b/;

/** Les teintes qu'un texte nomme, dans l'ordre où il les écrit. */
export function teintesDeTexte(texte: string): TeinteZone[] {
  const t = aplatir(texte);
  const rals = [...new Set([...t.matchAll(/\bral\s*[:.]?\s*(\d{4})\b/g)].map(m => m[1]))];
  const mots = COULEURS
    .flatMap(([couleur, re]) => { const m = re.exec(t); return m ? [{ couleur, pos: m.index }] : []; })
    .sort((a, b) => a.pos - b.pos)
    .map(m => m.couleur);
  const teintes: Omit<TeinteZone, 'part'>[] = rals.length
    ? rals.map((ral, i) => ({ ral, ...(mots[i] ? { couleur: mots[i] } : {}) }))
    : mots.map(couleur => ({ couleur }));
  const bicolore = teintes.length === 2 && BICOLORE.test(t);
  return teintes.map((x, i) => ({ ...x, part: bicolore && i === 1 ? 0.5 : 1 }));
}

const M2 = /(\d+(?:[.,]\d+)?)\s*m2\b/g;
const ML = /(\d+(?:[.,]\d+)?)\s*(?:ml|metres? lineaires?)\b/;
const A_L_UNITE = /\b(pictos?|pictogrammes?|logos?|fleches?|symboles?|pochoirs?)\b/;
const NOMBRE_FINAL = /[:=]?\s*(\d+)\s*(?:u|unites?|pieces?|pcs?)?\s*$/;
const FINITION = /anti[\s-]?(?:glissante?s?|derapante?s?|glisse)/;

/** Le détail d'une ligne, recalculé : une somme « a + b + c », ou « a x b m ». */
function detailCalcule(avantMesure: string): number | undefined {
  const somme = avantMesure.match(/\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)+/);
  if (somme) return arrondi(somme[0].split('+').reduce((s, v) => s + enNombre(v), 0));
  const produit = avantMesure.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*m\b/);
  if (produit) return arrondi(enNombre(produit[1]) * enNombre(produit[2]));
  return undefined;
}

/**
 * Lit la demande ligne à ligne. Rend toujours un objet ; `zones` est vide
 * quand le texte ne porte aucune surface par teinte — une dictée ordinaire,
 * que l'IA continue de lire seule.
 */
export function lireDemandeTeintes(texte: string): DemandeLue {
  const out: DemandeLue = { zones: [] };
  let section: TeinteZone[] = [];

  for (const brute of (texte || '').split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const t = aplatir(ligne);

    const champ = (re: RegExp) => { const m = ligne.match(re); return m ? m[1].trim() : undefined; };
    if (!out.client && /^client\b/i.test(ligne)) { out.client = champ(/^client\s*:?\s*(.+)$/i); continue; }
    if (!out.chantier && /^(chantier|affaire)\b/i.test(ligne)) { out.chantier = champ(/^(?:chantier|affaire)\s*:?\s*(.+)$/i); continue; }
    if (!out.systeme && /^syst[eè]me\b/i.test(ligne)) { out.systeme = champ(/^syst[eè]me\s*:?\s*(.+)$/i); continue; }

    const surfaces = [...t.matchAll(M2)];
    const derniere = surfaces[surfaces.length - 1];

    if (/^total\b/.test(t)) {
      /* « Total 1 637,1 m² » : ici seulement, l'espace peut séparer les milliers. */
      const m = t.match(/(\d{1,3}(?:[ \xa0]\d{3})*(?:[.,]\d+)?)\s*m2\b/);
      if (m) out.totalAnnonceM2 = enNombre(m[1]);
      continue;
    }

    const propres = teintesDeTexte(ligne);
    const trace = derniere ? undefined : traceDansTexte(ligne);
    const ml = derniere || trace ? null : t.match(ML);
    const nb = derniere || trace || ml || !A_L_UNITE.test(t) ? null : t.match(NOMBRE_FINAL);

    if (!derniere && !trace && !ml && !nb) {
      /* Un intertitre — « Traçages en mètres linéaires et pictos (blanc) : » —
         donne sa teinte aux lignes qui suivent et n'en nomment pas. */
      if (/:\s*$/.test(ligne)) section = propres;
      continue;
    }

    const teintes = propres.length ? propres : section.map(x => ({ ...x }));
    const finition = ligne.match(new RegExp(FINITION.source.replace(/e\?/g, '[eé]?').replace('derap', 'd[eé]rap'), 'i'))?.[0];
    const zone: ZoneLue = {
      id: String(out.zones.length),
      libelle: '',
      teintes,
      ...(finition ? { finition } : {}),
    };

    const cellules = ligne.split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean);
    const sansMesure = (motif: RegExp) => {
      const gardees = cellules.filter(c => !motif.test(aplatir(c)));
      const base = gardees.length && gardees.length < cellules.length
        ? gardees.join(' — ')
        : ligne.replace(new RegExp(`\\s*[:=]?\\s*${motif.source.replace(/^\^|\$$/g, '')}\\s*$`, 'i'), '');
      return base.replace(/\s*[:=]\s*$/, '').trim() || ligne;
    };

    if (derniere) {
      zone.surfaceM2 = enNombre(derniere[1]);
      zone.calcul = `${enFrancais(zone.surfaceM2)} m²`;
      const detail = detailCalcule(t.slice(0, derniere.index));
      if (detail != null && Math.abs(detail - zone.surfaceM2) > 0.05) {
        zone.ecart = `le détail fait ${enFrancais(detail)} m², la demande annonce ${enFrancais(zone.surfaceM2)} m²`;
      }
      zone.libelle = sansMesure(/^\d+(?:[.,]\d+)?\s*m(?:2|²)$/);
    } else if (trace) {
      zone.surfaceM2 = trace.surfaceM2;
      zone.calcul = trace.calcul;
      zone.libelle = ligne;
    } else if (ml) {
      zone.lineaireMl = enNombre(ml[1]);
      zone.libelle = sansMesure(/^\d+(?:[.,]\d+)?\s*ml$/);
    } else if (nb) {
      zone.nombre = parseInt(nb[1], 10);
      zone.libelle = sansMesure(/^\d+$/);
    }
    out.zones.push(zone);
  }

  /* Sans une seule teinte, ce n'est pas une demande « par couleur ». */
  if (!out.zones.some(z => z.teintes.length)) out.zones = [];
  return out;
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */

export interface ReglagesZones {
  /** Largeur des tracés donnés en mètres linéaires, en mètres. Jamais supposée. */
  largeurM?: number;
  /** Surface peinte d'un picto compté à l'unité, en m². Jamais supposée. */
  surfaceUniteM2?: number;
  /** Surfaces corrigées à la main, par identifiant de zone. */
  surfaces?: Record<string, number | undefined>;
}

/** La surface d'une zone et son calcul, ou `undefined` tant qu'il manque une cote. */
export function surfaceDeZone(z: ZoneLue, r: ReglagesZones = {}): { surfaceM2: number; calcul: string } | undefined {
  const forcee = r.surfaces?.[z.id];
  if (forcee != null && forcee > 0) return { surfaceM2: forcee, calcul: `${enFrancais(forcee)} m²` };
  if (z.surfaceM2 != null && z.surfaceM2 > 0) return { surfaceM2: z.surfaceM2, calcul: z.calcul ?? `${enFrancais(z.surfaceM2)} m²` };
  if (z.lineaireMl && r.largeurM && r.largeurM > 0) {
    const s = arrondi(z.lineaireMl * r.largeurM);
    return { surfaceM2: s, calcul: `${enFrancais(z.lineaireMl)} ml × ${enFrancais(r.largeurM)} m = ${enFrancais(s)} m²` };
  }
  if (z.nombre && r.surfaceUniteM2 && r.surfaceUniteM2 > 0) {
    const s = arrondi(z.nombre * r.surfaceUniteM2);
    return { surfaceM2: s, calcul: `${z.nombre} × ${enFrancais(r.surfaceUniteM2)} m² = ${enFrancais(s)} m²` };
  }
  return undefined;
}

/** Ce qui manque à une zone pour avoir une surface. */
export function manqueDeZone(z: ZoneLue, r: ReglagesZones = {}): string | undefined {
  if (surfaceDeZone(z, r)) return undefined;
  if (z.lineaireMl) return `${enFrancais(z.lineaireMl)} ml — largeur à préciser`;
  if (z.nombre) return `${z.nombre} unité${z.nombre > 1 ? 's' : ''} — surface d'une unité à préciser`;
  return 'surface à préciser';
}

export const cleDeTeinte = (t: Pick<TeinteZone, 'ral' | 'couleur'>): string =>
  t.ral ? `ral:${t.ral}` : `couleur:${t.couleur ?? ''}`;

export interface TeinteChantier {
  cle: string;
  ral?: string;
  couleur?: string;
  /** Somme des zones dont la surface est connue. */
  surfaceM2: number;
  /** Les zones comptées, avec leur calcul. */
  zones: string[];
  /** Les zones de cette teinte encore sans surface : hors du total. */
  manque: string[];
}

/** Les surfaces du chantier, teinte par teinte, dans l'ordre de la demande. */
export function teintesDuChantier(zones: ZoneLue[], r: ReglagesZones = {}): TeinteChantier[] {
  const parCle = new Map<string, TeinteChantier>();
  for (const z of zones) {
    const s = surfaceDeZone(z, r);
    for (const t of z.teintes) {
      const cle = cleDeTeinte(t);
      const tc = parCle.get(cle) ?? { cle, ral: t.ral, couleur: t.couleur, surfaceM2: 0, zones: [], manque: [] };
      if (!tc.couleur && t.couleur) tc.couleur = t.couleur;
      if (s) {
        const part = arrondi(s.surfaceM2 * t.part);
        tc.surfaceM2 = arrondi(tc.surfaceM2 + part);
        tc.zones.push(t.part === 1 ? `${z.libelle} : ${s.calcul}` : `${z.libelle} : ${enFrancais(part)} m² (${enFrancais(t.part * 100)} % de ${enFrancais(s.surfaceM2)} m²)`);
      } else {
        tc.manque.push(`${z.libelle} : ${manqueDeZone(z, r)}`);
      }
      parCle.set(cle, tc);
    }
  }
  return [...parCle.values()];
}

/** Surface au sol (chaque zone une fois) et surface peinte (chaque teinte à sa part). */
export function surfacesDuChantier(zones: ZoneLue[], r: ReglagesZones = {}): { solM2: number; peinteM2: number } {
  let sol = 0;
  let peinte = 0;
  for (const z of zones) {
    const s = surfaceDeZone(z, r);
    if (!s) continue;
    sol += s.surfaceM2;
    peinte += s.surfaceM2 * (z.teintes.length ? z.teintes.reduce((p, t) => p + t.part, 0) : 1);
  }
  return { solM2: arrondi(sol), peinteM2: arrondi(peinte) };
}

/** La note des zones au devis, une ligne par zone — ce que DEV-2026-168 écrit à la main. */
export function noteDesZones(zones: ZoneLue[], r: ReglagesZones = {}): string {
  return zones.map(z => {
    const s = surfaceDeZone(z, r);
    return `${z.libelle} : ${s ? s.calcul : manqueDeZone(z, r)}`;
  }).join('\n');
}

/* ── Le devis modèle et les devis réalisés ───────────────────────────────── */

type Article = Pick<Produit, 'id' | 'reference' | 'description' | 'poids' | 'variantes'>;
type ArticleDe = (id: string | undefined) => Article | undefined;

const estArticle = (l: Pick<LigneDevis, 'type'>) =>
  l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte';

/** Un pigment se reconnaît à son article, à défaut au libellé de la ligne. */
export function estLignePigment(l: Pick<LigneDevis, 'type' | 'produitId' | 'description'>, articleDe: ArticleDe): boolean {
  if (!estArticle(l)) return false;
  const a = articleDe(l.produitId);
  return /\bpigments?\b/i.test(`${a?.reference ?? ''} ${a?.description ?? ''} ${l.description ?? ''}`);
}

/** Le RAL de la teinte choisie sur une ligne, quelle que soit la dimension qui la porte. */
function ralDeLigne(l: Pick<LigneDevis, 'variantesChoisies'>): string | null {
  for (const v of Object.values(l.variantesChoisies ?? {})) {
    const ral = ralDeLibelle(v);
    if (ral) return ral;
  }
  return null;
}

export interface PigmentModele {
  produitId: string;
  /** kg de pigment par m², tel que la ligne du modèle le porte. Absent = à vérifier. */
  conso?: number;
}

/** La ligne pigment d'un devis modèle : l'article et sa dose au m². */
export function pigmentDuModele(modele: Pick<Devis, 'lignes'>, articleDe: ArticleDe): PigmentModele | undefined {
  const l = (modele.lignes || []).find(x => !!x.produitId && estLignePigment(x, articleDe));
  if (!l?.produitId) return undefined;
  return { produitId: l.produitId, ...(l.consommation && l.consommation > 0 ? { conso: l.consommation } : {}) };
}

const MOTS_VIDES = new Set(['systeme', 'systemes', 'version', 'avec', 'pour', 'les', 'des', 'sys']);
function motsDeNom(texte: string): string[] {
  return aplatir(texte).split(/[^a-z0-9]+/)
    .filter(m => m.length >= 3 && !MOTS_VIDES.has(m) && !/^\d+(mm|cm|kg)?$/.test(m) || /^\d{3,}$/.test(m));
}
const ANTI_GLISSE = /anti[\s-]?(gliss|derap)|quart[ez]/;

export interface ModeleCandidat { devis: Devis; nom: string; communs: number }

/**
 * Les devis modèles qui peuvent chiffrer la demande, le plus probable d'abord.
 *
 * Seuls comptent les modèles qui portent une ligne PIGMENT : ce sont eux qui
 * disent la dose. Il faut deux mots du nom dans la demande (« flowcoat »,
 * « sf41 ») ; une demande antidérapante préfère un modèle antiglisse, et
 * l'inverse. À égalité, rien ne tranche : l'écran laisse choisir.
 */
export function modelesPourDemande(texte: string, devis: Devis[], articleDe: ArticleDe): ModeleCandidat[] {
  const demande = new Set(motsDeNom(texte));
  const veutAnti = ANTI_GLISSE.test(aplatir(texte));
  return devis
    .filter(d => d.statut === 'système' && !!pigmentDuModele(d, articleDe))
    .map(d => {
      const nom = (d.systeme || d.referenceAffaire || d.numero || '').trim();
      const mots = [...new Set(motsDeNom(nom))];
      const communs = mots.filter(m => demande.has(m)).length;
      const anti = ANTI_GLISSE.test(aplatir(nom));
      return { devis: d, nom, communs, couverture: mots.length ? communs / mots.length : 0, accord: anti === veutAnti ? 1 : 0, taille: mots.length };
    })
    .filter(c => c.communs >= 2 || (c.communs === 1 && c.taille === 1))
    .sort((a, b) => b.accord - a.accord || b.communs - a.communs || b.couverture - a.couverture)
    .map(({ devis: d, nom, communs }) => ({ devis: d, nom, communs }));
}

/** La famille d'un RAL, d'après son nom français : « Jaune signalisation » → « jaune ». */
function familleDeRal(ral: string): string | undefined {
  const nom = libelleTeinte(`RAL ${ral}`)?.replace(/^RAL \d{4}\s*/, '');
  if (!nom) return undefined;
  const premier = aplatir(nom).split(/\s+/)[0];
  return COULEURS.find(([, re]) => re.test(premier))?.[0];
}

/**
 * Le RAL que les devis réalisés emploient pour une couleur nommée sans RAL :
 * « jaune » → 1023, « noir » → 9005. Le plus employé, et à égalité le plus
 * récent. Rien si aucun devis n'a jamais teinté dans cette couleur.
 */
export function ralDeCouleur(couleur: string, realises: Devis[], articleDe: ArticleDe): { ral: string; devis: number } | undefined {
  const vus = new Map<string, { n: number; date: string }>();
  for (const d of realises) {
    if (d.statut === 'système') continue;
    const rals = new Set((d.lignes || []).filter(l => estLignePigment(l, articleDe)).map(ralDeLigne).filter((r): r is string => !!r));
    for (const ral of rals) {
      if (familleDeRal(ral) !== couleur) continue;
      const v = vus.get(ral) ?? { n: 0, date: '' };
      vus.set(ral, { n: v.n + 1, date: (d.dateCreation || '') > v.date ? d.dateCreation || '' : v.date });
    }
  }
  const [meilleur] = [...vus.entries()].sort((a, b) => b[1].n - a[1].n || b[1].date.localeCompare(a[1].date));
  return meilleur ? { ral: meilleur[0], devis: meilleur[1].n } : undefined;
}

export interface ReglePigment {
  produitId: string;
  /** kg de pigment par m² pour cette teinte. Absent : le modèle ne dose pas son pigment. */
  conso?: number;
  /** Le devis d'où vient la règle, à afficher. */
  source: string;
}

/** Les charges et granulats : communs à trop de systèmes pour en désigner un. */
const CHARGE = /\b(quartz|silices?|sables?|granulats?|charges?|fillers?|billes?)\b/i;

/**
 * La dose que le plus de lignes partagent, ou `undefined` à égalité : deux
 * pigments à deux doses ne disent pas lequel est l'ordinaire.
 */
function doseCourante(doses: number[]): number | undefined {
  const compte = new Map<number, number>();
  for (const d of doses) compte.set(arrondi(d), (compte.get(arrondi(d)) ?? 0) + 1);
  const [premier, second] = [...compte.entries()].sort((a, b) => b[1] - a[1]);
  return premier && (!second || premier[1] > second[1]) ? premier[0] : undefined;
}

/**
 * La dose de pigment d'une teinte : celle du modèle, sauf si un devis réalisé
 * AVEC LES MÊMES ARTICLES dose cette teinte autrement que ses voisines.
 *
 * DEV-2026-168 porte, sur la même résine, le RAL 1023 à 0,114 kg/m² en pot de
 * 2 kg et les autres teintes à 0,057 : rapport 2. La teinte prend alors le pot
 * de ce devis et la dose du modèle × 2. Le devis le plus récent qui permet la
 * comparaison fait foi ; un rapport proche de 1 ne change rien. La référence
 * est la dose que le plus de pigments du devis partagent — pas une moyenne,
 * que la teinte à part fausserait.
 */
export function reglePigment(
  ral: string | undefined,
  modele: Pick<Devis, 'lignes' | 'numero'>,
  realises: Devis[],
  articleDe: ArticleDe,
): ReglePigment | undefined {
  const standard = pigmentDuModele(modele, articleDe);
  if (!standard) return undefined;
  const base: ReglePigment = { ...standard, source: modele.numero };
  if (!ral || !standard.conso) return base;

  /* « Les mêmes articles » = la même RÉSINE. Le quartz d'un antiglisse sert à
     dix systèmes : un devis Flowfast qui le partage ne dit rien du SF41. */
  const estCharge = (l: Pick<LigneDevis, 'produitId' | 'description'>) => {
    const a = articleDe(l.produitId);
    return CHARGE.test(`${a?.reference ?? ''} ${a?.description ?? ''} ${l.description ?? ''}`);
  };
  const articlesModele = new Set((modele.lignes || [])
    .filter(l => estArticle(l) && l.produitId && !estLignePigment(l, articleDe) && !estCharge(l)).map(l => l.produitId));
  const candidats = realises
    .filter(d => d.statut !== 'système' && (d.lignes || []).some(l => l.produitId && articlesModele.has(l.produitId)))
    .sort((a, b) => (b.dateCreation || '').localeCompare(a.dateCreation || ''));

  for (const d of candidats) {
    const pigments = (d.lignes || []).filter(l => l.produitId && estLignePigment(l, articleDe) && (l.consommation ?? 0) > 0);
    const dela = pigments.filter(l => ralDeLigne(l) === ral);
    const autres = pigments.filter(l => { const r = ralDeLigne(l); return r && r !== ral; });
    if (!dela.length || !autres.length) continue;
    const courante = doseCourante(pigments.map(l => l.consommation!));
    if (!courante) continue;
    const ligne = dela.reduce((m, l) => (l.consommation! > m.consommation! ? l : m));
    const rapport = ligne.consommation! / courante;
    if (rapport > 0.8 && rapport < 1.25) return { ...base, source: `${modele.numero}, comme ${d.numero}` };
    return {
      produitId: ligne.produitId!,
      conso: arrondi(standard.conso * Math.round(rapport * 100) / 100),
      source: `${d.numero} (dose × ${enFrancais(Math.round(rapport * 100) / 100)})`,
    };
  }
  return base;
}

/* ── Chiffrage ───────────────────────────────────────────────────────────── */

export interface LigneTeinte {
  cle: string;
  ral?: string;
  couleur?: string;
  surfaceM2: number;
  produitId?: string;
  conso?: number;
  /** Nombre de pots, arrondi au supérieur. Absent tant qu'il manque la dose, le poids ou la surface. */
  quantite?: number;
  source?: string;
  /** Ce qui empêche de chiffrer, ou ce qu'il faut relire. */
  aVerifier: string[];
  zones: string[];
}

/**
 * Un pigment par teinte. `ralChoisi` porte le RAL retenu à l'écran pour une
 * couleur que la demande nomme sans RAL.
 */
export function chiffrerTeintes(
  teintes: TeinteChantier[],
  modele: Pick<Devis, 'lignes' | 'numero'> | undefined,
  realises: Devis[],
  articleDe: ArticleDe,
  ralChoisi: Record<string, string | undefined> = {},
): LigneTeinte[] {
  return teintes.map((t) => {
    const ral = t.ral ?? ralChoisi[t.cle];
    const aVerifier: string[] = [];
    if (!ral) aVerifier.push('RAL à préciser');
    if (t.manque.length) aVerifier.push(`${t.manque.length} zone${t.manque.length > 1 ? 's' : ''} sans surface, hors du calcul`);
    const ligne: LigneTeinte = { cle: t.cle, ral, couleur: t.couleur, surfaceM2: t.surfaceM2, aVerifier, zones: t.zones };
    if (!modele) { aVerifier.push('aucun devis modèle : pigment non calculé'); return ligne; }
    const regle = reglePigment(ral, modele, realises, articleDe);
    if (!regle) { aVerifier.push('le modèle ne porte pas de pigment'); return ligne; }
    ligne.produitId = regle.produitId;
    ligne.source = regle.source;
    const poids = articleDe(regle.produitId)?.poids;
    if (!regle.conso) { aVerifier.push('le modèle ne dose pas son pigment'); return ligne; }
    ligne.conso = regle.conso;
    if (!poids || !(poids > 0)) { aVerifier.push('poids du pot inconnu'); return ligne; }
    if (t.surfaceM2 > 0) ligne.quantite = Math.ceil(t.surfaceM2 * regle.conso / poids - 1e-9);
    return ligne;
  });
}

/* ── Insertion dans les lignes du modèle ─────────────────────────────────── */

/** Les lignes du modèle, ses pigments remplacés par ceux des teintes, à la même place. */
export function remplacerPigments<L>(lignes: L[], teintes: L[], estPigment: (l: L) => boolean): L[] {
  const premier = lignes.findIndex(estPigment);
  const sans = lignes.filter(l => !estPigment(l));
  if (premier < 0) return [...sans, ...teintes];
  const avant = lignes.slice(0, premier).filter(l => !estPigment(l)).length;
  return [...sans.slice(0, avant), ...teintes, ...sans.slice(avant)];
}

/**
 * Les quantités des lignes en « Qté chantier » d'un modèle recopié : le besoin
 * en kg de toutes les couches d'un même article s'arrondit UNE fois au
 * conditionnement, porté par la première ligne ; les autres passent à 0. Deux
 * couches de SF41 Blank à 0,4 et 0,6 kg/m² sur 215 m² font 16 kits, pas 7 + 10.
 */
export function quantitesChantier(
  lignes: Pick<LigneDevis, 'id' | 'type' | 'produitId' | 'qteMode' | 'consommation' | 'quantite'>[],
  surface: number,
  poidsDe: (produitId: string) => number | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  const traites = new Set<string>();
  for (const l of lignes) {
    if (l.qteMode !== 'chantier' || !l.produitId || traites.has(l.produitId) || !estArticle(l)) continue;
    traites.add(l.produitId);
    const poids = poidsDe(l.produitId);
    if (!poids || !(poids > 0) || !(surface > 0)) continue;
    const memes = lignes.filter(x => x.produitId === l.produitId && estArticle(x));
    const kg = memes.reduce((s, x) => s + ((x.consommation ?? 0) > 0 ? surface * x.consommation! : 0), 0);
    if (!(kg > 0)) continue;
    const ailleurs = memes.filter(x => x.qteMode !== 'chantier').reduce((s, x) => s + (x.quantite || 0), 0);
    let reste = Math.max(0, Math.ceil(kg / poids - 1e-9) - ailleurs);
    for (const x of memes.filter(x => x.qteMode === 'chantier')) { out.set(x.id, reste); reste = 0; }
  }
  return out;
}
