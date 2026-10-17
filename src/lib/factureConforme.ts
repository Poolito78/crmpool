/**
 * Facturation conforme à la réforme de la facture électronique (B2B France).
 *
 * Calendrier : réception obligatoire pour tous depuis le 1er septembre 2026 ;
 * émission obligatoire au 1er septembre 2027 pour les PME. D'ici là, les
 * factures doivent déjà porter les données que le format structuré
 * (Factur-X / UBL / CII, norme EN 16931) exigera — c'est l'objet de ce module.
 *
 * Ce module NE DÉCIDE RIEN À LA PLACE de l'utilisateur. Il contrôle :
 * - `bloquants` empêchent l'émission (donnée exigée absente ou fausse) ;
 * - `avertissements` s'affichent mais n'empêchent pas d'émettre.
 * Règle de la maison : on n'invente jamais une donnée métier. Une catégorie
 * d'opération, un SIREN, une adresse de livraison se SAISISSENT ; on peut en
 * proposer une, jamais la poser d'office.
 *
 * Le numéro définitif n'est PAS attribué ici : il l'est par la base à
 * l'émission (`emettre_facture_client`, migration 20261017120000), seule
 * capable de garantir une suite chronologique sans trou ni doublon entre
 * plusieurs utilisateurs — le calcul côté navigateur ne voit que les factures
 * de son utilisateur (RLS).
 */
import type { Client, FactureClient, LigneDevis } from './store';
import type { Emetteur } from './emetteur';

// ── Identifiants ────────────────────────────────────────────────────────────

/** Ne garde que les chiffres (« 494 922 313 » → « 494922313 »). */
export function chiffres(s: string | undefined | null): string {
  return (s || '').replace(/\D/g, '');
}

/** Clé de Luhn, qui contrôle SIREN et SIRET. */
export function luhnValide(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let total = 0;
  for (let i = 0; i < num.length; i++) {
    let d = num.charCodeAt(num.length - 1 - i) - 48;
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    total += d;
  }
  return total % 10 === 0;
}

export function sirenValide(siren: string): boolean {
  return /^\d{9}$/.test(siren) && luhnValide(siren);
}

/**
 * SIRET valide : 14 chiffres, clé de Luhn. Exception connue de l'INSEE : les
 * établissements de La Poste (SIREN 356000000) se contrôlent par la somme des
 * chiffres multiple de 5.
 */
export function siretValide(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false;
  if (siret.startsWith('356000000')) {
    return [...siret].reduce((s, c) => s + Number(c), 0) % 5 === 0;
  }
  return luhnValide(siret);
}

/** Clé du n° de TVA intracommunautaire français : (12 + 3 × (SIREN mod 97)) mod 97. */
export function cleTvaFr(siren: string): string {
  const k = (12 + 3 * (Number(siren) % 97)) % 97;
  return String(k).padStart(2, '0');
}

export function tvaIntraFrValide(tva: string): boolean {
  const t = tva.replace(/\s/g, '').toUpperCase();
  const m = t.match(/^FR(\d{2})(\d{9})$/);
  if (!m) return false;
  return sirenValide(m[2]) && cleTvaFr(m[2]) === m[1];
}

/** N° de TVA étranger (UE ou non) : deux lettres puis au moins 2 caractères, autre que FR. */
export function tvaEtrangere(tva: string | undefined): boolean {
  const t = (tva || '').replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{2,}$/.test(t) && !t.startsWith('FR');
}

/**
 * SIREN du client, lu dans SON SIRET d'abord, à défaut dans son n° de TVA
 * français. `null` si aucune des deux sources ne le donne — jamais deviné.
 */
export function sirenDuClient(c: Pick<Client, 'siret' | 'tvaIntra'>): string | null {
  const siret = chiffres(c.siret);
  if (siret.length >= 9) return siret.slice(0, 9);
  const m = (c.tvaIntra || '').replace(/\s/g, '').toUpperCase().match(/^FR\d{2}(\d{9})$/);
  return m ? m[1] : null;
}

// ── Catégorie d'opération ───────────────────────────────────────────────────

/**
 * Mention obligatoire de la réforme : la facture dit si elle porte sur des
 * livraisons de biens, des prestations de services, ou les deux.
 */
