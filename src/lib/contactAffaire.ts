import { memePersonne } from './chiffrage';
import type { Contact } from './store';

/**
 * L'interlocuteur de l'affaire, du fichier Odoo jusqu'au devis.
 *
 * CE QUI MANQUAIT : l'écran d'analyse identifie déjà la bonne personne — il
 * la présélectionne dans « Contact de l'affaire », en faisant primer le nom
 * du signataire sur l'adresse d'expédition — puis l'oubliait. Le devis créé
 * partait sans contact, et la fiche client n'en gardait aucune trace. Il
 * fallait rouvrir le devis et ressaisir à la main quelqu'un qui était affiché
 * à l'écran une seconde plus tôt.
 *
 * DEUX ÉCRITURES, PAS UNE : le contact appartient au CLIENT (colonne `contacts`
 * en JSON sur `clients`), le devis n'en retient que l'identifiant. Rattacher
 * quelqu'un à une affaire, c'est donc d'abord l'inscrire au fichier client.
 *
 * LE DOUBLON EST LE VRAI RISQUE. La même personne revient sur chaque demande ;
 * créer un contact à chaque fois donnerait dix « Thierry BARAILLER » dans la
 * liste déroulante, et le devis suivant ne saurait plus lequel désigner. On
 * rapproche donc avant de créer.
 */

/** Ce qu'une fiche Odoo livre d'un interlocuteur. */
export interface ContactSource {
  nom: string;
  fonction?: string;
  email?: string;
  telephone?: string;
  mobile?: string;
}

export interface Rattachement {
  /** Les contacts du client, mis à jour. */
  contacts: Contact[];
  /** L'identifiant à porter sur le devis. Absent si rien n'a pu être rattaché. */
  contactId?: string;
  /** Vrai si `contacts` diffère de l'entrée — sinon, rien à écrire. */
  modifie: boolean;
}

/** Le nom complet tel qu'il s'affiche, prénom d'abord. */
export function nomComplet(c: Pick<Contact, 'nom' | 'prenom'>): string {
  return [c.prenom, c.nom].filter(Boolean).join(' ').trim();
}

/**
 * Rattache un interlocuteur aux contacts d'un client, sans doublon.
 *
 * L'ADRESSE AVANT LE NOM : deux homonymes existent, deux adresses identiques
 * non. Le rapprochement par nom (`memePersonne`, un mot de quatre lettres en
 * commun) ne sert qu'à défaut d'adresse — il rapprocherait « Jean MARTIN » et
 * « Sophie MARTIN », ce qui est acceptable au sein d'une même société mais ne
 * doit pas primer sur une adresse qui, elle, tranche.
 *
 * ON COMPLÈTE, ON N'ÉCRASE PAS. Un contact déjà saisi à la main porte parfois
 * une ligne directe qu'Odoo ignore ; le champ vide se remplit, le champ rempli
 * reste. La fiche locale est celle que quelqu'un a voulue.
 *
 * Le nom part entier dans `nom`, sans découpage prénom/nom : Odoo écrit tantôt
 * « Thierry BARAILLER », tantôt « BARAILLER Thierry », et deviner à l'envers
 * imprimerait la bêtise sur le PDF du devis.
 */
export function rattacherContact(
  contactsExistants: Contact[] | undefined,
  source: ContactSource | null | undefined,
  nouvelId: () => string,
): Rattachement {
  const contacts = [...(contactsExistants ?? [])];
  const nom = source?.nom?.trim();
  if (!source || !nom) return { contacts, modifie: false };

  const email = source.email?.trim().toLowerCase();
  const parMail = email
    ? contacts.find(c => c.email?.trim().toLowerCase() === email)
    : undefined;
  const existant = parMail ?? contacts.find(c => memePersonne(nomComplet(c), nom));

  if (existant) {
    const complete: Contact = {
      ...existant,
      email: existant.email || source.email || undefined,
      telephone: existant.telephone || source.telephone || undefined,
      telephoneMobile: existant.telephoneMobile || source.mobile || undefined,
      fonction: existant.fonction || source.fonction || undefined,
    };
    const modifie = complete.email !== existant.email
      || complete.telephone !== existant.telephone
      || complete.telephoneMobile !== existant.telephoneMobile
      || complete.fonction !== existant.fonction;
    return {
      contacts: modifie ? contacts.map(c => (c.id === existant.id ? complete : c)) : contacts,
      contactId: existant.id,
      modifie,
    };
  }

  const nouveau: Contact = {
    id: nouvelId(),
    nom,
    email: source.email || undefined,
    telephone: source.telephone || undefined,
    telephoneMobile: source.mobile || undefined,
    fonction: source.fonction || undefined,
    /* Le premier contact d'un client neuf reçoit la facturation : sans lui,
       le devis n'a personne à qui adresser la facture, et l'écran retombait
       sur le premier de la liste — c'est-à-dire lui, mais par hasard. */
    ...(contacts.length === 0 ? { facturation: true } : {}),
  };
  return { contacts: [...contacts, nouveau], contactId: nouveau.id, modifie: true };
}
