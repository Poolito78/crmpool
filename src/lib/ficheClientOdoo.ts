/**
 * LA FICHE CLIENT MONCRM REMPLIE DEPUIS LE FICHIER ODOO — EN LECTURE.
 *
 * « Nouveau client » → Rechercher dans Odoo : on tape un nom, un prénom, une
 * société — dans n'importe quel ordre, « Jean Dupont Colas » — et `odoo-prix`
 * cherche CHAQUE MOT dans le nom, le courriel, la TVA, la ville et la société
 * mère des fiches (`rechercheClient`). La fiche cliquée est relue en entier
 * (`ficheClient`) : la SOCIÉTÉ — la mère d'un contact rattaché —, son
 * adresse, sa TVA, son SIRET, ses conditions de règlement, et les personnes
 * qui lui sont rattachées, à cocher. Rien n'est jamais écrit chez Odoo.
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
import type { Client, Contact } from './store';
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

/** La société, la fiche cliquée (la même, ou un contact), ses personnes. */
export interface FicheClientOdoo {
  societe: FicheOdoo;
  choisi: FicheOdoo;
  contacts: ContactOdoo[];
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
  const j = t.match(/\b(\d+)\s*(J|JOURS?)\b/);
  if (!j) return '';
  const fdm = /\bFIN DE MOIS\b|\bFDM\b/.test(t);
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

function contactDepuisOdoo(c: ContactOdoo, nouvelId: () => string): Contact {
  const { prenom, nom } = separerNomPrenom(c.nom);
  return {
    id: nouvelId(), nom, prenom, email: c.email || '', telephone: c.telephone || '',
    telephoneMobile: c.mobile || '', fonction: c.fonction || '',
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

/**
 * La fiche client remplie depuis Odoo.
 *
 * `remplacer` (nouveau client) : Odoo fait foi sur tout ce qu'il porte.
 * Sinon (fiche existante) : Odoo ne remplit que les champs vides. Un champ
 * vide chez Odoo ne vide jamais rien. Les contacts cochés s'ajoutent, sans
 * doublon (même courriel, ou même prénom + nom).
 */
export function remplirDepuisOdoo(
  form: FormClient,
  fiche: FicheClientOdoo,
  contactsRetenus: ContactOdoo[],
  remplacer: boolean,
  nouvelId: () => string,
): FormClient {
  const s = fiche.societe;
  const pose = <K extends keyof FormClient>(champ: K, valeur: FormClient[K] | undefined | '') => {
    if (valeur === undefined || valeur === '' || valeur === null) return {};
    const actuel = form[champ];
    if (!remplacer && actuel !== undefined && actuel !== null && String(actuel).trim() !== '') return {};
    return { [champ]: valeur } as Partial<FormClient>;
  };
  const adresse = [s.adresse, s.adresse2].map(a => (a || '').trim()).filter(Boolean).join(', ');
  const delai = delaiDepuisConditions(s.conditionsReglement);

  const contacts = [...(form.contacts || [])];
  for (const c of contactsRetenus) {
    const nouveau = contactDepuisOdoo(c, nouvelId);
    if (!contacts.some(x => memeContact(x, nouveau))) contacts.push(nouveau);
  }

  const trace = s.id ? `Fiche reprise du fichier Odoo (partenaire #${s.id}).` : '';
  const notes = trace && !(form.notes || '').includes(`partenaire #${s.id}`)
    ? [form.notes, trace].filter(Boolean).join('\n')
    : form.notes;

  return {
    ...form,
    ...pose('societe', s.nom),
    ...pose('adresse', adresse),
    ...pose('codePostal', s.codePostal),
    ...pose('ville', s.ville),
    ...pose('email', s.email),
    ...pose('telephone', s.telephone || s.mobile),
    ...pose('tvaIntra', s.tva),
    ...pose('siret', (s.siret || '').replace(/\s+/g, '')),
    ...pose('listePrixOdoo', s.listePrix),
    /* Le délai a toujours une valeur (45J FDM par défaut) : sur une fiche
       neuve Odoo le remplace, sur une fiche existante il ne touche à rien. */
    ...(delai && remplacer ? { delaiReglement: delai } : {}),
    contacts,
    notes,
  };
}
