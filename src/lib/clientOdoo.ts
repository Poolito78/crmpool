/**
 * Retrouver chez Odoo la société d'un client MonCRM dont le nom diffère.
 *
 * L'envoi d'un devis cherchait le client par `name ilike "<nom MonCRM>"` :
 * tout ou rien. « HELIOS 62 AGENCE CÔTE D'OPALE » ne rendait rien, alors
 * qu'Odoo porte la société sous « 01ISO16621 – T1 GROUPE HELIOS (62 ST
 * MARTIN B.) », avec « AGENCE CÔTE D'OPALE » en dessous (fiche fille ou
 * ligne d'adresse). Le dialogue disait « aucune société » et renvoyait
 * l'utilisateur fouiller Odoo à la main.
 *
 * On cherche donc par MOTS : la fonction `odoo-devis` reçoit les mots
 * distinctifs du nom (`motsRechercheOdoo`), les cherche dans le nom, la
 * société mère et l'adresse des fiches, et rend ce qu'elle trouve sans rien
 * choisir. L'écran classe ces fiches (`classerClientsOdoo`) : part des mots
 * du nom MonCRM retrouvés, chez la fiche, sa mère ou son adresse. Les codes
 * Odoo (« 01ISO16621 »), les accents, les apostrophes typographiques, les
 * tirets et les parenthèses n'y comptent pour rien.
 *
 * ⚠️ ON NE RETIENT JAMAIS UNE FICHE D'OFFICE. Plusieurs agences HELIOS se
 * valent sur « HELIOS » : la liste s'affiche, l'utilisateur clique, et son
 * choix est mémorisé pour le client (`setOdooPartnerId`, `odooSync.ts`).
 */

import { normaliser } from './rapprochementClient';

/** Mots qui ne disent rien : formes juridiques, articles. Ignorés. */
const MOTS_VIDES = new Set([
  'SA', 'SAS', 'SASU', 'SARL', 'EURL', 'SCI', 'SNC', 'GIE', 'SCOP', 'SCP',
  'STE', 'SOCIETE', 'CIE', 'ET', 'LE', 'LA', 'LES', 'DU', 'DE', 'DES', 'UN',
  'UNE', 'AUX', 'POUR', 'CHEZ', 'ETS', 'ETABLISSEMENTS',
]);

/** Mots qui ne désignent personne à eux seuls : jamais cherchés, comptés à moitié. */
const MOTS_GENERIQUES = new Set([
  'GROUPE', 'GROUP', 'FRANCE', 'AGENCE', 'ENTREPRISE', 'TRAVAUX',
  'SIGNALISATION', 'MARQUAGE', 'ROUTIERE', 'PUBLICS', 'SERVICES', 'REGION',
]);

/** Un code de fiche Odoo (« 01ISO16621 », « T1 ») : lettres ET chiffres. */
const estCode = (m: string) => /\d/.test(m) && /[A-Z]/.test(m);

/**
 * Les mots d'un nom, normalisés : sans accents, ni ponctuation, ni codes,
 * ni mots vides. Un nombre se garde (« 62 »), une lettre seule non.
 */
function motsDuNom(nom: string): string[] {
  return normaliser(nom).split(' ').filter(m =>
    !estCode(m) && !MOTS_VIDES.has(m) && (/^\d+$/.test(m) || m.length >= 3));
}

/**
 * Les mots à chercher chez Odoo : les plus distinctifs, quatre au plus.
 *
 * Ni chiffre (« 62 » désigne la moitié du Pas-de-Calais), ni mot générique,
 * ni mot de moins de trois lettres. Un mot accentué part aussi sous sa forme
 * écrite : sans l'extension `unaccent`, Odoo ne rapproche pas « COTE » de
 * « CÔTE ».
 */
export function motsRechercheOdoo(nom: string): string[] {
  const ecrits = String(nom || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const vus = new Map<string, string>();
  for (const e of ecrits) {
    const n = normaliser(e);
    if (n.length < 3 || /\d/.test(n) || MOTS_VIDES.has(n) || MOTS_GENERIQUES.has(n) || vus.has(n)) continue;
    vus.set(n, e.toUpperCase());
  }
  const retenus = [...vus.entries()].sort((a, b) => b[0].length - a[0].length).slice(0, 4);
  const mots: string[] = [];
  for (const [n, e] of retenus) {
    mots.push(n);
    if (e !== n) mots.push(e);
  }
  return mots;
}

/** Une fiche Odoo telle que `odoo-devis` la rend. */
export interface CandidatOdoo {
  id: number;
  nom: string;
  ville: string;
  estSociete: boolean;
  societeMere: string;
  rue?: string;
  rue2?: string;
  /** `type` Odoo d'une fiche fille : contact, invoice, delivery, other. */
  type?: string;
}

export interface CandidatOdooClasse extends CandidatOdoo {
  /** Part (0-1) des mots du nom MonCRM retrouvés. */
  score: number;
  /** Les mots retrouvés. */
  mots: string[];
}

/** Au-delà, la liste ne se lit plus. */
const CANDIDATS_MAX = 8;

/**
 * Classe les fiches rendues par Odoo, de la plus ressemblante à la moins.
 *
 * Chaque mot du nom MonCRM vaut 1, un nombre ou un mot générique ½. Une
 * fiche est comparée à son nom, à celui de sa société mère et à son
 * adresse : c'est la fille « AGENCE CÔTE D'OPALE » d'un « GROUPE HELIOS
 * (62 …) » qui porte tous les mots de « HELIOS 62 AGENCE CÔTE D'OPALE ».
 * Une fiche n'est proposée que si elle porte au moins un mot distinctif :
 * « AGENCE » seul ne désigne personne.
 */
export function classerClientsOdoo(cherche: string, candidats: CandidatOdoo[]): CandidatOdooClasse[] {
  const mots = [...new Set(motsDuNom(cherche))];
  if (!mots.length) return [];
  const poids = (m: string) => (/^\d+$/.test(m) || MOTS_GENERIQUES.has(m) ? 0.5 : 1);
  const total = mots.reduce((s, m) => s + poids(m), 0);

  const classes: CandidatOdooClasse[] = [];
  const dejaVus = new Set<number>();
  for (const c of candidats) {
    if (dejaVus.has(c.id)) continue;
    dejaVus.add(c.id);
    const porte = new Set(motsDuNom([c.nom, c.societeMere, c.rue, c.rue2, c.ville].filter(Boolean).join(' ')));
    const trouves = mots.filter(m => porte.has(m));
    if (!trouves.some(m => poids(m) === 1)) continue;
    const score = trouves.reduce((s, m) => s + poids(m), 0) / total;
    classes.push({ ...c, score, mots: trouves });
  }

  return classes
    .sort((a, b) => b.score - a.score
      || Number(b.estSociete) - Number(a.estSociete)
      || a.nom.localeCompare(b.nom))
    .slice(0, CANDIDATS_MAX);
}

/** Ce que la fiche est, pour l'utilisateur : « adresse de … », « contact de … ». */
export function natureFicheOdoo(c: Pick<CandidatOdoo, 'estSociete' | 'societeMere' | 'type'>): string {
  if (c.estSociete) return '';
  const de = c.societeMere ? ` de ${c.societeMere}` : '';
  if (c.type === 'delivery') return `adresse de livraison${de}`;
  if (c.type === 'invoice') return `adresse de facturation${de}`;
  if (c.type === 'other') return `adresse${de}`;
  return `contact${de}`;
}
