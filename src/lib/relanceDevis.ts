/**
 * Relance des devis envoyés.
 *
 * Un devis envoyé resté sans réponse se relance — par mail (même mécanisme
 * que l'envoi : PDF du devis joint, .eml ouvert dans Outlook) ou par
 * téléphone. Chaque relance est notée sur le devis (`Devis.relances`), au CRM
 * (action réalisée) et à l'historique ; la suivante se planifie
 * (`Devis.dateRelance`).
 *
 * ⚠️ **LE STATUT RESTE « envoyé ».** « Relancé » n'est qu'un LIBELLÉ
 * (`libelleStatutDevis`) : un statut de plus aurait sorti les devis relancés
 * de tout ce qui compte les devis en cours — pipeline CRM, tableau de bord,
 * proforma, prévisionnel — qui filtrent tous sur `'envoyé'`.
 *
 * **Échéance** (`prochaineRelance`) : la date saisie fait foi ; sans elle,
 * `DELAI_RELANCE_JOURS` après la dernière relance, ou après l'envoi (la
 * création, si l'envoi n'a pas de date). Seul un devis envoyé en a une.
 * ⚠️ **Une date de réalisation future repousse la relance** à
 * `RELANCE_AVANT_REALISATION_JOURS` (30) jours avant elle (règle du
 * 12/10/2026) : un chantier prévu en décembre ne se relance pas en juin —
 * mais un mois avant, le temps de sécuriser la commande. Seule la date
 * SAISIE passe outre.
 *
 * **Mails types** : trois de base — suivi, validité, dernière relance — dont
 * le rang de la relance choisit le défaut, plus ceux que l'utilisateur
 * enregistre (`devis_message_templates.usage = 'relance'`). Un modèle porte
 * des champs entre accolades ({contact}, {numero}…) que `remplirModele`
 * remplit ; un passage entre crochets `[ (Réf. {reference})]` disparaît
 * entier quand l'un de ses champs est vide — sans quoi un devis sans
 * référence écrirait « (Réf. ) ». `versModele` fait l'inverse : il remet les
 * accolades à la place des valeurs pour enregistrer un mail rédigé.
 */
import type { Client, Devis, RelanceDevis } from './store';

export const DELAI_RELANCE_JOURS = 7;
export const RELANCE_AVANT_REALISATION_JOURS = 30;

/** `iso` + `n` jours, en date pure (aucun fuseau ne la décale). */
export function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

type DevisRelance = Pick<Devis, 'statut' | 'relances' | 'dateRelance' | 'dateEnvoi' | 'dateCreation'> & Partial<Pick<Devis, 'dateRealisation'>>;

export function derniereRelance(d: Pick<Devis, 'relances'>): RelanceDevis | undefined {
  const r = d.relances ?? [];
  return r.length > 0 ? r[r.length - 1] : undefined;
}

/** Le devis a été relancé au moins une fois (et attend toujours sa réponse). */
export function estRelance(d: Pick<Devis, 'statut' | 'relances'>): boolean {
  return d.statut === 'envoyé' && (d.relances?.length ?? 0) > 0;
}

/**
 * Relance proposée `DELAI_RELANCE_JOURS` après `depuis`, mais jamais plus
 * d'un mois avant la date de réalisation prévue.
 */
export function relanceProposee(depuis: string, dateRealisation?: string): string {
  const apres = ajouterJours(depuis, DELAI_RELANCE_JOURS);
  if (!dateRealisation) return apres;
  const avantRealisation = ajouterJours(dateRealisation, -RELANCE_AVANT_REALISATION_JOURS);
  return avantRealisation > apres ? avantRealisation : apres;
}

/** Date de la prochaine relance (YYYY-MM-DD), ou `undefined` hors devis envoyé. */
export function prochaineRelance(d: DevisRelance): string | undefined {
  if (d.statut !== 'envoyé') return undefined;
  if (d.dateRelance) return d.dateRelance;
  const base = derniereRelance(d)?.date || d.dateEnvoi || d.dateCreation;
  return base ? relanceProposee(base, d.dateRealisation) : undefined;
}

