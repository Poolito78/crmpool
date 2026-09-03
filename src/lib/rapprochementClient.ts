/**
 * Reconnaître le client dans un texte, quand il n'y a pas d'adresse e-mail.
 *
 * Un courriel se rapproche par son expéditeur : l'adresse exacte, sinon le
 * domaine. C'est sûr, et c'est ce que l'analyse de document fait d'abord.
 *
 * Reste le texte TAPÉ à la main — « fais-moi un devis pour HORUS, 30 m² de
 * Flowshield Comfort » — qui ne porte aucune adresse. Le rapprochement se
 * rabattait alors sur `nomPartenaire` et une inclusion de chaîne : tout ou
 * rien, sans accents, sans départage. « Sté Agilis » et « AGILIS
 * SIGNALISATION » ne se contiennent ni l'un ni l'autre et ne se
 * rencontraient jamais ; à l'inverse, le premier client venu dont la raison
 * sociale contenait le mot cherché l'emportait, au hasard de l'ordre du
 * tableau. C'est ainsi que REFLEX SIGNALISATION s'est retrouvé sur un devis
 * AGILIS, avec son contrat cadre et ses prix.
 *
 * TOUS LES MOTS NE SE VALENT PAS, ET LE FICHIER CLIENT LE DIT. Sur les
 * cinquante clients, « SIGNALISATION » apparaît chez sept d'entre eux et
 * « MARQUAGE » chez cinq : ces mots-là ne désignent personne. « HORUS »
 * n'apparaît qu'une fois : il désigne quelqu'un. On ne code donc pas une
 * liste de mots à ignorer — elle serait fausse dans six mois — on MESURE la
 * rareté de chaque mot dans le fichier, et le poids en découle.
 *
 * Et quand deux clients répondent aussi bien — cinq sociétés portent
 * « AGILIS » — on ne tranche pas : on rend la liste, à l'écran de choisir.
 */

/** Ce qui ne distingue pas deux sociétés. */
const MOTS_VIDES = new Set([
  'sa', 'sas', 'sasu', 'sarl', 'eurl', 'sci', 'snc', 'gie', 'scop', 'scp',
  'ste', 'societe', 'cie', 'et', 'le', 'la', 'les', 'du', 'de', 'des', 'un',
  'une', 'aux', 'aug', 'pour', 'chez', 'ets', 'etablissements', 'groupe',
  'group', 'france', 'ltd', 'gmbh', 'bv', 'nv', 'spa', 'srl', 'sprl',
]);

