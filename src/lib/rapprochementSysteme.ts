import type { Systeme } from '@/lib/systemes';

/**
 * Reconnaissance d'un SYSTÈME dans une ligne de demande client.
 *
 * Une demande de résine ne nomme pas un article, elle nomme une mise en
 * œuvre : « SYSTEME FLOWSHIELD COMFORT 3MM · 30 ». Il n'existe aucun article
 * de ce nom au catalogue, et le rapprochement par le libellé allait chercher
 * ce qui contenait le mot « système » — un SYSTÈME D'ACCROCHE (KIT DE 2
 * CROCHETS) POUR PANNEAU à 0,70 €, chiffré 30 fois, soit 21 € pour un
 * chantier de 1 980 €.
 *
 * Le bon geste n'est pas de mieux noter les articles : c'est de reconnaître
 * qu'on ne cherche pas un article. Un système se décline ensuite en ses
 * composants — primaire, couche de masse, finition — chacun avec son dosage
 * au m², son conditionnement et son prix.
 *
 * La reconnaissance est EXIGEANTE : tous les mots significatifs du nom du
 * système doivent figurer dans la demande. « Flowshield SL » ne répond pas à
 * « flowshield comfort », et « système d'accroche » ne répond à rien. Un
 * système reconnu à tort coûte plus cher qu'un système non reconnu : le
 * second se voit, le premier remplace un chiffrage par un autre.
 */

export interface RapprochementSysteme {
  /** Le nom retenu, tel qu'il est en base — « Flowshield Comfort ». */
  nom: string;
  /** Toutes les variantes portant ce nom, dans l'ordre de la base. */
  variantes: Systeme[];
  /**
   * La variante que la demande désigne sans ambiguïté : l'unique, ou celle
   * dont l'épaisseur correspond. Absente quand il reste à choisir — on ne
   * tranche pas entre 2 mm et 3 mm à la place du chargé d'affaires, l'écart
   * est de 620 € sur 30 m².
   */
  retenu?: Systeme;
  /** Épaisseur lue dans la demande, en millimètres. */
  epaisseurMm?: number;
  /** Surface lue dans la demande, en m². Absente si la demande n'en porte pas. */
  surfaceM2?: number;
  /** Les dimensions d'un tracé — « 0,10 m de largeur x 965 ml ». */
  trace?: DimensionsTrace;
  /** À afficher tel quel : ce qui a été compris, ou ce qui manque. */
  pourquoi: string;
}

/* ── Normalisation ───────────────────────────────────────────────────────── */

/**
 * Minuscules, sans accents, et un espace entre un nombre et l'unité qui le
 * suit : « 3MM » devient « 3 mm », faute de quoi ni l'épaisseur ni le
 * découpage en mots ne retrouvent leurs petits.
 */
