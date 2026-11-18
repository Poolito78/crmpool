/**
 * LA FICHE CLIENT MONCRM REMPLIE DEPUIS LE FICHIER ODOO — EN LECTURE.
 *
 * « Nouveau client » → Rechercher dans Odoo : on tape un nom, un prénom, une
 * société — dans n'importe quel ordre, « Jean Dupont Colas » — et `odoo-prix`
 * cherche CHAQUE MOT dans le nom, le courriel, la TVA, la ville et la société
 * mère des fiches (`rechercheClient`). La fiche cliquée est relue en entier
 * (`ficheClient`) : la SOCIÉTÉ — la mère d'un contact rattaché —, son
 * adresse, sa TVA, son SIRET, ses conditions de règlement, et les personnes
 * qui lui sont rattachées, à cocher, et ses adresses filles de FACTURATION
 * et de LIVRAISON. MonCRM n'ayant qu'une fiche, l'adresse de facturation
 * choisie devient l'adresse principale et les autres rejoignent les adresses
 * de la fiche (`adressesLivraison`). Rien n'est jamais écrit chez Odoo.
 *
 * ⚠️ ON N'INVENTE RIEN. Un champ vide chez Odoo reste vide ; un délai de
 * règlement qui ne tombe pas sur une option de MonCRM n'est pas approché ;
 * un nom de personne dont on ne distingue pas le prénom (« JEAN DUPONT »,
 * tout en capitales) part entier dans le nom. Sur une fiche déjà remplie
 * (« Compléter depuis Odoo »), Odoo ne remplit que les champs VIDES.
 *
 * Avant de créer, `clientDejaConnu` cherche la société dans MonCRM (TVA,
 * SIRET, courriel, raison sociale) : un doublon se signale, il ne se crée pas
 * en silence. L'id Odoo retenu part dans les notes (« partenaire #id ») et,
 * à l'enregistrement, dans `setOdooPartnerId` : l'envoi des devis retrouve
 * la fiche sans repasser par le nom.
 *
 * Une fonction `odoo-prix` pas encore redéployée cherche la saisie ENTIÈRE et
 * ne connaît pas `ficheClient` : la recherche repasse alors mot par mot côté
 * écran, et la fiche se remplit de la ligne cliquée, sans ses contacts.
 */
import { supabase } from '@/integrations/supabase/client';
import { normaliser } from './rapprochementClient';
import type { AdresseLivraison, Client, Contact } from './store';
import type { PartenaireOdoo } from './fournisseurOdoo';

/** Une fiche Odoo telle que la relit `ficheClient`. */
export interface FicheOdoo {
  id: number;
  nom: string;
  email: string;
  telephone: string;
  mobile: string;
  adresse: string;
  adresse2: string;
  codePostal: string;
  ville: string;
  pays: string;
  tva: string;
  siret: string;
  siteWeb: string;
  conditionsReglement: string;
  listePrix: string;
  fonction: string;
  reference: string;
  estSociete: boolean;
  type: string;
}

export interface ContactOdoo {
  id: number;
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
  mobile: string;
}

/** Une adresse fille de la société chez Odoo : facturation, livraison, autre. */
export interface AdresseOdoo {
  id: number;
  /** `invoice`, `delivery`, `other` — `societe` pour l'adresse de la société elle-même. */
  type: string;
  nom: string;
  adresse: string;
  adresse2: string;
  codePostal: string;
  ville: string;
  telephone: string;
  email: string;
}

/** La société, la fiche cliquée (la même, ou un contact), ses personnes et ses adresses. */
export interface FicheClientOdoo {
  societe: FicheOdoo;
  choisi: FicheOdoo;
  contacts: ContactOdoo[];
  /** Absent d'une fonction `odoo-prix` antérieure. */
  adresses?: AdresseOdoo[];
  /** Fonction `odoo-prix` ancienne : contacts non lus. */
  partielle?: boolean;
}

export type FormClient = Omit<Client, 'id' | 'dateCreation'>;

const motsDe = (t: string) => [...new Set(normaliser(t).split(' ').filter(m => m.length >= 2))];

/**
 * Classe les fiches : part des mots tapés retrouvés dans le nom, la société
 * mère, le courriel, la ville, la TVA. Dès qu'une fiche porte TOUS les mots,
 * seules celles-là restent — « Jean Dupont » ne doit pas noyer le bon
 * contact sous tous les Jean du fichier.
 */
