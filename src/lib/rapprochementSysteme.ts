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
    .replace(/(\d)\s*(mm|cm|m2)\b/g, '$1 $2')
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
  return m ? parseFloat(m[1].replace(',', '.')) : undefined;
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

  return { nom: meilleurNom, variantes, retenu, epaisseurMm, surfaceM2, pourquoi };
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
