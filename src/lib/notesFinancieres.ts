/**
 * Notes financières d'une entreprise cliente — API « Recherche d'entreprises »
 * de data.gouv.fr (recherche-entreprises.api.gouv.fr, gratuite, sans clé).
 *
 * Deux étages, séparés exprès :
 *   1. `lireEntreprise` / `chercherEntreprise` : lit la réponse de l'API et la
 *      ramène à `EntrepriseFinance` (aucun calcul) ;
 *   2. `calculerNote` : une note /100 et une lettre A-D, à partir de critères
 *      qui s'affichent un par un.
 *
 * ⚠️ Règle de la maison : on n'invente jamais une donnée. Un critère dont la
 * donnée manque (comptes non publiés, effectif inconnu) est « à vérifier » :
 * il sort du calcul et la note est annoncée PARTIELLE. Une absence de bilan
 * n'est jamais prise pour un mauvais bilan.
 *
 * ⚠️ Ce n'est pas une cotation de crédit. L'API ne dit rien des procédures
 * collectives (BODACC), des incidents de paiement ni des garanties : la note
 * se lit avec ces vérifications-là, et l'écran renvoie vers la fiche de
 * l'Annuaire des entreprises, qui les affiche.
 */

export interface FinanceAnnee {
  annee: number;
  /** Chiffre d'affaires, € — absent si l'entreprise ne le publie pas. */
  ca?: number;
  /** Résultat net, € — absent si non publié. */
  resultatNet?: number;
}

export interface EntrepriseFinance {
  siren: string;
  nom: string;
  active: boolean;
  /** ISO `YYYY-MM-DD` (date de création de l'entreprise). */
  dateCreation?: string;
  /** Code INSEE de tranche d'effectif (« 11 », « 21 »…) ; absent ou « NN » = inconnu. */
  trancheEffectif?: string;
  formeJuridique?: string;
  /** Du plus ancien au plus récent. Vide = aucun compte publié. */
  finances: FinanceAnnee[];
}

export type LettreNote = 'A' | 'B' | 'C' | 'D';

export interface CritereNote {
  cle: 'anciennete' | 'effectif' | 'resultat' | 'tendance' | 'fraicheur';
  libelle: string;
  /** `null` = donnée absente : critère « à vérifier », hors du calcul. */
  points: number | null;
  max: number;
  detail: string;
}

export interface NoteEntreprise {
  /** 0-100, calculée sur les seuls critères évaluables. */
  note: number;
  lettre: LettreNote;
  /** Vrai si au moins un critère n'a pu être évalué. */
  partielle: boolean;
  criteres: CritereNote[];
  alertes: string[];
}

const API = 'https://recherche-entreprises.api.gouv.fr/search';

/** Neuf premiers chiffres d'un SIRET ou d'un SIREN ; `null` si ce n'en est pas un. */
export function sirenDe(siretOuSiren: string | undefined | null): string | null {
  const chiffres = (siretOuSiren || '').replace(/\D/g, '');
  return chiffres.length >= 9 ? chiffres.slice(0, 9) : null;
}