/** La prochaine relance a été saisie à la main (et non calculée). */
export function relanceSaisie(d: Pick<Devis, 'dateRelance'>): boolean {
  return !!d.dateRelance;
}

export type EtatRelance = 'en_retard' | 'aujourdhui' | 'a_venir';

export function etatRelance(d: DevisRelance, aujourdhui: string): EtatRelance | undefined {
  const p = prochaineRelance(d);
  if (!p) return undefined;
  if (p < aujourdhui) return 'en_retard';
  if (p === aujourdhui) return 'aujourdhui';
  return 'a_venir';
}

/** Devis dont la relance est due (aujourd'hui ou en retard), le plus en retard d'abord. */
export function devisARelancer<D extends DevisRelance>(devis: D[], aujourdhui: string): D[] {
  return devis
    .filter(d => { const e = etatRelance(d, aujourdhui); return e === 'en_retard' || e === 'aujourdhui'; })
    .sort((a, b) => (prochaineRelance(a) ?? '').localeCompare(prochaineRelance(b) ?? ''));
}

const LIBELLE_STATUT: Record<Devis['statut'], string> = {
  brouillon: 'Brouillon',
  envoyé: 'Envoyé',
  accepté: 'Accepté',
  refusé: 'Refusé',
  expiré: 'Expiré',
  système: 'Système',
  archivé: 'Archivé',
};

/** Libellé affiché du statut : « Relancé » à la place d'« Envoyé » dès la première relance. */
export function libelleStatutDevis(d: Pick<Devis, 'statut' | 'relances'>): string {
  return estRelance(d) ? 'Relancé' : LIBELLE_STATUT[d.statut] ?? d.statut;
}

/** Numéros à appeler : le contact du devis d'abord, puis la fiche — sans doublon. */
export function numerosDuDevis(devis: Pick<Devis, 'contactId'>, client?: Client): Array<{ libelle: string; numero: string }> {
  const contact = devis.contactId ? (client?.contacts || []).find(ct => ct.id === devis.contactId) : undefined;
  const nomContact = contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : '';
  const nomClient = client?.societe || client?.nom || 'Client';
  const brut = [
    { libelle: `${nomContact || 'Contact'} — mobile`, numero: contact?.telephoneMobile },
    { libelle: nomContact || 'Contact', numero: contact?.telephone },
    { libelle: `${nomClient} — mobile`, numero: client?.telephoneMobile },
    { libelle: nomClient, numero: client?.telephone },
  ];
  const vus = new Set<string>();
  const out: Array<{ libelle: string; numero: string }> = [];
  for (const b of brut) {
    const n = (b.numero || '').trim();
    const cle = n.replace(/\D/g, '');
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    out.push({ libelle: b.libelle, numero: n });
  }
  return out;
}

// ── Mails types ────────────────────────────────────────────────────────────

export interface ChampsRelance {
  contact: string;
  societe: string;
  numero: string;
  reference: string;
  chantier: string;
  montant: string;
  dateEnvoi: string;
  validite: string;
}

export const LIBELLE_CHAMPS: Record<keyof ChampsRelance, string> = {
  contact: 'contact (prénom nom)',
  societe: 'société',
  numero: 'n° de devis',
  reference: 'réf. affaire',
  chantier: 'chantier',
  montant: 'montant HT',
  dateEnvoi: "date d'envoi",
  validite: 'date de validité',
};

export interface ModeleRelance {
  id: string;
  nom: string;
  contenu: string;
  /** Mail type livré avec l'application (non supprimable). */
  base?: boolean;
}