export function normaliser(t: string): string {
  return (t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** Les mots d'un nom qui peuvent servir à le reconnaître. */
export function motsCles(nom: string): string[] {
  return normaliser(nom)
    .split(' ')
    .filter(m => m.length >= 3 && !/^\d+$/.test(m) && !MOTS_VIDES.has(m.toLowerCase()));
}

/** Ce qu'on sait d'un client, réduit à ce dont le rapprochement a besoin. */
export interface ClientNommable {
  id: string;
  nom?: string;
  societe?: string;
}

export interface CandidatClient<C extends ClientNommable> {
  client: C;
  score: number;
  /** Les mots du client retrouvés dans le texte. */
  mots: string[];
}

export interface RapprochementClient<C extends ClientNommable> {
  /** Retenu seulement s'il devance nettement les autres. */
  retenu?: C;
  /** Du meilleur au moins bon, y compris le retenu. */
  candidats: CandidatClient<C>[];
  pourquoi: string;
}

/**
 * Poids d'un mot : d'autant plus fort qu'il désigne peu de clients.
 *
 * Un mot présent chez un seul client sur cinquante pèse lourd ; présent chez
 * sept, il ne vaut presque rien. La longueur entre aussi en compte — « SUD »
 * distingue moins que « BEAUREGARD », à rareté égale.
 */
function poidsDesMots<C extends ClientNommable>(clients: C[]): Map<string, number> {
  const total = Math.max(clients.length, 1);
  const porteurs = new Map<string, number>();
  for (const c of clients) {
    const vus = new Set([...motsCles(c.societe || ''), ...motsCles(c.nom || '')]);
    for (const m of vus) porteurs.set(m, (porteurs.get(m) || 0) + 1);
  }

  const poids = new Map<string, number>();
  for (const [mot, n] of porteurs) {
    /* ln(N / n), plancher à zéro : un mot porté par TOUS les clients ne dit
       rien du tout, et ne doit pas peser négativement. */
    const rarete = Math.max(0, Math.log(total / n));
    poids.set(mot, rarete * Math.min(mot.length, 12) / 6);
  }
  return poids;
}

/** Score minimal pour qu'un candidat soit crédible. */
const SCORE_MIN = 1.0;
/** Le premier doit dépasser le second d'au moins ce facteur. */
const AVANCE_MIN = 1.35;

/**
 * Cherche le client désigné par un texte libre.
 *
 * Le texte ENTIER est fouillé, pas seulement le nom que le modèle a bien
 * voulu extraire : sur « devis pour HORUS », le nom du client est dans la
 * phrase même quand `nomPartenaire` est resté vide. `nomPartenaire`, quand il
 * existe, est simplement ajouté au texte cherché — il ne le remplace pas.
 *
 * La comparaison se fait par MOTS ENTIERS. « SUD » ne doit pas se reconnaître
 * dans « SUDOKU », et une inclusion de chaîne ferait exactement cela.
 */
export function rapprocherClient<C extends ClientNommable>(
  texte: string,
  nomPartenaire: string | undefined,
  clients: C[],
  motsMetier?: Set<string>,
): RapprochementClient<C> {
  const vide: RapprochementClient<C> = { candidats: [], pourquoi: 'rien à chercher' };
  if (!clients.length) return vide;

  const cherche = normaliser(`${texte || ''} ${nomPartenaire || ''}`);
  if (!cherche) return vide;
  const motsTexte = new Set(cherche.split(' ').filter(Boolean));
  if (!motsTexte.size) return vide;
  /* « VILL'EQUIP » se normalise en deux mots, « Villequip » n'en fait qu'un :
     aucun des deux ne rencontrait l'autre. On compare donc aussi les formes
     collées, ce qui rattrape apostrophes, traits d'union et espaces perdus. */
  const chercheColle = cherche.replace(/ /g, '');

  const poids = poidsDesMots(clients);

  const candidats: CandidatClient<C>[] = [];
  for (const c of clients) {
    const identite = [c.societe, c.nom].filter(Boolean).join(' ');
    const mots = [...new Set(motsCles(identite))];
    if (!mots.length) continue;

    const societeColle = normaliser(c.societe || '').replace(/ /g, '');
    const parLeColle = societeColle.length >= 6 && chercheColle.includes(societeColle);

    const trouves = mots.filter(m => motsTexte.has(m));
    if (!trouves.length && !parLeColle) continue;
    if (!trouves.length) {
      /* Reconnu uniquement par sa forme collée : on lui prête les mots de sa
         raison sociale, puisque c'est bien elle qui a été écrite. */
      candidats.push({ client: c, score: 3, mots });
      continue;
    }

    /* UN MOT DU MÉTIER N'IDENTIFIE PERSONNE, si rare soit-il dans le fichier
       client. « RESINE » ne désigne qu'une société sur cinquante — et vaut
       donc très cher au calcul de rareté — mais il figure dans des milliers
       de désignations d'articles : sur « 30 m² de résine époxy sur béton »,
       il faisait sortir SERVICES & RESINE. Le catalogue sert ici de
       contre-épreuve, à la place d'une liste de mots interdits qui serait
       fausse dès la prochaine gamme. */
    let score = trouves.reduce(
      (s, m) => s + (poids.get(m) ?? 0) * (motsMetier?.has(m) ? 0.08 : 1), 0);

    /* La raison sociale écrite telle quelle dans le texte lève tous les
       doutes : « AGILIS SIGNALISATION » cité en entier ne peut pas désigner
       « AGILIS NORD », même si les deux partagent « AGILIS ». */
    const societeNorm = normaliser(c.societe || '');
    if (societeNorm && societeNorm.split(' ').length > 1 && cherche.includes(societeNorm)) {
      score *= 2;
    }

    /* Retrouver deux mots sur deux vaut mieux que deux sur cinq : le reste du
       nom, absent du texte, est une réserve. */
    score *= 0.6 + 0.4 * (trouves.length / mots.length);

    candidats.push({ client: c, score, mots: trouves });
  }

  candidats.sort((a, b) => b.score - a.score);
  if (!candidats.length) return { candidats: [], pourquoi: 'aucun client nommé dans le texte' };

  const premier = candidats[0];
  if (premier.score < SCORE_MIN) {
    return {
      candidats,
      pourquoi: `« ${premier.mots.join(' ')} » ne désigne personne en particulier`,
    };
  }

  const second = candidats[1];

  /* DEUX FICHES POUR LA MÊME SOCIÉTÉ NE SONT PAS DEUX CANDIDATS. Le fichier
     porte « REFLEX SIGNALISATION » en double, l'une avec son contact et
     l'autre sans ; les départager par le score reviendrait à s'abstenir
     alors que la raison sociale a été écrite en toutes lettres. On retient
     la fiche la plus renseignée — c'est celle qu'on veut sur un devis — et
     on dit que le doublon existe, parce qu'il se corrige dans les clients,
     pas ici. */
  if (second && normaliser(premier.client.societe || '') === normaliser(second.client.societe || '')
      && normaliser(premier.client.societe || '')) {
    const memeSociete = candidats.filter(x =>
      normaliser(x.client.societe || '') === normaliser(premier.client.societe || ''));
    const complete = memeSociete.find(x => (x.client.nom || '').trim()) ?? premier;
    return {
      retenu: complete.client,
      candidats,
      pourquoi: `${memeSociete.length} fiches portent « ${premier.client.societe} » — la plus renseignée est retenue`,
    };
  }

  if (second && premier.score < second.score * AVANCE_MIN) {
    return {
      candidats,
      pourquoi: `plusieurs clients répondent à « ${premier.mots.join(' ')} »`,
    };
  }

  return { retenu: premier.client, candidats, pourquoi: `reconnu sur « ${premier.mots.join(' ')} »` };
}

/* ── Le vocabulaire du métier ────────────────────────────────────────────── */

/**
 * Au-delà de ce nombre d'articles, un mot appartient au métier.
 *
 * Mesuré sur le catalogue : RESINE figure dans 58 désignations, ECO dans 31,
 * MARQUAGE dans 21, ROUTE dans 11 — tandis que HORUS, CADDENZ et URBALINE n'y
 * apparaissent jamais. Le seuil sépare proprement les deux, et se corrige
 * tout seul quand le catalogue change : une nouvelle gamme rend son
 * vocabulaire courant sans qu'on touche au code.
 */
export const SEUIL_MOT_METIER = 10;

/**
 * Les mots que le catalogue emploie couramment.
 *
 * À calculer UNE FOIS, à mémoriser : 22 508 désignations à parcourir. Le
 * résultat sert de contre-épreuve au rapprochement — un mot d'ici ne désigne
 * pas un client, si rare soit-il dans le fichier client.
 */
export function motsFrequentsDuCatalogue(
  produits: { description?: string }[],
  seuil = SEUIL_MOT_METIER,
): Set<string> {
  const compte = new Map<string, number>();
  for (const p of produits) {
    if (!p.description) continue;
    for (const m of new Set(motsCles(p.description))) {
      compte.set(m, (compte.get(m) || 0) + 1);
    }
  }
  const frequents = new Set<string>();
  for (const [mot, n] of compte) if (n >= seuil) frequents.add(mot);
  return frequents;
}