function nombre(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Ramène une réponse de l'API (`{ results: [...] }`) à l'entreprise du SIREN
 * demandé. La recherche est « plein texte » : on exige l'égalité du SIREN
 * plutôt que de prendre le premier résultat.
 */
export function lireEntreprise(json: unknown, siren: string): EntrepriseFinance | null {
  const results = (json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return null;
  const r = results.find(x => (x as { siren?: string })?.siren === siren) as Record<string, unknown> | undefined;
  if (!r) return null;

  const brut = r.finances;
  const finances: FinanceAnnee[] = [];
  if (brut && typeof brut === 'object') {
    for (const [annee, valeurs] of Object.entries(brut as Record<string, Record<string, unknown>>)) {
      const a = Number(annee);
      if (!Number.isInteger(a) || !valeurs || typeof valeurs !== 'object') continue;
      const ca = nombre(valeurs.ca);
      const resultatNet = nombre(valeurs.resultat_net);
      if (ca === undefined && resultatNet === undefined) continue;
      finances.push({ annee: a, ...(ca !== undefined ? { ca } : {}), ...(resultatNet !== undefined ? { resultatNet } : {}) });
    }
    finances.sort((x, y) => x.annee - y.annee);
  }

  const eff = typeof r.tranche_effectif_salarie === 'string' ? r.tranche_effectif_salarie : undefined;
  return {
    siren,
    nom: String(r.nom_complet ?? r.nom_raison_sociale ?? siren),
    active: r.etat_administratif === 'A',
    dateCreation: typeof r.date_creation === 'string' ? r.date_creation : undefined,
    trancheEffectif: eff && eff !== 'NN' ? eff : undefined,
    formeJuridique: typeof r.libelle_nature_juridique === 'string' ? r.libelle_nature_juridique : undefined,
    finances,
  };
}

/** Interroge l'API pour un SIREN. Lève une `Error` au message lisible en cas d'échec réseau ou HTTP. */
export async function chercherEntreprise(siren: string, appel: typeof fetch = fetch): Promise<EntrepriseFinance | null> {
  const res = await appel(`${API}?q=${encodeURIComponent(siren)}&per_page=5`);
  if (!res.ok) {
    throw new Error(res.status === 429
      ? 'Trop de requêtes vers l’API entreprises : réessayez dans une minute.'
      : `L’API entreprises a répondu ${res.status}.`);
  }
  return lireEntreprise(await res.json(), siren);
}

export function lienAnnuaire(siren: string): string {
  return `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`;
}

/**
 * Fiches de l'entreprise chez les trois sites de référence. Ni Pappers
 * (API payante, clé), ni Societe.com, ni Infogreffe n'offrent de lecture
 * gratuite de leur note : on ouvre leur fiche par le SIREN, la note se lit là.
 */
export function liensSources(siren: string): { cle: 'annuaire' | 'pappers' | 'societe' | 'infogreffe'; libelle: string; url: string }[] {
  return [
    { cle: 'annuaire', libelle: 'Annuaire (BODACC)', url: lienAnnuaire(siren) },
    { cle: 'pappers', libelle: 'Pappers', url: `https://www.pappers.fr/entreprise/${siren}` },
    { cle: 'societe', libelle: 'Societe.com', url: `https://www.societe.com/cgi-bin/search?champs=${siren}` },
    { cle: 'infogreffe', libelle: 'Infogreffe', url: `https://www.infogreffe.fr/entreprise-societe/${siren}` },
  ];
}

// ───────────────────────── Note ─────────────────────────

const MAX = { anciennete: 25, effectif: 15, resultat: 30, tendance: 20, fraicheur: 10 } as const;

const EFFECTIF_POINTS: Record<string, number> = {
  '00': 3, '01': 6, '02': 6, '03': 6, '11': 9, '12': 9, '21': 12, '22': 12,
  '31': 15, '32': 15, '41': 15, '42': 15, '51': 15, '52': 15, '53': 15,
};

export function lettreDeNote(note: number): LettreNote {
  if (note >= 75) return 'A';
  if (note >= 55) return 'B';
  if (note >= 35) return 'C';
  return 'D';
}

function euros(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function critereAnciennete(e: EntrepriseFinance, maintenant: Date): CritereNote {
  const base = { cle: 'anciennete' as const, libelle: 'Ancienneté', max: MAX.anciennete };
  if (!e.dateCreation) return { ...base, points: null, detail: 'Date de création inconnue — à vérifier.' };
  const ans = (maintenant.getTime() - new Date(e.dateCreation).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (!Number.isFinite(ans)) return { ...base, points: null, detail: 'Date de création illisible — à vérifier.' };
  const points = ans >= 10 ? 25 : ans >= 5 ? 18 : ans >= 3 ? 12 : ans >= 1 ? 6 : 2;
  return { ...base, points, detail: `Créée il y a ${ans < 1 ? 'moins d’un an' : `${Math.floor(ans)} ans`}.` };
}

function critereEffectif(e: EntrepriseFinance): CritereNote {
  const base = { cle: 'effectif' as const, libelle: 'Effectif', max: MAX.effectif };
  const pts = e.trancheEffectif ? EFFECTIF_POINTS[e.trancheEffectif] : undefined;
  if (pts === undefined) return { ...base, points: null, detail: 'Effectif non renseigné — à vérifier.' };
  return { ...base, points: pts, detail: `Tranche d’effectif INSEE ${e.trancheEffectif}.` };
}

function critereResultat(e: EntrepriseFinance): CritereNote {
  const base = { cle: 'resultat' as const, libelle: 'Résultat net', max: MAX.resultat };
  const dernier = [...e.finances].reverse().find(f => f.resultatNet !== undefined);
  if (!dernier || dernier.resultatNet === undefined) {
    return { ...base, points: null, detail: 'Comptes non publiés (confidentiels ou non déposés) — à vérifier.' };
  }
  const r = dernier.resultatNet;
  const ca = dernier.ca;
  const marge = ca && ca > 0 ? r / ca : undefined;
  let points: number;
  if (r > 0) points = marge !== undefined && marge >= 0.05 ? 30 : 24;
  else if (r === 0) points = 12;
  else if (marge !== undefined && marge >= -0.1) points = 8;
  else points = marge === undefined ? 4 : 0;
  const detail = `${euros(r)} en ${dernier.annee}${marge !== undefined ? ` (${(marge * 100).toFixed(1).replace('.', ',')} % du CA)` : ''}.`;
  return { ...base, points, detail };
}

function critereTendance(e: EntrepriseFinance): CritereNote {
  const base = { cle: 'tendance' as const, libelle: 'Tendance du CA', max: MAX.tendance };
  const avecCa = e.finances.filter(f => f.ca !== undefined && f.ca > 0);
  if (avecCa.length < 2) return { ...base, points: null, detail: 'Moins de deux exercices avec CA publié — à vérifier.' };
  const [avant, dernier] = avecCa.slice(-2);
  const evol = (dernier.ca! - avant.ca!) / avant.ca!;
  const points = evol >= 0.05 ? 20 : evol >= -0.05 ? 14 : evol >= -0.2 ? 7 : 0;
  const pct = `${evol >= 0 ? '+' : ''}${(evol * 100).toFixed(1).replace('.', ',')} %`;
  return { ...base, points, detail: `${pct} entre ${avant.annee} et ${dernier.annee} (${euros(avant.ca!)} → ${euros(dernier.ca!)}).` };
}

function critereFraicheur(e: EntrepriseFinance, maintenant: Date): CritereNote {
  const base = { cle: 'fraicheur' as const, libelle: 'Fraîcheur des comptes', max: MAX.fraicheur };
  const dernier = e.finances[e.finances.length - 1];
  if (!dernier) return { ...base, points: null, detail: 'Aucun compte publié — à vérifier.' };
  const retard = maintenant.getFullYear() - dernier.annee;
  const points = retard <= 2 ? 10 : retard === 3 ? 5 : 0;
  return { ...base, points, detail: `Derniers comptes connus : exercice ${dernier.annee}.` };
}

/**
 * Note /100 : somme des points des critères évaluables, ramenée à leur maximum
 * — 40/50 évaluables donnent 80 et non 40. Une entreprise cessée vaut 0.
 */
export function calculerNote(e: EntrepriseFinance, maintenant: Date = new Date()): NoteEntreprise {
  const criteres = [
    critereAnciennete(e, maintenant),
    critereEffectif(e),
    critereResultat(e),
    critereTendance(e),
    critereFraicheur(e, maintenant),
  ];
  const evaluables = criteres.filter(c => c.points !== null);
  const partielle = evaluables.length < criteres.length;
  const alertes: string[] = [];

  if (!e.active) {
    alertes.push('Entreprise cessée ou radiée : ne pas accorder d’encours.');
    return { note: 0, lettre: 'D', partielle, criteres, alertes };
  }

  const maxEval = evaluables.reduce((s, c) => s + c.max, 0);
  const total = evaluables.reduce((s, c) => s + (c.points ?? 0), 0);
  const note = maxEval > 0 ? Math.round((total / maxEval) * 100) : 0;

  const get = (cle: CritereNote['cle']) => criteres.find(c => c.cle === cle)!;
  if (get('anciennete').points !== null && get('anciennete').points! <= 2) alertes.push('Entreprise de moins d’un an.');
  const res = [...e.finances].reverse().find(f => f.resultatNet !== undefined);
  if (res && res.resultatNet! < 0) alertes.push(`Résultat net négatif en ${res.annee}.`);
  if (get('tendance').points === 0) alertes.push('Chiffre d’affaires en baisse de plus de 20 %.');
  if (get('fraicheur').points === 0) alertes.push('Derniers comptes anciens : la situation actuelle peut avoir changé.');
  if (e.finances.length === 0) alertes.push('Aucun compte publié : demander un bilan ou une garantie si l’encours est important.');
  if (evaluables.length < 3) alertes.push('Note très partielle : moins de trois critères évaluables.');

  return { note, lettre: lettreDeNote(note), partielle, criteres, alertes };
}
