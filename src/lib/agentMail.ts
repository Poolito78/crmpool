/**
 * L'Agent mail : trier les mails non lus, repérer les demandes de devis.
 *
 * La lecture de la boîte vit dans `microsoftGraph.ts` ; ici, ce qui se teste
 * sans réseau — le texte envoyé au modèle, la lecture de sa réponse, et le
 * rapprochement de l'expéditeur avec le fichier clients.
 *
 * ⚠️ **L'AGENT NE CHIFFRE RIEN.** Il résume et classe ; « Proposer un devis »
 * télécharge le mail entier (.eml, pièces jointes comprises) et le confie à
 * l'analyse de document, qui fait déjà tout le travail — client, articles,
 * prix Odoo, systèmes. Un second chiffrage ici finirait par contredire le
 * premier.
 *
 * ⚠️ **Le client se retrouve par l'ADRESSE, jamais par ce que dit le modèle.**
 * Adresse exacte (fiche ou contact), puis même personne sous une autre adresse
 * (`clientsParPersonne`), puis domaine — et seulement si la réponse est
 * unique. Un domaine grand public (gmail, orange…) ou le nôtre ne désigne
 * personne (`societeDepuisEmail` rend alors une chaîne vide). La société citée
 * par le modèle ne sert qu'à l'affichage.
 */

import type { CorpsGemini } from './modelesIA';
import { clientsParPersonne, type ClientAvecContacts } from './rapprochementClient';
import { societeDepuisEmail } from './chiffrage';

export type CategorieMail = 'demande_devis' | 'suite_devis' | 'commande' | 'autre';

export const CATEGORIE_MAIL: Record<CategorieMail, { label: string; couleur: string }> = {
  demande_devis: { label: 'Demande de devis', couleur: 'bg-primary/10 text-primary' },
  suite_devis:   { label: 'Suite de devis',   couleur: 'bg-warning/15 text-warning' },
  commande:      { label: 'Commande',         couleur: 'bg-success/15 text-success' },
  autre:         { label: 'Autre',            couleur: 'bg-muted text-muted-foreground' },
};

export interface TriMail {
  id: string;
  categorie: CategorieMail;
  /** 0-100 : certitude du modèle que le classement est juste. */
  confiance: number;
  resume: string;
  societe?: string;
  chantier?: string;
  /** Ce qui est demandé, une entrée par article ou prestation. */
  demandes: string[];
  delai?: string;
}

export interface MailATrier {
  id: string;
  sujet: string;
  deNom: string;
  deEmail: string;
  corps: string;
  piecesJointes: string[];
}

/**
 * Le corps sans l'historique cité : seul le dernier message compte pour
 * classer, et l'historique d'un fil de dix échanges noierait le modèle.
 */