export function classerPartenaires(terme: string, partenaires: PartenaireOdoo[]): PartenaireOdoo[] {
  const mots = motsDe(terme);
  if (!mots.length) return [];
  const vus = new Set<number>();
  const notes = partenaires
    .filter(p => (vus.has(p.id) ? false : (vus.add(p.id), true)))
    .map(p => {
      const porte = ` ${normaliser([p.nom, p.societeMere, p.email, p.ville, p.tva].filter(Boolean).join(' '))} `;
      const score = mots.filter(m => porte.includes(m)).length / mots.length;
      return { p, score };
    })
    .filter(n => n.score > 0);
  const complet = notes.some(n => n.score === 1);
  return notes
    .filter(n => !complet || n.score === 1)
    .sort((a, b) => b.score - a.score
      || Number(b.p.estSociete) - Number(a.p.estSociete)
      || a.p.nom.localeCompare(b.p.nom))
    .slice(0, 20)
    .map(n => n.p);
}

async function rechercher(terme: string): Promise<{ partenaires: PartenaireOdoo[]; motAMot: boolean }> {
  const { data, error } = await supabase.functions.invoke('odoo-prix', { body: { rechercheClient: terme } });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  return { partenaires: data?.partenaires ?? [], motAMot: !!data?.motAMot };
}

/** Cherche dans le fichier Odoo : nom, prénom, société, courriel, ville, TVA. */
export async function chercherClientsOdoo(terme: string): Promise<PartenaireOdoo[]> {
  const t = terme.trim();
  if (t.length < 3) return [];
  const { partenaires, motAMot } = await rechercher(t);
  const mots = t.split(/\s+/).filter(m => m.length >= 3);
  /* Fonction ancienne : « Jean Dupont » entier ne trouve rien. On repasse
     par les mots les plus longs, et le classement garde ceux qui portent tout. */
  if (!motAMot && !partenaires.length && mots.length > 1) {
    const plusLongs = [...mots].sort((a, b) => b.length - a.length).slice(0, 3);
    const lots = await Promise.all(plusLongs.map(m => rechercher(m).then(r => r.partenaires).catch(() => [])));
    return classerPartenaires(t, lots.flat());
  }
  return classerPartenaires(t, partenaires);
}

/** La fiche d'un partenaire de la recherche, quand `ficheClient` n'existe pas encore. */
function ficheDepuisPartenaire(p: PartenaireOdoo): FicheOdoo {
  return {
    id: p.id, nom: p.nom, email: p.email, telephone: p.telephone, mobile: p.mobile,
    adresse: p.adresse, adresse2: '', codePostal: p.codePostal, ville: p.ville, pays: '',
    tva: p.tva, siret: '', siteWeb: '', conditionsReglement: '', listePrix: p.contrat,
    fonction: p.fonction || '', reference: '', estSociete: p.estSociete, type: p.type || '',
  };
}

/** Relit chez Odoo la fiche cliquée : société, adresse, conditions, personnes. */
export async function lireFicheClientOdoo(p: PartenaireOdoo): Promise<FicheClientOdoo> {
  const { data, error } = await supabase.functions.invoke('odoo-prix', { body: { ficheClient: p.id } });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  if (data?.fiche?.societe) return data.fiche as FicheClientOdoo;
  /* Fonction pas encore redéployée : elle a répondu à autre chose. La ligne
     cliquée suffit pour la société ; un contact rattaché n'a pas d'adresse
     de société à donner, elle reste à compléter. */
  const choisi = ficheDepuisPartenaire(p);
  const societe = p.estSociete || !p.societeMere
    ? choisi
    : { ...ficheDepuisPartenaire(p), id: 0, nom: p.societeMere, email: '', telephone: '', mobile: '', estSociete: true, fonction: '' };
  return { societe, choisi, contacts: [], partielle: true };
}

/**
 * « Jean DUPONT » → prénom Jean, nom DUPONT ; « DUPONT Jean » de même.
 * Sans casse pour les départager (tout en capitales, tout en minuscules),
 * le nom complet reste dans le nom : on ne devine pas.
 */
