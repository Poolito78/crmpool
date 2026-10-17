/**
 * Multi-société (migration 20261017140000).
 *
 * Une SOCIÉTÉ est une personne morale : elle émet les devis, commandes et
 * factures, porte l'identité légale du pied de page et tient ses propres
 * séries de numéros (obligatoire pour les factures). Une MARQUE n'est qu'un
 * logo (et un e-mail de contact) imprimé par une société : ISOSIGN, ISOFLOOR,
 * ISOMARK et STI sont des marques de la même société ISOSIGN.
 *
 * Clients et catalogue sont COMMUNS à toutes les sociétés (règle du 17/10).
 * Odoo ne concerne que les sociétés dont `odoo` est vrai (ISOSIGN).
 *
 * Droits : l'administrateur voit et configure toutes les sociétés ; les autres
 * comptes sont rattachés à UNE société (`utilisateur_societes`, ISOSIGN par
 * défaut) — la base le garantit par RLS, l'écran ne fait que le refléter.
 */
import logoIsofloor from '@/assets/logo-isofloor.png';
import type { Emetteur } from './emetteur';

export interface Marque {
  nom: string;
  /** URL publique du logo (bucket `societes-logos`). Absent = logo embarqué s'il existe. */
  logoUrl?: string;
  email?: string;
  siteWeb?: string;
}

export interface Societe {
  id: string;
  /** Clé stable : 'ISOSIGN', 'SIGNALISE', 'FORFLOOR'… */
  code: string;
  raisonSociale: string;
  formeJuridique?: string;
  capital?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  pays: string;
  siren?: string;
  siret?: string;
  rcs?: string;
  ape?: string;
  tvaIntra?: string;
  email?: string;
  telephone?: string;
  fax?: string;
  siteWeb?: string;
  /** Préfixe des séries : '' pour ISOSIGN (DEV-2026-…), 'SIG' → SIG-DEV-2026-… */
  prefixe: string;
  /** Les devis de cette société partent-ils vers Odoo ? */
  odoo: boolean;
  marques: Marque[];
  marqueDefaut?: string;
  actif: boolean;
  ordre: number;
}

/** Pied de page d'avant le multi-société : sert tant que la table `societes` n'est pas lue. */
export const LEGAL_ISOSIGN_DEFAUT: [string, string] = [
  'ISOSIGN® • ZA du Monay - 71210 SAINT-EUSÈBE - France - Tél. : 03 85 77 07 25 • Fax : 03 85 55 41 14 • isosign@isosign.fr • www.isosign.fr',
  'SAS au capital de 40 000 € • RCS Chalon-sur-Saône 494922313 • SIRET 4949223130005 • APE 4669B • TVA FR76494922313',
];

/** Logo embarqué par défaut (ISOFLOOR), tant que rien d'autre n'est configuré. */
export const LOGO_DEFAUT = logoIsofloor;

/** Lit une image en data URL (pour jsPDF) ; `null` si elle ne se charge pas. */
export async function imageEnDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const blob = await fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
    return await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result as string);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** Logos embarqués dans l'application, par nom de marque. */
const LOGOS_EMBARQUES: Record<string, string> = { ISOFLOOR: logoIsofloor };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToSociete(r: any): Societe {
  return {
    id: r.id,
    code: r.code,
    raisonSociale: r.raison_sociale || r.code,
    formeJuridique: r.forme_juridique || undefined,
    capital: r.capital || undefined,
    adresse: r.adresse || undefined,
    codePostal: r.code_postal || undefined,
    ville: r.ville || undefined,
    pays: r.pays || 'FR',
    siren: r.siren || undefined,
    siret: r.siret || undefined,
    rcs: r.rcs || undefined,
    ape: r.ape || undefined,
    tvaIntra: r.tva_intra || undefined,
    email: r.email || undefined,
    telephone: r.telephone || undefined,
    fax: r.fax || undefined,
    siteWeb: r.site_web || undefined,
    prefixe: r.prefixe || '',
    odoo: r.odoo ?? false,
    marques: Array.isArray(r.marques) ? r.marques : [],
    marqueDefaut: r.marque_defaut || undefined,
    actif: r.actif ?? true,
    ordre: r.ordre ?? 0,
  };
}

