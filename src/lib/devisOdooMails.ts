/**
 * Une demande de devis a-t-elle déjà son devis dans Odoo ?
 *
 * L'Agent mail ne doit montrer que ce qui reste à faire. La macro Outlook sort
 * les mails répondus, supprimés ou classés (`ExporterMailsNonLus.bas`) ; mais
 * un devis se fait souvent dans Odoo et part de là, sans réponse dans Outlook.
 * On lit donc les devis Odoo de la société qui a écrit (fonction
 * `odoo-devis-mails`, en lecture seule) et on les compare à la demande.
 *
 * ⚠️ **ÊTRE LE MÊME CLIENT NE SUFFIT PAS.** Un applicateur demande plusieurs
 * chiffrages par semaine : un devis postérieur peut répondre à un autre mail.
 * D'où deux certitudes, selon la règle de la maison (on ne devine pas) :
 *  - `sur` : même société, créé APRÈS le mail, ET une preuve — un mot du
 *    chantier ou de l'objet dans le chantier / la référence du devis, ou au
 *    moins la moitié des demandes retrouvées dans ses lignes. Le mail passe en
 *    « Déjà réalisés », où il reste visible et se conteste d'un clic ;
 *  - `possible` : même société, créé après le mail, sans preuve. Le mail reste
 *    à traiter et le devis est proposé : l'utilisateur tranche.
 *
 * Seule une `demande_devis` se rapproche : une relance sur un devis existant
 * n'est pas satisfaite par ce devis.
 *
 * ⚠️ Dans un mot de ligne, « C1 », « M2 », « 20KG » ne prouvent rien : tous les
 * panneaux sont en C1. Les mots génériques (`GENERIQUES`) non plus.
 */

import { supabase } from '@/integrations/supabase/client';
import { mailTransfere, type MailAgent, type TriMail } from './agentMail';
import { societeDepuisEmail } from './chiffrage';

export interface DevisOdooLu {
  numero: string;
  societeId: number;
  societe: string;
  /** ISO 8601. */
  creeLe: string;
  etat: string;
  refClient?: string;
  chantier?: string;
  contact?: string;
  montantHT: number;
  vendeur?: string;
  lien?: string;
  lignes: string[];
}

export interface ReponseDevisOdoo {
  parEmail: Record<string, number[]>;
  parDomaine: Record<string, number[]>;
  devis: DevisOdooLu[];
  /** Plus de devis que la fonction n'en rend : les plus anciens manquent. */
  tronque?: boolean;
}

export interface AdressesMail {
  emails: string[];
  domaines: string[];
}

export interface RapprochementOdoo {
  devis: DevisOdooLu;
  certitude: 'sur' | 'possible';
  /** Ce qui fonde le rapprochement, pour l'écran : « chantier VELIZY ». */
  preuves: string[];
  /** Autres devis candidats, au même titre ou moins bien. */
  autres: number;
}

export const ETAT_DEVIS_ODOO: Record<string, string> = {
  draft: 'devis', sent: 'devis envoyé', sale: 'commande', done: 'commande',
};

/** Au-delà, un devis ne répond plus à cette demande. */
const DELAI_MAX_JOURS = 60;

const DOMAINE_INTERNE = /@(isofloor|isosign|so-signal|sti-fr)\./i;

/**
 * Les adresses à chercher chez Odoo : l'expéditeur, ou — mail interne, un
 * collègue qui transfère — celui d'origine, plus celles de la fiche client.
 */
export function adressesDuMail(
  m: Pick<MailAgent, 'deEmail' | 'corps' | 'sujet'>,
  fiche?: { email?: string; contacts?: { email?: string }[] },
): AdressesMail {
  const propre = (e?: string) => String(e || '').trim().toLowerCase();
  let origine = propre(m.deEmail);
  if (!origine || DOMAINE_INTERNE.test(origine)) origine = propre(mailTransfere(m.corps, m.sujet).deEmail);
  const candidates = [origine, propre(fiche?.email), ...(fiche?.contacts || []).map(c => propre(c.email))]
    .filter(e => e.includes('@') && !DOMAINE_INTERNE.test(e));
  const emails = [...new Set(candidates)];
  /* Pas de domaine grand public : gmail.com ne désigne personne. */
  const domaines = [...new Set(emails.filter(e => societeDepuisEmail(e)).map(e => e.split('@')[1]))];
  return { emails, domaines };
}

const mots = (s: unknown): string[] =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .split(/[^A-Z0-9]+/).filter(Boolean);