export type CategorieOperation = 'biens' | 'services' | 'mixte';

export const CATEGORIES_OPERATION: Record<CategorieOperation, string> = {
  biens: 'Livraison de biens',
  services: 'Prestation de services',
  mixte: 'Livraison de biens et prestation de services',
};

const estArticle = (l: LigneDevis) => l.type !== 'groupe' && l.type !== 'soustotal' && l.type !== 'texte';
const MOTS_SERVICE = /\b(pose|poses|main[- ]d['’]?oeuvre|main[- ]d['’]?œuvre|application|prestation|installation|d[ée]placement|formation|intervention|chantier|marquage au sol r[ée]alis[ée])\b/i;

/**
 * SUGGESTION de catégorie, affichée à côté du choix — jamais posée d'office.
 * Toutes les lignes rattachées à un article et aucune ne parle de pose ni de
 * main-d'œuvre → biens ; des lignes de service ET d'article → mixte ; sinon
 * `null` (on ne sait pas).
 */
export function categorieSuggeree(lignes: LigneDevis[]): CategorieOperation | null {
  const articles = lignes.filter(estArticle);
  if (articles.length === 0) return null;
  const service = articles.filter(l => MOTS_SERVICE.test(l.description || ''));
  const sansArticle = articles.filter(l => !l.produitId);
  if (service.length === 0 && sansArticle.length === 0) return 'biens';
  if (service.length > 0 && service.length < articles.length) return 'mixte';
  if (service.length === articles.length) return 'services';
  return null;
}

// ── Mentions légales ────────────────────────────────────────────────────────

/**
 * Mentions de paiement obligatoires (C. com. L441-9 et L441-10). Le taux des
 * pénalités est le taux LÉGAL PAR DÉFAUT (taux BCE + 10 points), celui qui
 * s'applique quand les CGV n'en fixent pas d'autre. Escompte : la mention
 * « pas d'escompte » est ce qu'on imprime faute d'escompte prévu.
 */
export function mentionsPaiement(f: Pick<FactureClient, 'tvaSurDebits' | 'categorieOperation'>): string[] {
  const m = [
    "En cas de retard de paiement, pénalités exigibles au taux directeur de la BCE majoré de 10 points, sans qu'un rappel soit nécessaire.",
    "Indemnité forfaitaire pour frais de recouvrement : 40 € (art. L441-10 et D441-5 du Code de commerce).",
    "Pas d'escompte pour paiement anticipé.",
  ];
  if (f.tvaSurDebits && f.categorieOperation && f.categorieOperation !== 'biens') {
    m.push("Option pour le paiement de la TVA d'après les débits.");
  }
  return m;
}

// ── Contrôle avant émission ─────────────────────────────────────────────────