export function corpsUtile(corps: string, max = 2500): string {
  const lignes = String(corps || '').replace(/\r/g, '').split('\n');
  const coupe = lignes.findIndex(l =>
    /^\s*(De|From)\s*:\s*\S/i.test(l)
    || /^-{2,}\s*(Message d'origine|Original Message)/i.test(l)
    || /^Le .{6,80}a écrit\s*:\s*$/i.test(l)
    || /^On .{6,80}wrote\s*:\s*$/i.test(l));
  const garde = (coupe > 0 ? lignes.slice(0, coupe) : lignes).filter(l => !/^\s*>/.test(l));
  return garde.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

const CONSIGNE = `Tu tries la boîte de réception d'un commercial de signalisation routière et de résines de sol (ISOSIGN / ISOFLOOR / ISOMARK).
Pour CHAQUE mail fourni, rends un objet JSON :
- "id" : l'identifiant reçu, recopié tel quel ;
- "categorie" : "demande_devis" (un client ou prospect demande un prix, un chiffrage, une offre, une cotation, un tarif pour des articles ou un chantier),
  "suite_devis" (question, relance, modification ou réponse sur un devis déjà envoyé),
  "commande" (bon de commande, accord, commande ferme),
  "autre" (tout le reste : publicité, newsletter, interne, facture fournisseur, notification automatique…) ;
- "confiance" : 0 à 100 ;
- "resume" : 1 à 2 phrases en français, factuelles ;
- "societe" : la société qui écrit, si elle est claire (sinon omis) ;
- "chantier" : le chantier ou la ville des travaux s'ils sont cités ;
- "demandes" : liste courte de ce qui est demandé, avec quantités et dimensions telles qu'écrites (ex. "12 panneaux AB4 700", "350 m² Flowfast 319") — vide si rien ;
- "delai" : date ou délai souhaité s'il est cité.
N'invente rien : une information absente du mail est omise. Les noms de pièces jointes (plan, DCE, bordereau, DPGF…) comptent comme indices de demande de devis.
Réponds UNIQUEMENT par un tableau JSON, un objet par mail, dans l'ordre reçu.`;

export function invitationTri(mails: MailATrier[]): CorpsGemini {
  const texte = mails.map(m => [
    `### id: ${m.id}`,
    `De : ${m.deNom} <${m.deEmail}>`,
    `Objet : ${m.sujet}`,
    m.piecesJointes.length ? `Pièces jointes : ${m.piecesJointes.join(', ')}` : '',
    '',
    corpsUtile(m.corps),
  ].filter(l => l !== '').join('\n')).join('\n\n');
  return {
    systemInstruction: { parts: [{ text: CONSIGNE }] },
    contents: [{ role: 'user', parts: [{ text: texte }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  };
}

const CATEGORIES = new Set<CategorieMail>(['demande_devis', 'suite_devis', 'commande', 'autre']);

const chaine = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * La réponse du modèle, rangée par identifiant. Un mail que le modèle a sauté
 * ou mal rendu n'est PAS deviné : il reste absent, et l'écran le dit.
 */
export function lireTri(texte: string, ids: string[]): Map<string, TriMail> {
  const res = new Map<string, TriMail>();
  const json = String(texte || '').match(/\[[\s\S]*\]/);
  if (!json) return res;
  let brut: unknown;
  try { brut = JSON.parse(json[0]); } catch { return res; }
  if (!Array.isArray(brut)) return res;
  const connus = new Set(ids);
  for (const o of brut as Record<string, unknown>[]) {
    const id = chaine(o?.id);
    if (!id || !connus.has(id) || res.has(id)) continue;
    const cat = chaine(o.categorie) as CategorieMail | undefined;
    res.set(id, {
      id,
      categorie: cat && CATEGORIES.has(cat) ? cat : 'autre',
      confiance: Math.max(0, Math.min(100, Math.round(Number(o.confiance) || 0))),
      resume: chaine(o.resume) || '',
      societe: chaine(o.societe),
      chantier: chaine(o.chantier),
      demandes: Array.isArray(o.demandes) ? o.demandes.map(chaine).filter((d): d is string => !!d) : [],
      delai: chaine(o.delai),
    });
  }
  return res;
}

export interface ClientDuMail<C> {
  client?: C;
  /** Comment la fiche a été trouvée — ou pourquoi aucune n'est retenue. */
  comment: 'adresse' | 'personne' | 'domaine' | 'plusieurs' | 'inconnu';
  candidats: C[];
}

const domaine = (e?: string) => String(e || '').trim().toLowerCase().split('@')[1] || '';

export function clientDuMail<C extends ClientAvecContacts>(
  email: string,
  texte: string,
  clients: C[],
): ClientDuMail<C> {
  const e = email.trim().toLowerCase();
  if (e) {
    const exacts = clients.filter(c =>
      c.email?.trim().toLowerCase() === e
      || (c.contacts || []).some(ct => ct.email?.trim().toLowerCase() === e));
    if (exacts.length === 1) return { client: exacts[0], comment: 'adresse', candidats: exacts };
    if (exacts.length > 1) return { comment: 'plusieurs', candidats: exacts };
  }

  const personnes = clientsParPersonne(texte, e ? [e] : [], clients);
  if (personnes.length === 1) return { client: personnes[0], comment: 'personne', candidats: personnes };
  if (personnes.length > 1) return { comment: 'plusieurs', candidats: personnes };

  if (e && societeDepuisEmail(e)) {
    const d = domaine(e);
    const parDomaine = clients.filter(c =>
      domaine(c.email) === d || (c.contacts || []).some(ct => domaine(ct.email) === d));
    if (parDomaine.length === 1) return { client: parDomaine[0], comment: 'domaine', candidats: parDomaine };
    if (parDomaine.length > 1) return { comment: 'plusieurs', candidats: parDomaine };
  }
  return { comment: 'inconnu', candidats: [] };
}

/**
 * Les numéros de devis MonCRM cités dans l'objet ou le corps
 * (« DEV-2026-112 ») — une suite de devis s'ouvre alors sur le bon.
 */
export function numerosDevisCites(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of String(texte || '').matchAll(/\bDEV[-\s]?(\d{4})[-\s]?(\d{1,5})\b/gi)) {
    vus.add(`DEV-${m[1]}-${m[2]}`);
  }
  return [...vus];
}