export function normaliser(texte: string): string {
  return (texte || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    /* « m² » s'écrit aussi « m2 » : une seule forme à chercher ensuite. */
    .replace(/²/g, '2')
    /* « 1000×400 mm » : le signe de multiplication est un x. */
    .replace(/×/g, 'x')
    /* Flowcrete écrit ses gammes en anglais, ceux qui les vendent écrivent en
       français : « Flowshield Comfort » se demande « flowshield confort », et
       le système n'était pas reconnu pour une lettre. Les deux graphies sont
       la même chose. */
    .replace(/\bcomfort\b/g, 'confort')
    /* « 965ml », « 0.10m » : le mètre et le mètre linéaire aussi. */
    .replace(/(\d)\s*(mm|cm|ml|m2|m)\b/g, '$1 $2')
    .replace(/[^a-z0-9,.]+/g, ' ')
    .trim();
}

/**
 * Mots que le client ajoute et que la base ne porte pas — ou l'inverse. Les
 * écarter des deux côtés évite qu'un « système » de trop fasse échouer la
 * comparaison, et qu'un « système » tout court la fasse réussir.
 */
const MOTS_VIDES = new Set([
  'systeme', 'systemes', 'system', 'de', 'du', 'la', 'le', 'les', 'des', 'et',
  'en', 'pour', 'sur', 'au', 'aux', 'a', 'avec', 'ou', 'mm', 'cm', 'm2', 'kg',
  'ml', 'ep', 'epaisseur', 'fourniture', 'sol', 'resine',
]);

function motsSignificatifs(texte: string): string[] {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter(m => m.length > 1 && !MOTS_VIDES.has(m) && !/^\d+([.,]\d+)?$/.test(m));
}

/** Premier nombre suivi de « mm », en millimètres. */
export function epaisseurDansTexte(texte: string): number | undefined {
  const m = normaliser(texte).match(/(\d+(?:[.,]\d+)?)\s*mm\b/);
  return m ? parseFloat(m[1].replace(',', '.')) : undefined;
}

/** Premier nombre suivi de « m² » ou « m2 », en mètres carrés. */
export function surfaceDansTexte(texte: string): number | undefined {
  const m = normaliser(texte).match(/(\d+(?:[.,]\d+)?)\s*m2\b/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return traceDansTexte(texte)?.surfaceM2;
}

/* ── Tracés : bandes, lignes, flèches ────────────────────────────────────── */

/**
 * Largeur au-delà de laquelle un tracé n'est plus une BANDE. Le marquage se
 * demande en 0,10 m, parfois en 0,12 ou 0,15 m ; une flèche de 1,40 m n'en
 * est pas une.
 */
export const LARGEUR_BANDE_MAX_M = 0.15;

export interface DimensionsTrace {
  longueurMl: number;
  largeurM: number;
  /** « x 16 unités » : le nombre de tracés identiques. 1 par défaut. */
  nombre: number;
  surfaceM2: number;
  /** Largeur ≤ 0,15 m : on prépare de petits mélanges. */
  bande: boolean;
  /** « 965 ml × 0,1 m = 96,5 m² », à afficher tel quel. */
  calcul: string;
}

const enNombre = (v: string) => parseFloat(v.replace(',', '.'));
const enFrancais = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

/**
 * Les dimensions d'un tracé : « Ligne jaune 0,10 m de largeur x 965ml »,
 * « Flèches bleu dimension 3ml x 1,40m x 16 unités », « bande de 10 cm sur
 * 120 ml ».
 *
 * La surface d'un marquage n'est presque jamais écrite : le client donne une
 * longueur et une largeur, et c'est la surface qui fait la consommation. Rien
 * n'est rendu sans une longueur ET une largeur — une largeur devinée ferait
 * une surface fausse que rien ne signalerait.
 *
 * ⚠️ Pour une flèche, la surface rendue est celle du RECTANGLE qui la
 * contient : un maximum, pas la surface peinte.
 */
export function traceDansTexte(texte: string): DimensionsTrace | undefined {
  const t = normaliser(texte);
  const ml = t.match(/(\d+(?:[.,]\d+)?)\s*ml\b/);
  if (!ml) return undefined;
  const longueurMl = enNombre(ml[1]);

  let largeurM: number | undefined;
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*m\b/);
  const cm = t.match(/(\d+(?:[.,]\d+)?)\s*cm\b/);
  /* « bande 0,10 », « largeur 0,12 » : le mètre est sous-entendu. */
  const nu = t.match(/\b(?:bandes?|largeur|larg)\s*(?:de\s*)?(0[.,]\d+)(?![\d.,])/);
  if (m) largeurM = enNombre(m[1]);
  else if (cm) largeurM = enNombre(cm[1]) / 100;
  else if (nu) largeurM = enNombre(nu[1]);
  if (!(longueurMl > 0) || !largeurM || !(largeurM > 0)) return undefined;

  const n = t.match(/\bx\s*(\d+)\s*(?:unites?|u|pieces?|pcs?|fleches?)\b/)
    ?? t.match(/\b(\d+)\s*(?:unites?|pieces?|fleches?)\b/);
  const nombre = n ? parseInt(n[1], 10) : 1;

  const surfaceM2 = Math.round(longueurMl * largeurM * nombre * 1000) / 1000;
  return {
    longueurMl,
    largeurM,
    nombre,
    surfaceM2,
    bande: largeurM <= LARGEUR_BANDE_MAX_M,
    calcul: `${enFrancais(longueurMl)} ml × ${enFrancais(largeurM)} m`
      + (nombre > 1 ? ` × ${nombre}` : '')
      + ` = ${enFrancais(surfaceM2)} m²`,
  };
}

/* ── Zones d'un système nommé une fois pour tout le document ─────────────── */

/**
 * La teinte d'une zone, au masculin : « Ligne jaune », « bandes blanches ».
 * Elle choisit le pigment — le jaune a le sien, dosé à part.
 */
export function couleurDansTexte(texte: string): string | undefined {
  const m = normaliser(texte).match(
    /\b(jaune|blanc|vert|bleu|rouge|noir|gris|orange)(?:he|e)?s?\b/);
  return m?.[1];
}

/** Les mots d'un tracé : ce qui distingue une zone d'un article. */
const MOTS_TRACE = /\b(lignes?|bandes?|fleches?|logos?|pictogrammes?|pictos?|marquages?|passages?|zones?|damiers?|chevrons?|bordures?|allees?|cheminements?)\b/;

export interface ZoneDemande {
  surfaceM2: number;
  bande: boolean;
  couleur?: string;
  /** « 965 ml × 0,1 m = 96,5 m² », à afficher tel quel. */
  calcul: string;
  /** La surface est celle d'un rectangle englobant : un maximum. */
  maximum: boolean;
}

/**
 * La zone que décrit une ligne quand le système est nommé ailleurs — « Merci
 * de chiffrer un système Flowfast 319 Concrete : » suivi de « Ligne jaune
 * 0,10 m de largeur x 965 ml ».
 *
 * La lecture du document range souvent la longueur dans la QUANTITÉ : la
 * ligne devient « Ligne jaune 0,10 m de largeur », quantité 965. On recolle
 * donc les deux :
 *   - largeur écrite sans longueur → la quantité est la longueur en ml ;
 *   - tracé complet (« 3 ml x 1,40 m ») → la quantité est le nombre de
 *     tracés, sauf si elle répète la longueur ;
 *   - « logo 1000×400 mm », quantité 20 → vingt rectangles.
 *
 * Rien n'est rendu pour une ligne qui ne parle pas d'un tracé : un « seau de
 * primaire » ne devient pas une zone.
 */
export function zoneDeDemande(texte: string, quantite?: number | null): ZoneDemande | undefined {
  const t = normaliser(texte);
  if (!MOTS_TRACE.test(t)) return undefined;
  const q = quantite && quantite > 0 ? quantite : 1;
  const couleur = couleurDansTexte(t);
  const fin = (surface: number, bande: boolean, calcul: string, maximum: boolean): ZoneDemande => ({
    surfaceM2: Math.round(surface * 1000) / 1000, bande, calcul, maximum,
    ...(couleur ? { couleur } : {}),
  });

  const trace = traceDansTexte(t);
  if (trace) {
    const nombre = trace.nombre > 1 || q === trace.longueurMl ? trace.nombre : trace.nombre * q;
    const surface = trace.longueurMl * trace.largeurM * nombre;
    return fin(surface, trace.bande,
      `${enFrancais(trace.longueurMl)} ml × ${enFrancais(trace.largeurM)} m`
        + (nombre > 1 ? ` × ${nombre}` : '') + ` = ${enFrancais(surface)} m²`,
      !trace.bande);
  }

  /* Largeur seule : la longueur est dans la quantité. */
  if (q > 1) {
    const avecLongueur = traceDansTexte(`${t} x ${q} ml`);
    if (avecLongueur) {
      return fin(avecLongueur.surfaceM2, avecLongueur.bande, avecLongueur.calcul, !avecLongueur.bande);
    }
  }

  /* Un logo, un pictogramme : ses cotes en mm, une pièce par unité. */
  const r = t.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/);
  if (r) {
    const div = r[3] === 'mm' ? 1000 : r[3] === 'cm' ? 100 : 1;
    const a = enNombre(r[1]) / div;
    const b = enNombre(r[2]) / div;
    const surface = a * b * q;
    return fin(surface, false,
      `${enFrancais(a)} m × ${enFrancais(b)} m` + (q > 1 ? ` × ${q}` : '') + ` = ${enFrancais(surface)} m²`,
      true);
  }
  return undefined;
}