const GENERIQUES = new Set([
  'BONJOUR', 'DEVIS', 'DEMANDE', 'DEMANDES', 'CHIFFRAGE', 'OFFRE', 'TARIF', 'TARIFS', 'POUR', 'AVEC', 'SANS', 'DANS',
  'FOURNITURE', 'FOURNIR', 'FOURNITURES', 'PANNEAU', 'PANNEAUX', 'PEINTURE', 'RESINE', 'RESINES', 'SIGNALISATION',
  'CHANTIER', 'CHANTIERS', 'COULEUR', 'COUCHE', 'COUCHES', 'FINITION', 'MARCHE', 'TRAVAUX', 'REALISATION', 'ROUTE',
  'ROUTIERE', 'LIVRAISON', 'QUANTITE', 'TRANSPORT', 'SUPPORT', 'SUPPORTS', 'FIXATION', 'FIXATIONS', 'BRUT', 'ISOSIGN',
  'ISOFLOOR', 'ISOMARK', 'MOBILIER', 'SIGNAL', 'CLASSE', 'ARTICLE', 'ARTICLES', 'REPONSE', 'SOCIETE', 'AGENCE',
  'PRIX', 'SUITE', 'ACCORD', 'COMMANDE', 'CENTRE', 'MARQUAGE', 'REFERENCE', 'AFFAIRE', 'PROJET', 'DOSSIER',
]);

/** « J11 », « A13A » : un code d'article. Ni une classe, ni une unité. */
function estCode(m: string): boolean {
  return /[A-Z]/.test(m) && /\d/.test(m)
    && !/^\d+(KG|G|L|M|M2|M3|ML|MM|CM|U|H|J)$/.test(m)
    && !/^(M2|M3|C[123]|H[12]|R[0-4]|A[345]|P\d{2}|RAL\d*|L\d{3,4})$/.test(m);
}

const motParlant = (m: string) => m.length >= 5 && /^[A-Z]+$/.test(m) && !GENERIQUES.has(m);

/** Ce qu'une demande a de commun avec les lignes du devis. */
function communsDemande(demande: string, lignes: Set<string>) {
  const propres = [...new Set(mots(demande))].filter(m => lignes.has(m));
  return { codes: propres.filter(estCode), parlants: propres.filter(motParlant) };
}

function preuvesDuDevis(mail: { sujet: string; tri?: TriMail }, d: DevisOdooLu): string[] {
  const preuves: string[] = [];

  /* Le nom du client n'est pas une preuve : il figure souvent dans la référence. */
  const client = new Set(mots(d.societe));
  const cible = new Set([...mots(d.chantier), ...mots(d.refClient)]);
  const lieu = [...new Set([...mots(mail.tri?.chantier), ...mots(mail.sujet)])]
    .filter(m => m.length >= 4 && /^[A-Z]+$/.test(m) && !GENERIQUES.has(m) && !client.has(m) && cible.has(m));
  if (lieu.length) preuves.push(`chantier ${lieu.slice(0, 2).join(' ')}`);

  const demandes = mail.tri?.demandes || [];
  if (demandes.length) {
    const lignes = new Set(d.lignes.flatMap(mots));
    const communs = demandes.map(x => communsDemande(x, lignes));
    const retrouvees = communs.filter(c => c.codes.length || c.parlants.length);
    const codes = [...new Set(communs.flatMap(c => c.codes))];
    const parlants = [...new Set(communs.flatMap(c => c.parlants))];
    if (retrouvees.length * 2 >= demandes.length && (codes.length || parlants.length >= 2)) {
      preuves.push(`articles ${[...codes, ...parlants].slice(0, 3).join(', ')}`);
    }
  }
  return preuves;
}

/**
 * Le devis Odoo qui répond à ce mail, s'il y en a un. `refuse` : un devis que
 * l'utilisateur a écarté pour ce mail ne revient pas.
 */
export function rapprocherMail(
  mail: { recuLe: string; sujet: string; tri?: TriMail },
  adresses: AdressesMail,
  odoo: ReponseDevisOdoo,
  refuse: (numero: string) => boolean = () => false,
): RapprochementOdoo | null {
  if (mail.tri?.categorie !== 'demande_devis') return null;
  const societes = new Set([
    ...adresses.emails.flatMap(e => odoo.parEmail[e] || []),
    ...adresses.domaines.flatMap(d => odoo.parDomaine[d] || []),
  ]);
  if (!societes.size) return null;

  const recu = Date.parse(mail.recuLe);
  if (isNaN(recu)) return null;
  const candidats = odoo.devis
    .filter(d => societes.has(d.societeId) && !refuse(d.numero))
    .filter(d => {
      const cree = Date.parse(d.creeLe);
      return cree >= recu && cree - recu <= DELAI_MAX_JOURS * 86_400_000;
    })
    .map(devis => ({ devis, preuves: preuvesDuDevis(mail, devis) }))
    /* Le mieux prouvé, puis le premier fait après le mail. */
    .sort((a, b) => b.preuves.length - a.preuves.length || a.devis.creeLe.localeCompare(b.devis.creeLe));

  const meilleur = candidats[0];
  if (!meilleur) return null;
  return {
    devis: meilleur.devis,
    certitude: meilleur.preuves.length ? 'sur' : 'possible',
    preuves: meilleur.preuves,
    autres: candidats.length - 1,
  };
}

export async function lireDevisOdoo(args: AdressesMail & { depuis: string }): Promise<ReponseDevisOdoo> {
  const { data, error } = await supabase.functions.invoke('odoo-devis-mails', { body: args });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  return {
    parEmail: data?.parEmail || {},
    parDomaine: data?.parDomaine || {},
    devis: data?.devis || [],
    tronque: !!data?.tronque,
  };
}
