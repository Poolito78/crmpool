/**
 * Identité légale de l'émetteur des factures — UN SEUL point de vérité.
 *
 * Reprend la ligne légale imprimée sur les devis et AR (`pdfFolder.ts`,
 * `CommandeARPreview.tsx`). Elle est figée sur chaque facture à l'émission
 * (`factures_client.emetteur_fige`) : une facture émise garde l'identité du
 * jour où elle l'a été, même si cette fiche change ensuite.
 *
 * ⚠️ **LE SIRET IMPRIMÉ EST FAUX** : « 4949223130005 » n'a que 13 chiffres
 * (un SIRET en a 14 : SIREN + NIC de 5 chiffres), et aucune insertion d'un
 * zéro ne passe la clé de Luhn. On ne le devine pas : `siret` reste `null`
 * tant que le vrai n'est pas relu sur l'avis de situation INSEE / Kbis, et le
 * contrôle d'émission le signale. Le SIREN (494922313) est sûr : il est
 * cohérent avec le RCS et la clé du n° de TVA (76).
 */
export interface Emetteur {
  raisonSociale: string;
  formeJuridique: string;
  capital: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  siren: string;
  siret: string | null;
  rcs: string;
  ape: string;
  tvaIntra: string;
  email: string;
  telephone: string;
}

export const EMETTEUR: Emetteur = {
  raisonSociale: 'ISOSIGN',
  formeJuridique: 'SAS',
  capital: '40 000 €',
  adresse: 'ZA du Monay',
  codePostal: '71210',
  ville: 'SAINT-EUSÈBE',
  pays: 'FR',
  siren: '494922313',
  siret: null,
  rcs: 'RCS Chalon-sur-Saône 494922313',
  ape: '4669B',
  tvaIntra: 'FR76494922313',
  email: 'isosign@isosign.fr',
  telephone: '03 85 77 07 25',
};