/* ── Rapprochement ───────────────────────────────────────────────────────── */

/**
 * Le système que désigne une demande, s'il y en a un.
 *
 * Tous les mots significatifs du nom doivent être présents. À plusieurs noms
 * possibles — « Peran STB » et « Peran STB Compact » répondent tous deux à
 * « peran stb compact » — le plus précis l'emporte : il porte davantage de ce
 * que le client a écrit.
 */
export function rapprocherSysteme(
  texte: string,
  systemes: Systeme[],
): RapprochementSysteme | null {
  const demande = normaliser(texte);
  if (!demande || !systemes.length) return null;

  const motsDemande = new Set(motsSignificatifs(demande));
  if (!motsDemande.size) return null;

  /* Un nom entièrement contenu dans la demande. On garde le plus long : le
     nombre de mots reconnus départage, et à égalité la longueur du nom. */
  let meilleurNom = '';
  let meilleurPoids = 0;
  const noms = new Set(systemes.map(s => s.nom));

  for (const nom of noms) {
    const mn = motsSignificatifs(nom);
    if (!mn.length) continue;
    /* Un nom d'un seul mot doit être distinctif : « Coracoat », « Corafloor »
       le sont ; un nom de trois lettres ne le serait pas. */
    if (mn.length === 1 && mn[0].length < 5) continue;
    if (!mn.every(m => motsDemande.has(m))) continue;

    const poids = mn.length * 1000 + nom.length;
    if (poids > meilleurPoids) { meilleurPoids = poids; meilleurNom = nom; }
  }

  if (!meilleurNom) return null;

  const variantes = systemes.filter(s => s.nom === meilleurNom);
  const epaisseurMm = epaisseurDansTexte(demande);
  const surfaceM2 = surfaceDansTexte(demande);
  const trace = traceDansTexte(demande);

  let retenu: Systeme | undefined;
  let pourquoi: string;

  if (variantes.length === 1) {
    retenu = variantes[0];
    pourquoi = retenu.variante
      ? `${meilleurNom} — ${retenu.variante}`
      : meilleurNom;
  } else if (epaisseurMm != null) {
    const parEpaisseur = variantes.filter(
      v => epaisseurDansTexte(v.variante || '') === epaisseurMm,
    );
    if (parEpaisseur.length === 1) {
      retenu = parEpaisseur[0];
      pourquoi = `${meilleurNom} — ${retenu.variante} (épaisseur lue dans la demande)`;
    } else {
      pourquoi = `${meilleurNom} — ${epaisseurMm} mm ne désigne pas une seule `
        + `variante : ${variantes.map(v => v.variante).filter(Boolean).join(', ')}`;
    }
  } else {
    pourquoi = `${meilleurNom} — variante à choisir : `
      + variantes.map(v => v.variante).filter(Boolean).join(', ');
  }

  return {
    nom: meilleurNom, variantes, retenu, epaisseurMm, surfaceM2, pourquoi,
    ...(trace ? { trace } : {}),
  };
}

/**
 * Surface à chiffrer pour une ligne.
 *
 * La demande porte parfois « 30 m² » dans son libellé ; le plus souvent la
 * surface est simplement la QUANTITÉ de la ligne — le client écrit « 30 » en
 * face de « système Flowshield Comfort 3 mm ». Un système ne se commande pas
 * à l'unité : la quantité d'une ligne système est une surface.
 */
export function surfaceDeDemande(
  rap: RapprochementSysteme | null | undefined,
  quantite?: number | null,
): number {
  if (rap?.surfaceM2 != null && rap.surfaceM2 > 0) return rap.surfaceM2;
  return quantite && quantite > 0 ? quantite : 0;
}
