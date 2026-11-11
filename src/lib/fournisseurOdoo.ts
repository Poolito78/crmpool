/**
 * LE FICHIER PARTENAIRES D'ODOO, LU POUR CRÉER UN FOURNISSEUR — EN LECTURE.
 *
 * Odoo ne sépare pas clients et fournisseurs : la même fiche sert aux deux
 * sens. La recherche passe par `odoo-prix` (`rechercheClient`), sur la raison
 * sociale, la ville, le courriel ou la TVA ; rien n'est écrit chez Odoo.
 *
 * La fiche retenue est recopiée dans MonCRM, avec « partenaire #id » dans les
 * notes (`odooIdDuFournisseur` le relit pour `odoo-achat`). Un fournisseur
 * déjà présent — même courriel, ou même raison sociale — est réutilisé, pas
 * doublé. Franco, transport et délai de règlement ne se lisent pas sur une
 * fiche partenaire : ils restent à zéro, à compléter, jamais inventés.
 *
 * Servi par l'analyse de document et par l'onglet Fournisseurs de la fiche
 * article (« Nouveau fournisseur » → Chercher dans Odoo).
 */
import { supabase } from '@/integrations/supabase/client';
import type { Fournisseur } from './store';

/** Une fiche du fichier partenaires d'Odoo, telle que la renvoie `odoo-prix`. */
export interface PartenaireOdoo {
  id: number;
  nom: string;
  email: string;
  ville: string;
  codePostal: string;
  adresse: string;
  telephone: string;
  mobile: string;
  tva: string;
  estSociete: boolean;
  societeMere: string;
  contrat: string;
}

export async function chercherPartenairesOdoo(terme: string): Promise<PartenaireOdoo[]> {
  const { data, error } = await supabase.functions.invoke('odoo-prix', {
    body: { rechercheClient: terme.trim() },
  });
  if (error) throw new Error(error.message || 'Odoo injoignable');
  if (data?.erreur) throw new Error(data.erreur);
  return data?.partenaires ?? [];
}

/** La société d'une fiche : un contact rattaché désigne sa société mère. */
export const societePartenaire = (p: PartenaireOdoo) => (p.estSociete ? p.nom : (p.societeMere || p.nom));

/**
 * Le fournisseur MonCRM d'une fiche Odoo : celui qui existe déjà (courriel,
 * sinon raison sociale exacte), ou une fiche neuve à ajouter.
 */
export function fournisseurDepuisPartenaire(
  p: PartenaireOdoo,
  fournisseurs: Fournisseur[],
  nouvelId: () => string,
): { fournisseur: Fournisseur; existant: boolean } {
  const societe = societePartenaire(p);
  const email = (p.email || '').trim().toLowerCase();
  const existant = fournisseurs.find(f =>
    (email && (f.email || '').trim().toLowerCase() === email)
    || (f.societe || f.nom || '').trim().toLowerCase() === societe.trim().toLowerCase());
  if (existant) return { fournisseur: existant, existant: true };
  return {
    existant: false,
    fournisseur: {
      id: nouvelId(),
      /* Le nom de la personne quand la fiche Odoo en est une ; sinon vide —
         une raison sociale n'est pas un nom de contact. */
      nom: p.estSociete ? '' : p.nom,
      societe,
      email: p.email || '',
      telephone: p.telephone || p.mobile || '',
      telephoneMobile: p.mobile || undefined,
      adresse: p.adresse || '',
      ville: p.ville || '',
      codePostal: p.codePostal || '',
      notes: `Fiche reprise du fichier Odoo (partenaire #${p.id}).`,
      francoPort: 0,
      coutTransport: 0,
      delaiReglement: '',
      dateCreation: new Date().toISOString().split('T')[0],
    },
  };
}