export function separerNomPrenom(nomComplet: string): { prenom: string; nom: string } {
  const mots = String(nomComplet || '').trim().split(/\s+/).filter(Boolean)
    .filter(m => !/^(M\.?|MR\.?|MME\.?|MLLE\.?|MONSIEUR|MADAME)$/i.test(m));
  const capitale = (m: string) => /\p{L}/u.test(m) && m === m.toUpperCase();
  const enCapitales = mots.filter(capitale);
  const autres = mots.filter(m => !capitale(m));
  if (!enCapitales.length || !autres.length) return { prenom: '', nom: mots.join(' ') };
  return { prenom: autres.join(' '), nom: enCapitales.join(' ') };
}

/**
 * Les conditions de règlement Odoo (« 45 jours fin de mois », « Paiement
 * immédiat ») ramenées à une option de MonCRM — vide si aucune ne tombe juste.
 */
export function delaiDepuisConditions(libelle: string): string {
  const t = normaliser(libelle);
  if (!t) return '';
  if (/\b(IMMEDIAT|COMPTANT|RECEPTION)\b/.test(t)) return 'Comptant';
  /* Odoo écrit aussi en abrégé, d'un seul tenant : « 45JRSFDM ». */
  const j = t.match(/\b(\d+)\s*J(?:OURS|OUR|RS|R)?\s*(FDM|FIN DE MOIS)?/);
  if (!j) return '';
  const fdm = !!j[2] || /FIN DE MOIS|FDM/.test(t);
  const option = `${j[1]}J${fdm ? ' FDM' : ''}`;
  return ['30J', '30J FDM', '45J', '45J FDM'].includes(option) ? option : '';
}

const cle = (t?: string) => normaliser(t || '').replace(/\s+/g, '');

/** Le client MonCRM qui est déjà cette société : TVA, SIRET, courriel, raison sociale. */
export function clientDejaConnu(fiche: FicheClientOdoo, clients: Client[]): Client | undefined {
  const s = fiche.societe;
  const tva = cle(s.tva);
  const siret = cle(s.siret);
  const emails = [s.email, fiche.choisi.email].map(e => (e || '').trim().toLowerCase()).filter(Boolean);
  const nom = cle(s.nom);
  return clients.find(c =>
    (tva && cle(c.tvaIntra) === tva)
    || (siret && cle(c.siret) === siret)
    || (emails.length && [c.email, ...(c.contacts || []).map(ct => ct.email)]
      .some(e => e && emails.includes(e.trim().toLowerCase())))
    || (nom && cle(c.societe) === nom));
}

/** « (Vide) » est une valeur de la liste des fonctions d'Odoo, pas une fonction. */
export const fonctionOdoo = (f?: string) => (/^\(?\s*vide\s*\)?$/i.test((f || '').trim()) ? '' : (f || '').trim());

function contactDepuisOdoo(c: ContactOdoo, nouvelId: () => string): Contact {
  const { prenom, nom } = separerNomPrenom(c.nom);
  return {
    id: nouvelId(), nom, prenom, email: c.email || '', telephone: c.telephone || '',
    telephoneMobile: c.mobile || '', fonction: fonctionOdoo(c.fonction),
  };
}

const memeContact = (a: Contact, b: Contact) =>
  (!!a.email && a.email.trim().toLowerCase() === (b.email || '').trim().toLowerCase())
  || cle(`${a.prenom || ''}${a.nom}`) === cle(`${b.prenom || ''}${b.nom}`);

/** La personne cliquée, si c'en est une : le premier contact de la fiche. */
export function contactCherche(fiche: FicheClientOdoo): ContactOdoo | null {
  const c = fiche.choisi;
  if (c.estSociete || c.id === fiche.societe.id || (c.type && c.type !== 'contact')) return null;
  return { id: c.id, nom: c.nom, fonction: c.fonction, email: c.email, telephone: c.telephone, mobile: c.mobile };
}

/** Les personnes proposées : la cherchée en tête, puis celles de la société. */
export function contactsProposes(fiche: FicheClientOdoo): ContactOdoo[] {
  const cherche = contactCherche(fiche);
  return cherche ? [cherche, ...fiche.contacts.filter(c => c.id !== cherche.id)] : fiche.contacts;
}

/* ── Les adresses ──────────────────────────────────────────────────────────
 *
 * Odoo range sous la société des fiches filles « adresse de facturation » et
 * « adresse de livraison ». MonCRM n'a qu'UNE fiche client : son adresse
 * principale est celle de FACTURATION, les autres vont dans ses adresses
 * (`adressesLivraison`, typées facturation ou livraison). */

