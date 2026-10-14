/* Assistant vocal — ce qu'une phrase dite veut dire.
 *
 * L'assistant écoute en continu (`AssistantVocal.tsx`) et chaque phrase
 * reconnue passe ici. Deux natures de phrase : une COMMANDE (ouvrir une page,
 * créer une tâche, aller au champ Titre, chercher un devis, le stock d'un
 * article) ou du TEXTE à écrire dans le champ actif. Ce module ne touche ni au
 * DOM ni au routeur : il décide, la coquille exécute — et c'est testable.
 *
 * ⚠️ UNE COMMANDE NE SE RECONNAÎT QUE SI ELLE SE RÉSOUT ENTIÈREMENT. Dicter
 * « ouvrir le chantier lundi » dans une description ne doit pas quitter la
 * page : « ouvre » n'emmène nulle part tant que la suite n'est pas EXACTEMENT
 * un nom de page. Même règle pour les champs (« aller au titre ») : une cible
 * inconnue retombe en dictée, jamais en erreur silencieuse.
 *
 * ⚠️ ON NE DEVINE PAS UNE DATE. « le 3 » sans mois tombe dans le mois en
 * cours (ou le suivant s'il est passé) ; ce qui ne se lit pas renvoie `null`
 * et l'écran le dit — une date de relance fausse ne se voit pas.
 */

import type { TypeCrmAction } from '@/lib/store';

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Forme de comparaison : normalisée, pluriels ramenés au singulier. */
function cle(texte: string): string {
  return normaliser(texte)
    .split(' ')
    .map(m => (m.length > 3 ? m.replace(/[sx]$/, '') : m))
    .join(' ');
}

const ARTICLES = /^(?:(?:le|la|les|l|au|aux|a|du|des|de|d|sur|dans|en|un|une|mon|ma|mes|ce|cette)\s+)+/;
function sansArticles(t: string): string {
  return t.replace(ARTICLES, '').trim();
}

// ── Pages ───────────────────────────────────────────────────────────────

export interface PageVocale { path: string; label: string; noms: string[] }

export const PAGES_VOCALES: PageVocale[] = [
  { path: '/', label: 'Tableau de bord', noms: ['tableau de bord', 'accueil', 'dashboard'] },
  { path: '/veille-concurrence', label: 'Veille Concurrence', noms: ['veille', 'veille concurrence', 'concurrence', 'concurrents'] },
  { path: '/crm', label: 'CRM', noms: ['crm'] },
  { path: '/crm?tab=pipeline', label: 'CRM · Pipeline', noms: ['pipeline'] },
  { path: '/crm?tab=actions', label: 'CRM · Actions', noms: ['actions', 'actions commerciales', 'taches'] },
  { path: '/crm?tab=relances', label: 'CRM · Relances', noms: ['relances'] },
  { path: '/crm?tab=calendrier', label: 'CRM · Calendrier', noms: ['calendrier', 'agenda'] },
  { path: '/clients', label: 'Clients', noms: ['clients', 'prospects'] },
  { path: '/produits', label: 'Produits', noms: ['produits', 'articles', 'catalogue'] },
  { path: '/devis', label: 'Devis', noms: ['devis', 'devis clients'] },
  { path: '/commandes-client', label: 'Commandes Client', noms: ['commandes clients'] },
  { path: '/factures-client', label: 'Factures Client', noms: ['factures clients', 'factures'] },
  { path: '/fournisseurs', label: 'Fournisseurs', noms: ['fournisseurs'] },
  { path: '/devis-fournisseurs', label: 'Devis Fournisseurs', noms: ['devis fournisseurs'] },
  { path: '/commandes', label: 'Cmd Fournisseur', noms: ['commandes fournisseurs', 'commandes achat', 'commandes'] },
  { path: '/factures-fournisseur', label: 'Factures Fourn.', noms: ['factures fournisseurs'] },
  { path: '/stock', label: 'Stock', noms: ['stock', 'stocks'] },
  { path: '/calculateur-ups', label: 'Calcul Transport', noms: ['transport', 'calcul transport', 'calculateur'] },
  { path: '/parametres', label: 'Paramètres', noms: ['parametres', 'reglages'] },
  { path: '/parametres?tab=mails', label: 'Paramètres · Mails', noms: ['mails types', 'parametres mails'] },
  { path: '/ged', label: 'Historique GED', noms: ['ged', 'historique ged'] },
];