export interface ControleFacture {
  bloquants: string[];
  avertissements: string[];
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Tout ce qui doit être vrai pour émettre `f`. Ne modifie rien.
 * `origine` = facture d'origine d'un avoir, si elle est chargée.
 */
export function controlerFacture(
  f: FactureClient,
  client: Client | undefined,
  emetteur: Emetteur,
  origine?: FactureClient,
): ControleFacture {
  const bloquants: string[] = [];
  const avertissements: string[] = [];

  if (f.estProforma) bloquants.push("Une proforma ne s'émet pas : la convertir d'abord en facture.");
  if (f.emiseLe) bloquants.push('Cette facture est déjà émise.');

  // Émetteur
  if (!sirenValide(emetteur.siren)) bloquants.push(`SIREN de l'émetteur invalide (${emetteur.siren}).`);
  if (!emetteur.siret || !siretValide(emetteur.siret)) {
    avertissements.push("SIRET de l'émetteur à compléter : celui des documents ISOSIGN (« 4949223130005 ») n'a que 13 chiffres. Le relire sur le Kbis.");
  }
  if (!tvaIntraFrValide(emetteur.tvaIntra)) bloquants.push(`N° de TVA de l'émetteur invalide (${emetteur.tvaIntra}).`);

  // Client
  if (!client) {
    bloquants.push('Client introuvable.');
  } else {
    if (!(client.societe || client.nom || '').trim()) bloquants.push('Raison sociale du client absente.');
    if (!client.adresse?.trim() || !client.codePostal?.trim() || !client.ville?.trim()) {
      bloquants.push('Adresse de facturation du client incomplète (adresse, code postal, ville).');
    }
    const etranger = tvaEtrangere(client.tvaIntra);
    const siren = sirenDuClient(client);
    if (f.horsEInvoicing || etranger) {
      avertissements.push(etranger
        ? "Client étranger : hors facture électronique, la vente relèvera de l'e-reporting."
        : "Client sans SIREN (particulier) : hors facture électronique, la vente relèvera de l'e-reporting.");
    } else if (!siren) {
      bloquants.push("SIREN du client absent : renseigner son SIRET ou son n° de TVA sur la fiche client (ou cocher « client sans SIREN » s'il s'agit d'un particulier).");
    } else if (!sirenValide(siren)) {
      bloquants.push(`SIREN du client invalide (${siren}) : vérifier le SIRET de la fiche client.`);
    }
    const siret = chiffres(client.siret);
    if (siret && siret.length !== 14) avertissements.push(`SIRET du client incomplet (${siret.length} chiffres sur 14).`);
    else if (siret && !siretValide(siret)) avertissements.push(`SIRET du client invalide (clé de contrôle) : ${siret}.`);
    const tva = (client.tvaIntra || '').replace(/\s/g, '').toUpperCase();
    if (tva.startsWith('FR') && !tvaIntraFrValide(tva)) {
      bloquants.push(`N° de TVA du client invalide (${tva}).`);
    } else if (tva.startsWith('FR') && siren && tva.slice(4) !== siren) {
      bloquants.push(`Le n° de TVA du client (${tva}) ne correspond pas à son SIRET (SIREN ${siren}).`);
    } else if (!tva && !f.horsEInvoicing) {
      avertissements.push('N° de TVA intracommunautaire du client absent de la fiche.');
    }
    // Adresse de livraison : mention obligatoire quand elle diffère de la facturation.
    const livraisons = (client.adressesLivraison || []).filter(a => a.type === 'livraison');
    if (livraisons.length > 0 && !f.adresseLivraisonFigee && !f.livraisonALaFacturation) {
      avertissements.push("Le client a des adresses de livraison : choisir celle de cette facture, ou indiquer « livré à l'adresse de facturation ».");
    }
  }

  // Contenu
  if (!f.categorieOperation) bloquants.push("Catégorie d'opération à choisir (biens, services, ou les deux).");
  const articles = (f.lignes || []).filter(estArticle);
  if (articles.length === 0 && !(f.fraisPortHT > 0)) bloquants.push('Aucune ligne facturée.');
  if (!(f.totalHT > 0)) bloquants.push('Le total HT doit être positif (un avoir se fait par « Créer un avoir », pas par un montant négatif).');
  if (Math.abs(arrondi(f.totalHT + f.totalTVA) - arrondi(f.totalTTC)) > 0.01) {
    bloquants.push(`Totaux incohérents : HT ${f.totalHT.toFixed(2)} + TVA ${f.totalTVA.toFixed(2)} ≠ TTC ${f.totalTTC.toFixed(2)}.`);
  }
  if (!f.dateEcheance) bloquants.push("Date d'échéance absente (mention obligatoire).");

  // Avoir
  if (f.typeDocument === 'avoir') {
    if (!f.factureOrigineId) bloquants.push("Un avoir doit référencer la facture qu'il corrige.");
    else if (origine && !origine.emiseLe) bloquants.push("La facture d'origine de cet avoir n'est pas émise.");
    else if (origine && f.totalTTC > origine.totalTTC + 0.01) bloquants.push("L'avoir dépasse le montant de la facture d'origine.");
  }

  return { bloquants, avertissements };
}

/** Données du client figées sur la facture à l'émission. */
export function clientFige(c: Client) {
  return {
    nom: c.nom,
    societe: c.societe || null,
    adresse: c.adresse,
    codePostal: c.codePostal,
    ville: c.ville,
    siren: sirenDuClient(c),
    siret: chiffres(c.siret) || null,
    tvaIntra: (c.tvaIntra || '').replace(/\s/g, '').toUpperCase() || null,
  };
}
