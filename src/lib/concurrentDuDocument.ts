/**
 * LE DOCUMENT VIENT-IL D'UN CONCURRENT SUIVI ?
 *
 * Un devis ou un tarif de concurrent glissé n'importe où (pas seulement sur la
 * carte « Veille concurrence ») doit finir dans la veille : l'IA, elle, n'y
 * voit qu'un devis fournisseur ou un devis client. On reconnaît donc
 * l'émetteur par son nom, parmi les concurrents déjà suivis.
 *
 * Deux sources, dans l'ordre :
 *  1. le nom de partenaire lu par l'IA ;
 *  2. l'en-tête du document (son début), où l'émetteur écrit sa raison sociale.
 *
 * Garde-fous : un nom trop court (« SES ») se trouverait partout ; une société
 * qui est AUSSI notre fournisseur garde ses devis côté achats ; ISOSIGN n'est
 * jamais un concurrent. Fonction PURE.
 */

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliserNom(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Les formes juridiques ne distinguent pas deux sociétés. */
const FORMES = /\b(sas|sasu|sarl|eurl|sa|snc|sci|ets|etablissements|societe|ste|groupe|france)\b/g;
const sansForme = (n: string) => n.replace(FORMES, ' ').replace(/\s+/g, ' ').trim();

/** Longueur minimale d'un nom pour qu'on le cherche dans le texte. */
const NOM_MIN = 4;
/** L'en-tête : là où l'émetteur se nomme. */
const TAILLE_ENTETE = 1500;

const contientMot = (texte: string, nom: string) => ` ${texte} `.includes(` ${nom} `);

export function concurrentDuDocument<C extends { id: string; nom: string }>(
  texte: string,
  nomPartenaire: string | undefined,
  concurrents: readonly C[],
  fournisseurs: readonly { nom: string }[],
): C | undefined {
  const nomsFournisseurs = fournisseurs.map(f => sansForme(normaliserNom(f.nom ?? ''))).filter(n => n.length >= NOM_MIN);
  const candidats = concurrents
    .map(c => ({ c, n: sansForme(normaliserNom(c.nom)) }))
    .filter(({ n }) => n.length >= NOM_MIN && !/\bisosign\b/.test(n))
    /* Concurrent ET fournisseur : ses devis restent des devis fournisseur. */
    .filter(({ n }) => !nomsFournisseurs.some(f => f === n || contientMot(f, n) || contientMot(n, f)));
  if (!candidats.length) return undefined;

  const partenaire = sansForme(normaliserNom(nomPartenaire ?? ''));
  if (partenaire.length >= NOM_MIN) {
    const trouve = candidats.find(({ n }) => n === partenaire || contientMot(partenaire, n) || contientMot(n, partenaire));
    if (trouve) return trouve.c;
  }

  const entete = normaliserNom(texte.slice(0, TAILLE_ENTETE));
  if (!entete) return undefined;
  return candidats.find(({ n }) => contientMot(entete, n))?.c;
}