function pageNommee(texte: string): PageVocale | undefined {
  const k = cle(sansArticles(texte));
  if (!k) return undefined;
  return PAGES_VOCALES.find(p => p.noms.some(n => cle(n) === k));
}

// ── Commandes ───────────────────────────────────────────────────────────

export type CommandeVocale =
  | { kind: 'page'; page: PageVocale; fenetre: boolean }
  | { kind: 'nouvelleAction'; type: TypeCrmAction; client?: string }
  | { kind: 'nouveauDevis' }
  | { kind: 'chercherDevis'; requete: string }
  | { kind: 'chercherProduit'; requete: string; stock: boolean }
  | { kind: 'chercher'; requete: string; page?: PageVocale }
  | { kind: 'resultat'; rang: number }
  | { kind: 'analyse' }
  | { kind: 'allerChamp'; nom: string }
  | { kind: 'suivant' }
  | { kind: 'precedent' }
  | { kind: 'clic'; cible: string }
  | { kind: 'ajouter'; objet: string }
  | { kind: 'oublier'; phrase: string }
  | { kind: 'valider' }
  | { kind: 'fermer' }
  | { kind: 'corriger' }
  | { kind: 'effacer' }
  | { kind: 'stop' }
  | { kind: 'aide' }
  | { kind: 'silence'; actif: boolean };

const TYPES_ACTION: [RegExp, TypeCrmAction][] = [
  [/^(?:tache|action|action commerciale)$/, 'tache'],
  [/^(?:appel|appel telephonique|coup de fil)$/, 'appel'],
  [/^visite$/, 'visite'],
  [/^(?:rendez vous|rdv)$/, 'rdv'],
  [/^(?:e ?mail|mail|courriel)$/, 'email'],
];

const RANGS: Record<string, number> = {
  premier: 1, premiere: 1, un: 1, deuxieme: 2, second: 2, seconde: 2, deux: 2,
  troisieme: 3, trois: 3, quatrieme: 4, quatre: 4, cinquieme: 5, cinq: 5,
  sixieme: 6, six: 6, septieme: 7, sept: 7, huitieme: 8, huit: 8,
};

const MOTS_VALIDER = new Set(['valider', 'valide', 'validez', 'creer', 'cree', 'enregistrer', 'enregistre', 'sauvegarder', 'sauvegarde', 'confirmer', 'confirme']);
const MOTS_FERMER = new Set(['fermer', 'ferme', 'fermez', 'ferme la fenetre', 'fermer la fenetre', 'annuler', 'annule', 'quitter']);
const MOTS_CORRIGER = new Set(['corriger', 'corrige', 'efface ca', 'supprime ca', 'annule ca', 'retire ca', 'efface la derniere phrase', 'supprime la derniere phrase']);
const MOTS_EFFACER = new Set(['tout effacer', 'efface tout', 'effacer tout', 'effacer le champ', 'efface le champ', 'vider le champ', 'vide le champ']);
const MOTS_STOP = new Set(['stop', 'arrete', 'arreter', 'arrete l ecoute', 'fin de dictee', 'arrete l assistant', 'stop assistant', 'stop micro', 'coupe le micro']);
const MOTS_AIDE = new Set(['aide', 'que puis je dire', 'quelles commandes', 'liste des commandes']);

/**
 * Interprète une phrase. `null` = ce n'est pas une commande « fixe » : la
 * coquille essaie alors les champs de l'écran, puis la dictée.
 */