export const MODELES_RELANCE_BASE: ModeleRelance[] = [
  {
    id: 'base-1',
    nom: 'Relance 1 — suivi du devis',
    base: true,
    contenu:
`Bonjour[ {contact}],

Je reviens vers toi au sujet de notre devis {numero}[ (Réf. {reference})] d'un montant de {montant} HT[, envoyé le {dateEnvoi}].[
Chantier : {chantier}]

As-tu pu en prendre connaissance ? Je te le joins de nouveau à ce mail.
Je reste à ta disposition pour en discuter ou l'ajuster si besoin.`,
  },
  {
    id: 'base-2',
    nom: 'Relance 2 — validité du devis',
    base: true,
    contenu:
`Bonjour[ {contact}],

Je me permets de te relancer concernant notre devis {numero}[ (Réf. {reference})] d'un montant de {montant} HT[, valable jusqu'au {validite}].[
Chantier : {chantier}]

Ce projet est-il toujours d'actualité ? S'il te faut un complément d'information, une variante ou un nouveau chiffrage, n'hésite pas à me le dire.

Tu trouveras de nouveau le devis ci-joint.`,
  },
  {
    id: 'base-3',
    nom: 'Relance 3 — dernière relance',
    base: true,
    contenu:
`Bonjour[ {contact}],

Sans nouvelles de ta part concernant notre devis {numero}[ (Réf. {reference})] d'un montant de {montant} HT, je me permets une dernière relance.[
Chantier : {chantier}]

Peux-tu me dire où en est ce projet ? Si le devis n'est plus d'actualité, un simple mot me permettra de le clôturer.

Le devis est de nouveau joint à ce mail.`,
  },
];

/** Mail type proposé d'office pour la relance de rang `rang` (1 = première). */
export function modeleParDefaut(rang: number): ModeleRelance {
  const i = Math.min(Math.max(rang, 1), MODELES_RELANCE_BASE.length) - 1;
  return MODELES_RELANCE_BASE[i];
}

function formatDateFr(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function champsRelance(devis: Devis, client: Client | undefined, montant: string): ChampsRelance {
  // Même destinataire que l'envoi : le contact DU DEVIS, sinon la fiche.
  const contactDevis = devis.contactId
    ? (client?.contacts || []).find(ct => ct.id === devis.contactId)
    : undefined;
  const contact = contactDevis
    ? [contactDevis.prenom, contactDevis.nom].filter(Boolean).join(' ') || client?.nom || ''
    : client?.nom || '';
  return {
    contact: contact.trim(),
    societe: (client?.societe || '').trim(),
    numero: devis.numero,
    reference: (devis.referenceAffaire || '').trim(),
    chantier: (devis.chantier || '').trim(),
    montant,
    dateEnvoi: formatDateFr(devis.dateEnvoi),
    validite: formatDateFr(devis.dateValidite),
  };
}

const CHAMP = /\{(\w+)\}/g;

function valeurChamp(champs: ChampsRelance, nom: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(champs, nom) ? champs[nom as keyof ChampsRelance] : undefined;
}

/** Remplit un mail type. Un champ inconnu reste tel quel : il se voit à la relecture. */
export function remplirModele(modele: string, champs: ChampsRelance): string {
  const sansOptions = modele.replace(/\[([^[\]]*)\]/g, (tout, dedans: string) => {
    const noms = [...dedans.matchAll(CHAMP)].map(m => m[1]);
    if (noms.length === 0) return tout; // de vrais crochets, pas un passage facultatif
    return noms.every(n => (valeurChamp(champs, n) ?? '').trim() !== '') ? dedans : '';
  });
  return sansOptions.replace(CHAMP, (tout, nom: string) => valeurChamp(champs, nom) ?? tout);
}

/**
 * L'inverse de `remplirModele` : remet `{champ}` à la place de chaque valeur
 * du devis, pour qu'un mail rédigé serve de modèle aux suivants. Les valeurs
 * les plus longues passent d'abord (« DEV-2026-12 » ne doit pas mordre dans
 * « DEV-2026-120 ») ; une valeur de moins de trois caractères est laissée,
 * elle prendrait n'importe quel mot.
 */
export function versModele(texte: string, champs: ChampsRelance): string {
  const paires = (Object.keys(champs) as (keyof ChampsRelance)[])
    .map(k => [k, champs[k]] as const)
    .filter(([, v]) => v.trim().length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  let out = texte;
  for (const [k, v] of paires) out = out.split(v).join(`{${k}}`);
  return out;
}