/** L'adresse de la société elle-même, en tête de liste. */
const adresseSociete = (s: FicheOdoo): AdresseOdoo => ({
  id: s.id, type: 'societe', nom: s.nom, adresse: s.adresse, adresse2: s.adresse2,
  codePostal: s.codePostal, ville: s.ville, telephone: s.telephone || s.mobile, email: s.email,
});

/** Les adresses à proposer : la société, puis ses adresses de facturation, de livraison, autres. */
export function adressesProposees(fiche: FicheClientOdoo): AdresseOdoo[] {
  const ordre: Record<string, number> = { invoice: 1, delivery: 2, other: 3 };
  const filles = (fiche.adresses || [])
    .filter(a => a.type in ordre)
    .sort((a, b) => ordre[a.type] - ordre[b.type] || a.nom.localeCompare(b.nom));
  const s = fiche.societe;
  return (s.adresse || s.ville ? [adresseSociete(s)] : []).concat(filles);
}

/** L'adresse principale de facturation, et celles qui rejoignent les adresses de la fiche. */
export interface ChoixAdresses {
  facturation: number | null;
  reprises: number[];
}

/**
 * Par défaut : la 1re adresse de facturation d'Odoo devient l'adresse
 * principale, sinon celle de la société ; les adresses filles sont toutes
 * reprises. Le SIÈGE ne l'est que si Odoo n'a aucune adresse de livraison :
 * c'est alors là qu'il livre ; sinon il reste proposé, décoché (EMPREINTE
 * SIGNA : siège à Betheny, livraison et facturation à Guise).
 */
export function choixAdressesParDefaut(fiche: FicheClientOdoo): ChoixAdresses {
  const proposees = adressesProposees(fiche);
  const facturation = (proposees.find(a => a.type === 'invoice') || proposees[0])?.id ?? null;
  const livraisonOdoo = proposees.some(a => a.type === 'delivery');
  return {
    facturation,
    reprises: proposees
      .filter(a => a.id !== facturation && !(a.type === 'societe' && livraisonOdoo))
      .map(a => a.id),
  };
}

export const LIBELLE_TYPE_ADRESSE: Record<string, string> = {
  societe: 'Société', invoice: 'Facturation', delivery: 'Livraison', other: 'Autre adresse',
};

const ligneAdresse = (a: Pick<AdresseOdoo, 'adresse' | 'adresse2'>) =>
  [a.adresse, a.adresse2].map(x => (x || '').trim()).filter(Boolean).join(', ');

const cleAdresse = (adresse: string, cp: string) => `${cle(adresse)}|${cle(cp)}`;

/** Le libellé d'une adresse reprise : son nom Odoo s'il dit quelque chose, sinon son rôle et sa ville. */
function libelleAdresse(a: AdresseOdoo, societe: FicheOdoo): string {
  if (a.type === 'societe') return `Siège${a.ville ? ` — ${a.ville}` : ''}`;
  if (a.nom && cle(a.nom) !== cle(societe.nom)) return a.nom;
  return `${LIBELLE_TYPE_ADRESSE[a.type] || 'Adresse'}${a.ville ? ` — ${a.ville}` : ''}`;
}

/**
 * La fiche client remplie depuis Odoo.
 *
 * `remplacer` (nouveau client) : Odoo fait foi sur tout ce qu'il porte.
 * Sinon (fiche existante) : Odoo ne remplit que les champs vides. Un champ
 * vide chez Odoo ne vide jamais rien. Les contacts cochés s'ajoutent, sans
 * doublon (même courriel, ou même prénom + nom) ; les adresses reprises
 * aussi (même rue et même code postal), l'adresse principale comprise.
 */