export function interpreter(phrase: string): CommandeVocale | null {
  const n = normaliser(phrase);
  if (!n) return null;

  if (MOTS_STOP.has(n)) return { kind: 'stop' };
  if (MOTS_AIDE.has(n)) return { kind: 'aide' };
  if (MOTS_VALIDER.has(n)) return { kind: 'valider' };
  if (MOTS_FERMER.has(n)) return { kind: 'fermer' };
  if (MOTS_CORRIGER.has(n)) return { kind: 'corriger' };
  if (MOTS_EFFACER.has(n)) return { kind: 'effacer' };
  if (/^(?:champ )?suivant$/.test(n)) return { kind: 'suivant' };
  if (/^(?:champ )?precedent$/.test(n)) return { kind: 'precedent' };
  if (/^(?:tais toi|silence|mode muet|coupe la voix)$/.test(n)) return { kind: 'silence', actif: true };
  if (/^(?:parle|reactive la voix|active la voix)$/.test(n)) return { kind: 'silence', actif: false };
  if (/^(?:analyse(?:r)?|ouvre l analyse|ouvrir l analyse)(?: de| d un| du)? documents?$/.test(n)) return { kind: 'analyse' };

  // Nouvelle action (« nouvelle tâche pour Dupont ») / nouveau devis
  let m = n.match(/^(?:nouvelle|nouveau|nouvel|creer|cree|ajoute|ajouter|planifie|planifier)(?: une| un)? (.+)$/);
  if (m) {
    const [, objet, client] = m[1].match(/^(.+?)(?: (?:pour|chez|avec) (.+))?$/) ?? [];
    if (objet === 'devis' && !client) return { kind: 'nouveauDevis' };
    for (const [re, type] of TYPES_ACTION) {
      if (objet && re.test(objet)) return client ? { kind: 'nouvelleAction', type, client } : { kind: 'nouvelleAction', type };
    }
  }
  /* « ajoute une ligne », « insère un groupe » : le bouton « + Ligne »,
     « Groupe », « Note »… de l'écran. Rien n'est créé ici — on clique. */
  m = n.match(/^(?:ajoute|ajouter|ajoutez|insere|inserer|nouvelle|nouveau|nouvel)(?: une| un| des| la| le)? (?!fenetre )(.+)$/);
  if (m) return { kind: 'ajouter', objet: m[1] };

  m = n.match(/^(?:oublie|oublier|supprime|supprimer|efface|effacer) (?:la |cette )?commande (.+)$/);
  if (m) return { kind: 'oublier', phrase: m[1] };

  // « ouvre le premier », « numéro 2 » — jamais « le 2 » seul, qui est une date
  m = n.match(/^(?:(?:ouvre|ouvrir|affiche|prends|prendre|choisis|choisir)(?: le| la)?(?: numero| resultat)?|numero|resultat) (premier|premiere|deuxieme|second|seconde|troisieme|quatrieme|cinquieme|sixieme|septieme|huitieme|\d)$/);
  if (m) {
    const rang = /^\d$/.test(m[1]) ? Number(m[1]) : RANGS[m[1]];
    if (rang) return { kind: 'resultat', rang };
  }

  /* Stock d'un article. Il faut une question ou le mot « produit / article » :
     « stock à vérifier sur le chantier » dicté dans une note reste du texte. */
  m = n.match(/^(?:quel est|quels sont|donne moi|affiche|montre moi|dis moi|verifie) (?:le |les )?stocks? (?:disponible )?(?:du |de la |de l |des |de |d )?(?:produit |article |ref |reference )?(.+)$/)
    ?? n.match(/^stocks? (?:disponible )?(?:du |de l |de |d )?(?:produit|article|ref|reference) (.+)$/)
    ?? n.match(/^combien (?:de |d )?(.+?) (?:en stock|reste t il|il reste|disponibles?)$/)
    ?? n.match(/^(?:est ce qu )?(?:il reste |on a )(?:du |de la |des |de |d )?(.+?) en stock$/);
  if (m && m[1].trim()) return { kind: 'chercherProduit', requete: m[1].trim(), stock: true };

  // Recherche d'un article
  m = n.match(/^(?:cherche|chercher|recherche|rechercher|trouve|trouver|ouvre|ouvrir|affiche)(?: moi)? (?:le |la |l |un |une |les )?(?:produit|produits|article|articles|reference) (.+)$/);
  if (m) return { kind: 'chercherProduit', requete: m[1].trim(), stock: false };

  // Pages (avant la recherche de devis : « ouvre les devis fournisseurs » est une page)
  m = n.match(/^(?:ouvre|ouvrir|va|vas|aller|allez|affiche|afficher|montre|montrer|page)(?: moi)?(?: sur| a| au| aux| dans)? (.+)$/);
  if (m) {
    let suite = m[1];
    const fenetre = /\b(?:dans une |en )?nouvelle fenetre$/.test(suite);
    suite = suite.replace(/\s*(?:dans une |en )?nouvelle fenetre$/, '');
    const page = pageNommee(suite);
    if (page) return { kind: 'page', page, fenetre };
  }
  m = n.match(/^nouvelle fenetre (.+)$/);
  if (m) {
    const page = pageNommee(m[1]);
    if (page) return { kind: 'page', page, fenetre: true };
  }

  // Recherche d'un devis
  m = n.match(/^(?:cherche|chercher|recherche|rechercher|trouve|trouver|ouvre|ouvrir|affiche|afficher)(?: moi)? (?:le |les |un )?devis (.+)$/);
  if (m && !pageNommee(`devis ${m[1]}`)) return { kind: 'chercherDevis', requete: m[1].trim() };

  // Recherche générique, éventuellement sur une page nommée
  m = n.match(/^(?:cherche|chercher|recherche|rechercher|filtre|filtrer)(?: moi)? (.+?)(?: dans (.+))?$/);
  if (m) {
    const page = m[2] ? pageNommee(m[2]) : undefined;
    if (!m[2] || page) return { kind: 'chercher', requete: m[1].trim(), page };
  }

  // Aller à un champ (résolu ensuite contre l'écran)
  m = n.match(/^(?:aller|va|vas|passe|passer|retour|retourne|reviens|revenir|champ|focus)(?: sur| au| aux| a| dans| en)?(?: le| la| l| les)? (.+)$/);
  if (m) return { kind: 'allerChamp', nom: m[1].trim() };

  // Clic sur un bouton de l'écran
  m = n.match(/^(?:clique|cliquer|clic|appuie|appuyer|bouton|coche|cocher|decoche|decocher|selectionne|selectionner|choisis|choisir)(?: sur)?(?: le| la| l| les)? (.+)$/);
  if (m) return { kind: 'clic', cible: m[1].trim() };

  return null;
}