export function societeToDb(s: Societe) {
  return {
    id: s.id,
    code: s.code,
    raison_sociale: s.raisonSociale,
    forme_juridique: s.formeJuridique || null,
    capital: s.capital || null,
    adresse: s.adresse || null,
    code_postal: s.codePostal || null,
    ville: s.ville || null,
    pays: s.pays || 'FR',
    siren: s.siren?.replace(/\D/g, '') || null,
    siret: s.siret?.replace(/\D/g, '') || null,
    rcs: s.rcs || null,
    ape: s.ape || null,
    tva_intra: s.tvaIntra?.replace(/\s/g, '').toUpperCase() || null,
    email: s.email || null,
    telephone: s.telephone || null,
    fax: s.fax || null,
    site_web: s.siteWeb || null,
    prefixe: (s.prefixe || '').trim().toUpperCase(),
    odoo: s.odoo,
    marques: s.marques,
    marque_defaut: s.marqueDefaut || null,
    actif: s.actif,
    ordre: s.ordre,
  };
}

/**
 * Société d'un document : la sienne, à défaut ISOSIGN (les documents d'avant
 * le multi-société, et ceux d'un utilisateur sans rattachement).
 */
export function societeDuDocument(
  doc: { societeId?: string } | undefined | null,
  societes: Societe[],
): Societe | undefined {
  return (doc?.societeId && societes.find(s => s.id === doc.societeId))
    || societes.find(s => s.code === 'ISOSIGN')
    || societes[0];
}

/** Le document appartient-il à la société `id` ? (sans société = ISOSIGN) */
export function documentDeLaSociete(doc: { societeId?: string }, id: string, idIsosign: string | undefined): boolean {
  return (doc.societeId || idIsosign) === id;
}

/**
 * Préfixe d'une série de numéros : `serie(isosign, 'DEV', 2026)` = « DEV-2026 »,
 * `serie(signalise, 'DEV', 2026)` = « SIG-DEV-2026 ».
 */
export function serie(societe: Pick<Societe, 'prefixe'> | undefined, type: string, annee = new Date().getFullYear()): string {
  const p = (societe?.prefixe || '').trim().toUpperCase();
  return `${p ? `${p}-` : ''}${type}-${annee}`;
}

/** Marque imprimée : celle du document, sinon la marque par défaut de la société, sinon la première. */
export function marqueDe(societe: Societe | undefined, nom?: string): Marque | undefined {
  if (!societe) return undefined;
  return societe.marques.find(m => m.nom === nom)
    || societe.marques.find(m => m.nom === societe.marqueDefaut)
    || societe.marques[0];
}

/** URL du logo à imprimer, ou `undefined` (on n'imprime alors que le nom). */
export function logoDe(societe: Societe | undefined, nomMarque?: string): string | undefined {
  const m = marqueDe(societe, nomMarque);
  if (!m) return undefined;
  return m.logoUrl || LOGOS_EMBARQUES[m.nom.toUpperCase()];
}

/** Les deux lignes légales du pied de page. Un champ vide est omis, jamais remplacé. */
export function lignesLegales(s: Societe | undefined, nomMarque?: string): [string, string] {
  if (!s) return ['', ''];
  const m = marqueDe(s, nomMarque);
  const adresse = [s.adresse, [s.codePostal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  const l1 = [
    [s.raisonSociale, adresse, s.pays === 'FR' ? 'France' : s.pays].filter(Boolean).join(' - '),
    [s.telephone && `Tél. : ${s.telephone}`, s.fax && `Fax : ${s.fax}`].filter(Boolean).join(' • '),
    m?.email || s.email,
    m?.siteWeb || s.siteWeb,
  ].filter(Boolean).join(' • ');
  const l2 = [
    [s.formeJuridique, s.capital && `au capital de ${s.capital}`].filter(Boolean).join(' '),
    s.rcs,
    s.siret ? `SIRET ${s.siret}` : s.siren ? `SIREN ${s.siren}` : '',
    s.ape && `APE ${s.ape}`,
    s.tvaIntra && `TVA ${s.tvaIntra}`,
  ].filter(Boolean).join(' • ');
  return [l1, l2];
}

/** Identité de l'émetteur d'une facture, lue sur la société. */
export function emetteurDe(s: Societe): Emetteur {
  return {
    raisonSociale: s.raisonSociale,
    formeJuridique: s.formeJuridique || '',
    capital: s.capital || '',
    adresse: s.adresse || '',
    codePostal: s.codePostal || '',
    ville: s.ville || '',
    pays: s.pays || 'FR',
    siren: (s.siren || '').replace(/\D/g, ''),
    siret: s.siret ? s.siret.replace(/\D/g, '') : null,
    rcs: s.rcs || '',
    ape: s.ape || '',
    tvaIntra: (s.tvaIntra || '').replace(/\s/g, '').toUpperCase(),
    email: s.email || '',
    telephone: s.telephone || '',
  };
}