export function remplirDepuisOdoo(
  form: FormClient,
  fiche: FicheClientOdoo,
  contactsRetenus: ContactOdoo[],
  remplacer: boolean,
  nouvelId: () => string,
  choix: ChoixAdresses = choixAdressesParDefaut(fiche),
): FormClient {
  const s = fiche.societe;
  const pose = <K extends keyof FormClient>(champ: K, valeur: FormClient[K] | undefined | '') => {
    if (valeur === undefined || valeur === '' || valeur === null) return {};
    const actuel = form[champ];
    if (!remplacer && actuel !== undefined && actuel !== null && String(actuel).trim() !== '') return {};
    return { [champ]: valeur } as Partial<FormClient>;
  };
  const proposees = adressesProposees(fiche);
  const facturation = proposees.find(a => a.id === choix.facturation);
  /* Sans adresse choisie, la société reste l'adresse principale si elle en a une. */
  const principale = facturation || adresseSociete(s);
  const adresse = ligneAdresse(principale);
  const delai = delaiDepuisConditions(s.conditionsReglement);

  const contacts = [...(form.contacts || [])];
  for (const c of contactsRetenus) {
    const nouveau = contactDepuisOdoo(c, nouvelId);
    if (!contacts.some(x => memeContact(x, nouveau))) contacts.push(nouveau);
  }

  /* L'adresse principale qui sera en place : la nôtre si on la garde. */
  const garde = !remplacer && (form.adresse || '').trim();
  const principaleFinale = garde
    ? cleAdresse(form.adresse, form.codePostal)
    : cleAdresse(adresse || form.adresse, principale.codePostal || form.codePostal);
  const adressesLivraison = [...(form.adressesLivraison || [])];
  /* Une adresse se reconnaît à sa rue, son code postal ET son rôle : la
     LIVRAISON à la même adresse que la facturation principale a sa place
     dans la liste, puisque l'adresse principale ne vaut que facturation. */
  const connues = new Set([
    `facturation#${principaleFinale}`,
    ...adressesLivraison.map(a => `${a.type}#${cleAdresse(a.adresse, a.codePostal)}`),
  ]);
  const ajoutees: AdresseLivraison[] = [];
  const rang = new Map<string, number>();
  /* Les adresses de livraison d'Odoo passent devant le siège pour être celle par défaut. */
  const ordre = (t: string) => (t === 'delivery' ? 0 : 1);
  for (const a of [...proposees].sort((x, y) => ordre(x.type) - ordre(y.type))) {
    /* L'adresse de facturation choisie devient la principale — sauf sur une
       fiche qui garde la sienne : elle rejoint alors les adresses, en facturation. */
    const estFacturation = a.id === choix.facturation;
    if (estFacturation ? !garde : !choix.reprises.includes(a.id)) continue;
    const ligne = ligneAdresse(a);
    if (!ligne) continue;
    const type = estFacturation || a.type === 'invoice' ? 'facturation' : 'livraison';
    const k = `${type}#${cleAdresse(ligne, a.codePostal)}`;
    if (connues.has(k)) continue;
    connues.add(k);
    const idAdresse = nouvelId();
    rang.set(idAdresse, proposees.indexOf(a));
    ajoutees.push({
      id: idAdresse, libelle: libelleAdresse(a, s), adresse: ligne, ville: a.ville || '',
      codePostal: a.codePostal || '', contact: '', telephone: a.telephone || '', parDefaut: false, type,
    });
  }
  /* Une livraison par défaut si la fiche n'en a pas : la 1re ajoutée. */
  if (!adressesLivraison.some(a => a.parDefaut && a.type !== 'facturation')) {
    const premiere = ajoutees.find(a => a.type === 'livraison');
    if (premiere) premiere.parDefaut = true;
  }
  /* Rangées dans l'ordre de la liste Odoo : siège, facturation, livraisons. */
  adressesLivraison.push(...ajoutees.sort((x, y) => (rang.get(x.id) ?? 0) - (rang.get(y.id) ?? 0)));

  const trace = s.id ? `Fiche reprise du fichier Odoo (partenaire #${s.id}).` : '';
  const notes = trace && !(form.notes || '').includes(`partenaire #${s.id}`)
    ? [form.notes, trace].filter(Boolean).join('\n')
    : form.notes;

  return {
    ...form,
    ...pose('societe', s.nom),
    /* L'adresse principale se prend d'un bloc : rue, code postal et ville
       d'une même adresse, jamais la rue de l'une et la ville de l'autre. */
    ...(garde ? {} : {
      ...pose('adresse', adresse),
      ...pose('codePostal', principale.codePostal),
      ...pose('ville', principale.ville),
    }),
    ...pose('email', s.email),
    ...pose('telephone', s.telephone || s.mobile),
    ...pose('tvaIntra', s.tva),
    ...pose('siret', (s.siret || '').replace(/\s+/g, '')),
    ...pose('listePrixOdoo', s.listePrix),
    /* Le délai a toujours une valeur (45J FDM par défaut) : sur une fiche
       neuve Odoo le remplace, sur une fiche existante il ne touche à rien. */
    ...(delai && remplacer ? { delaiReglement: delai } : {}),
    contacts,
    adressesLivraison,
    notes,
  };
}