// ── Champs de l'écran ───────────────────────────────────────────────────

/** Les noms sous lesquels un champ peut être appelé, tirés de son libellé. */
export function nomsDeLibelle(libelle: string): string[] {
  const brut = libelle.replace(/[*:]/g, ' ').trim();
  const noms = new Set<string>();
  const ajouter = (t: string) => { const k = cle(sansArticles(t)); if (k.length >= 2) noms.add(k); };
  ajouter(brut);
  for (const part of brut.split(/[/(),·|]+/)) ajouter(part);
  ajouter(brut.replace(/\(.*?\)/g, ''));
  ajouter(brut.replace(/\.{2,}|…/g, ''));
  return [...noms];
}

/**
 * Le champ que nomme le début de `phrase`, parmi des libellés d'écran.
 * Le libellé le plus long l'emporte (« date réalisée » avant « date »).
 * `reste` = ce qui suit le nom (« demain » dans « date planifiée demain »).
 */
export function champNomme(phrase: string, libelles: string[]): { index: number; reste: string } | null {
  const sans = sansArticles(normaliser(phrase));
  const k = cle(sans);
  if (!k) return null;
  /* Le reste se prend dans la phrase NON réduite au singulier : « 15 mars »
     ne doit pas devenir « 15 mar ». `cle` garde le nombre de mots. */
  const mots = sans.split(' ');
  let meilleur: { index: number; reste: string; long: number } | null = null;
  for (let index = 0; index < libelles.length; index++) {
    for (const nom of nomsDeLibelle(libelles[index])) {
      if ((k === nom || k.startsWith(nom + ' ')) && (!meilleur || nom.length > meilleur.long)) {
        meilleur = { index, reste: mots.slice(nom.split(' ').length).join(' '), long: nom.length };
      }
    }
  }
  if (meilleur) return { index: meilleur.index, reste: meilleur.reste };
  // « aller à la date » : un nom qui COMMENCE par la saisie, s'il est unique.
  const candidats = libelles
    .map((lib, index) => ({ index, ok: nomsDeLibelle(lib).some(nom => nom.startsWith(k + ' ')) }))
    .filter(c => c.ok);
  return candidats.length === 1 ? { index: candidats[0].index, reste: '' } : null;
}

/** Vrai si `texte` désigne l'option `option` (bouton, <option>). */
export function correspond(texte: string, option: string): boolean {
  const a = cle(sansArticles(texte));
  const b = cle(option.replace(/[^\p{L}\p{N}\s'’/-]/gu, ' '));
  if (!a || !b) return false;
  return a === b || b.split(' ').includes(a) || (a.length >= 3 && b.includes(a));
}

/**
 * Les options que `texte` désigne : l'égalité seule si elle existe, sinon
 * toutes celles qui contiennent le texte. Plusieurs = ambigu, à l'écran de
 * trancher — on ne choisit pas un client au hasard parmi trois Dupont.
 */
export function optionsDesignees(texte: string, options: string[]): number[] {
  const a = cle(sansArticles(texte));
  if (!a) return [];
  const exactes = options.map((o, i) => (cle(o) === a ? i : -1)).filter(i => i >= 0);
  if (exactes.length) return exactes;
  return options.map((o, i) => (correspond(texte, o) ? i : -1)).filter(i => i >= 0);
}

/**
 * Ce qui suit, dans la phrase ORIGINALE (accents, majuscules), les `n`
 * premiers mots normalisés. « Titre Réunion à Pantin » → « Réunion à Pantin ».
 */
export function resteOriginal(phrase: string, n: number): string {
  const jetons = phrase.trim().split(/\s+/);
  let compte = 0;
  let i = 0;
  while (i < jetons.length && compte < n) {
    compte += normaliser(jetons[i]).split(' ').filter(Boolean).length;
    i++;
  }
  return jetons.slice(i).join(' ');
}

// ── Dictée ──────────────────────────────────────────────────────────────

/** Ponctuation dite : « virgule », « à la ligne »… Le mot « point » seul reste un mot. */
export function ponctuer(texte: string): string {
  return texte
    .replace(/\s*(?:^|\s)(?:à|a) la ligne(?=\s|$)\s*/gi, '\n')
    .replace(/\s*(?:^|\s)nouveau paragraphe(?=\s|$)\s*/gi, '\n\n')
    .replace(/\s+virgule(?=\s|$)/gi, ',')
    .replace(/\s+point d'interrogation(?=\s|$)/gi, ' ?')
    .replace(/\s+point d'exclamation(?=\s|$)/gi, ' !')
    .replace(/\s+point final(?=\s|$)/gi, '.')
    .replace(/\s+deux points(?=\s|$)/gi, ' :')
    .replace(/[ \t]+\n/g, '\n');
}

/**
 * Le texte à insérer après `avant` (ce qui précède le curseur) : espace de
 * liaison, majuscule en début de phrase.
 */
export function texteAInserer(avant: string, dicte: string): string {
  let t = ponctuer(dicte.trim());
  if (!t) return '';
  const debutPhrase = avant.trim() === '' || /[.!?]\s*$/.test(avant) || /\n\s*$/.test(avant);
  const maj = (_m: string, sep: string, l: string) => sep + l.toUpperCase();
  if (debutPhrase) t = t.replace(/^(\s*)(\p{Ll})/u, maj);
  // Après « à la ligne » ou « point final » dits dans la phrase même.
  t = t.replace(/([.!?]\s+|\n\s*)(\p{Ll})/gu, maj);
  const colle = avant === '' || /\s$/.test(avant) || /^[,.:;!?\n]/.test(t);
  return colle ? t : ' ' + t;
}

// ── Dates ───────────────────────────────────────────────────────────────

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function iso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function plusJours(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}
function dateValide(a: number, m: number, j: number): Date | null {
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j ? d : null;
}

/** Une date dite, en AAAA-MM-JJ. `null` si elle ne se lit pas. */
export function dateParlee(texte: string, aujourdhui = new Date()): string | null {
  // Pas `sansArticles` : il retirerait le « dans » de « dans 2 semaines ».
  const n = normaliser(texte)
    .replace(/\b1er\b/g, '1').replace(/\bpremier\b/g, '1')
    .replace(/^(?:(?:le|la|l|au|pour|a partir du)\s+)+/, '');
  const auj = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  if (!n) return null;
  if (/^(?:aujourd hui|ce jour)$/.test(n)) return iso(auj);
  if (n === 'demain') return iso(plusJours(auj, 1));
  if (n === 'apres demain') return iso(plusJours(auj, 2));
  if (n === 'hier') return iso(plusJours(auj, -1));
  if (n === 'avant hier') return iso(plusJours(auj, -2));
  let m = n.match(/^dans (\d+) (jours?|semaines?|mois)$/);
  if (m) {
    const k = Number(m[1]);
    if (m[2].startsWith('jour')) return iso(plusJours(auj, k));
    if (m[2].startsWith('semaine')) return iso(plusJours(auj, 7 * k));
    const d = new Date(auj.getFullYear(), auj.getMonth() + k, auj.getDate());
    return d.getDate() === auj.getDate() ? iso(d) : null;
  }
  if (/^(?:dans )?(?:une|1) semaine$|^la semaine prochaine$/.test(n)) return iso(plusJours(auj, 7));
  m = n.match(/^(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?: prochain)?$/);
  if (m) {
    const cible = JOURS.indexOf(m[1]);
    const ecart = ((cible - auj.getDay()) + 7) % 7 || 7;
    return iso(plusJours(auj, ecart));
  }
  // 15/10/2026, 15 10 2026, 15 10
  m = n.match(/^(\d{1,2})[\s/.](\d{1,2})(?:[\s/.](\d{2,4}))?$/);
  if (m) {
    const a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : auj.getFullYear();
    const d = dateValide(a, Number(m[2]), Number(m[1]));
    return d ? iso(d) : null;
  }
  // 15 octobre [2026]
  m = n.match(/^(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/);
  if (m && MOIS[m[2]]) {
    const d = dateValide(m[3] ? Number(m[3]) : auj.getFullYear(), MOIS[m[2]], Number(m[1]));
    return d ? iso(d) : null;
  }
  // « le 20 » : ce mois-ci, ou le suivant si le jour est passé
  m = n.match(/^(\d{1,2})$/);
  if (m) {
    const j = Number(m[1]);
    let d = dateValide(auj.getFullYear(), auj.getMonth() + 1, j);
    if (d && d < auj) {
      const suivant = new Date(auj.getFullYear(), auj.getMonth() + 1, 1);
      d = dateValide(suivant.getFullYear(), suivant.getMonth() + 1, j);
    }
    return d ? iso(d) : null;
  }
  return null;
}

/** Un nombre dit (« 12,5 », « 3 »). `null` s'il n'y en a pas. */
export function nombreParle(texte: string): number | null {
  const m = texte.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
}

// ── Recherches ──────────────────────────────────────────────────────────

/**
 * Variantes d'une référence dictée. La reconnaissance écrit « KC 1 » ou
 * « k c 1 » là où le catalogue porte KC1 : on essaie la saisie telle quelle,
 * puis les lettres isolées et les chiffres recollés.
 */
export function variantesReference(texte: string): string[] {
  const base = normaliser(texte);
  const mots = base.split(' ').filter(Boolean);
  // lettres isolées consécutives : « k c » → « kc »
  const lettres: string[] = [];
  for (const m of mots) {
    const prev = lettres[lettres.length - 1];
    if (m.length === 1 && /[a-z]/.test(m) && prev && /^[a-z]+$/.test(prev) && prev.length <= 3) lettres[lettres.length - 1] = prev + m;
    else lettres.push(m);
  }
  // lettres courtes + nombre : « kc 1 » → « kc1 », « a 13 a » → « a13a »
  const recolle: string[] = [];
  for (const m of lettres) {
    const prev = recolle[recolle.length - 1];
    if (prev && ((/^[a-z]{1,3}$/.test(prev) && /^\d/.test(m)) || (/^[a-z]{1,3}\d+$/.test(prev) && /^[a-z]$/.test(m)))) {
      recolle[recolle.length - 1] = prev + m;
    } else recolle.push(m);
  }
  const v = recolle.join(' ');
  return v === base ? [base] : [base, v];
}

export interface DevisCherche {
  id: string;
  numero: string;
  client: string;
  referenceAffaire?: string;
  chantier?: string;
  dateCreation: string;
}

const MOTS_VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'pour', 'chez', 'client', 'numero', 'n', 'a', 'au', 'aux', 'l', 'd', 'un', 'une']);

/**
 * Les devis que désigne une phrase : par numéro (« 112 », « 2026 112 »,
 * « DEV-2026-112 »), sinon par client, référence d'affaire ou chantier —
 * tous les mots doivent s'y trouver. Les plus récents d'abord.
 */
export function chercherDevis<T extends DevisCherche>(devis: T[], requete: string, limite = 8): T[] {
  const n = normaliser(requete).replace(/^(?:dev|devis)\s+/, '');
  const mots = n.split(' ').filter(m => m && !MOTS_VIDES.has(m));
  if (!mots.length) return [];
  const nombres = mots.filter(m => /^\d+$/.test(m));
  const tri = (a: T, b: T) => (b.dateCreation || '').localeCompare(a.dateCreation || '');

  if (nombres.length && nombres.length === mots.filter(m => m !== 'dev').length) {
    const dernier = Number(nombres[nombres.length - 1]);
    const annee = nombres.length > 1 ? nombres[0] : undefined;
    const parNumero = devis.filter(d => {
      const segs = d.numero.split(/\D+/).filter(Boolean);
      if (!segs.length || Number(segs[segs.length - 1]) !== dernier) return false;
      return !annee || segs.includes(annee);
    });
    if (parNumero.length) return parNumero.sort(tri).slice(0, limite);
  }

  return devis
    .filter(d => {
      const tout = normaliser(`${d.numero} ${d.client} ${d.referenceAffaire ?? ''} ${d.chantier ?? ''}`);
      return mots.every(m => tout.includes(m));
    })
    .sort(tri)
    .slice(0, limite);
}

// ── Apprentissage ───────────────────────────────────────────────────────

/* Une phrase que l'assistant ne comprend pas peut lui être APPRISE : il
 * propose, on répond « oui », on fait l'action à la souris, on dit
 * « terminé », il relit ce qu'il a vu et ne retient qu'après un second
 * « oui ». Une commande apprise est une suite de clics sur des boutons
 * reconnus par leur TEXTE (jamais par leur position : l'écran bouge).
 * Elle passe avant tout le reste — c'est l'utilisateur qui l'a voulue. */

export interface EtapeApprise {
  /** Texte du bouton cliqué, tel qu'affiché (« Ligne », « Envoyer »). */
  libelle: string;
  /** Le clic avait lieu dans une fenêtre (dialogue) ? */
  dansFenetre: boolean;
}

export interface CommandeApprise {
  /** Phrase normalisée, clé de comparaison. */
  cle: string;
  /** Phrase telle qu'elle a été dite. */
  dite: string;
  etapes: EtapeApprise[];
  /** Page où elle a été apprise (pour dire où la rejouer). */
  page: string;
  creeLe: string;
}

export const cleDePhrase = (phrase: string) => sansArticles(normaliser(phrase));

export function commandeApprise(phrase: string, apprises: CommandeApprise[]): CommandeApprise | undefined {
  const k = cleDePhrase(phrase);
  return k ? apprises.find(c => c.cle === k) : undefined;
}

/** « oui », « non », « terminé » — les réponses pendant un apprentissage. */
export function reponse(phrase: string): 'oui' | 'non' | 'termine' | null {
  const n = normaliser(phrase);
  if (/^(?:oui|ouais|ok|okay|d accord|daccord|vas y|oui vas y|exact|exactement|c est ca|oui c est ca|bien sur|parfait|oui merci|valide|valider|enregistre|enregistrer|confirme|confirmer)$/.test(n)) return 'oui';
  if (/^(?:non|non merci|pas du tout|laisse tomber|annule|annuler|non annule|surtout pas|abandonne|abandonner)$/.test(n)) return 'non';
  if (/^(?:termine|terminer|terminee|c est fait|c est bon|fini|j ai fini|j ai termine|voila|c est tout|fin)$/.test(n)) return 'termine';
  return null;
}

/** Phrase lue à voix haute pour un stock. Ne dit que ce qui est connu. */
export function phraseStock(designation: string, s: { stock: number; reserve: number; stockOdoo?: number }): string {
  const dispo = s.stock - s.reserve;
  let t = `${designation} : ${dispo} disponible${Math.abs(dispo) > 1 ? 's' : ''}`;
  if (s.reserve > 0) t += `, sur ${s.stock} en stock dont ${s.reserve} réservé${s.reserve > 1 ? 's' : ''}`;
  if (s.stockOdoo !== undefined) t += `. Odoo : ${s.stockOdoo}`;
  return t + '.';
}
