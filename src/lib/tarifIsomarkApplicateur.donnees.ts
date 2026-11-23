/**
 * TARIF NET APPLICATEUR ISOMARK — applicable au 15 juillet 2026.
 *
 * Source : « Tarif Isomark au 15 07 2026.pdf » (VENTES\00 TARIFS CLIENTS
 * One Drive\CATALOGUE), pages 4 à 7 et 19, relu le 23/11/2026. Prix HT,
 * remise déduite : ce que paie l'applicateur.
 *
 * ⚠️ POURQUOI UNE TABLE ET PAS LA REMISE DE GAMME. Les fiches articles portent
 * le public d'Odoo, sans rapport avec ce tarif : SANCY 25 kg est à 210,73 €
 * public sur la fiche et 73,75 € net au tarif (−65 %, pas −50 %). Comparer un
 * prix concurrent net à « public − 50 % » nous faisait paraître 30 à 100 %
 * plus chers qu'en réalité. Le prix du tarif fait foi.
 *
 * Clé = notre référence (les copies LABOFRANCE / ALIZON / seau plastique d'un
 * même produit portent le même prix). Un article absent de la table (ISOMARK
 * TEMPORAIRE, HIMALAYA, RAL hors gamme, ONYX en couleur « nous consulter »)
 * n'a PAS de prix applicateur : on ne le devine pas.
 *
 * `prixUnite` = colonne « Prix kg » / « Tarif €/litre » du tarif, recopiée
 * telle quelle (l'enduit à froid y est compté sur 8 kg, la fiche dit 7,85).
 */

export interface PrixTarifApplicateur {
  /** Code du tarif ISOMARK (70109…). */
  code: string;
  /** Nom au tarif. */
  nom: string;
  conditionnement: string;
  /** Prix net du conditionnement (seau, sac, bidon). */
  prixConditionnement: number;
  /** Prix net à l'unité de mesure. */
  prixUnite: number;
  unite: 'kg' | 'L';
}

const p = (code: string, nom: string, conditionnement: string, prixConditionnement: number, prixUnite: number, unite: 'kg' | 'L' = 'kg'): PrixTarifApplicateur =>
  ({ code, nom, conditionnement, prixConditionnement, prixUnite, unite });

const SANCY = p('70109', 'SANCY', 'seau 25 kg', 73.75, 2.95);
const OLYMPE25 = p('70107', 'OLYMPE', 'seau 25 kg', 73.75, 2.95);
const JAUNE25 = p('70205', 'JAUNE', 'seau 25 kg', 109.00, 4.36);
const NOIR25 = p('70209', 'NOIR 9017', 'seau 25 kg', 98.75, 3.95);
const BLEU25 = p('70201', 'BLEU 5012', 'seau 25 kg', 98.75, 3.95);
const ROUGE25 = p('70216', 'ROUGE 3020', 'seau 25 kg', 113.75, 4.55);
const VERT25 = p('70220', 'VERT 6024', 'seau 25 kg', 113.75, 4.55);
const COULEUR5 = (nom: string) => p('70206', nom, 'seau 5 kg', 38.00, 7.60);
const EAU_COULEUR = p('70402', 'ISOMARK EAU COULEUR', 'seau 25 kg', 194.00, 7.76);
const ENDUIT_COULEUR = (code: string, nom: string) => p(code, nom, 'seau 8 kg', 37.50, 4.69);
const EVEREST = p('72202', 'EVEREST', 'seau 8 kg', 34.95, 4.37);

export const TARIF_ISOMARK_APPLICATEUR: Record<string, PrixTarifApplicateur> = {
  /* Peinture blanche H1 (page 4) */
  'PSTSANCY25': SANCY,
  'PSTSANCY25LABO': SANCY,
  'PSTOLYMPE25P ISO': OLYMPE25,
  'PSTOLYMPE5 ISO': p('70108', 'OLYMPE', 'seau 5 kg', 38.00, 7.60),
  'PSTANDES25P ISO': p('70101', 'ANDES', 'seau 25 kg', 89.50, 3.58),
  /* Peinture couleur H1 (page 4) */
  'PSTJAUNE25P ISO': JAUNE25,
  'PSTJAUNE25PLABO': JAUNE25,
  'PSTJAUNE25PALIZON': JAUNE25,
  'PSTJAUNE5 ISO': COULEUR5('JAUNE'),
  'PSTNOIRE25P ISO': NOIR25,
  'PSTNOIRE25PLABO': NOIR25,
  'PSTNOIRE5 ISO': COULEUR5('NOIR'),
  'PSTBLEU25P ISO': BLEU25,
  'PSTBLEU25PLABO': BLEU25,
  'PSTBLEU5 ISO': COULEUR5('BLEU'),
  'PSTROUGE25P ISO': ROUGE25,
  'PSTROUGE25PLABO': ROUGE25,
  'PSTROUGE5 ISO': COULEUR5('ROUGE'),
  'PSTVERT25P ISO': VERT25,
  'PSTVERT25PLABO': VERT25,
  'PSTVERT5 ISO': COULEUR5('VERT'),
  /* Peinture à l'eau H1 (page 4) */
  'PAOVOSGES25P ISO': p('70301', 'VOSGES', 'seau 25 kg', 93.75, 3.75),
  'PAOJAUNE25 ISO': EAU_COULEUR,
  'PAOBLEU25P ISO': EAU_COULEUR,
  'PAONOIRE25P ISO': EAU_COULEUR,
  'PAOROUGE25P ISO': EAU_COULEUR,
  'PAOVERT25P ISO': EAU_COULEUR,
  /* Microbilles H1, sac de 25 kg (pages 4 et 7) */
  'MB3B2TAC90': p('74513', '600-125 AC90', 'sac 25 kg', 36.50, 1.46),
  'MBG-425-125 AC13': p('74511', 'G 425-125 AC13', 'sac 25 kg', 37.60, 1.50),
  'MBGV600125': p('74501', '600-125 SRT SBP ECO', 'sac 25 kg', 36.50, 1.46),
  'MBG3B2TAC07': p('74503', 'G 600-125 AC07', 'sac 25 kg', 36.50, 1.46),
  'MBGEM500': p('74506', 'Grains verre GEM 500', 'sac 25 kg', 36.60, 1.46),
  /* Primaire, vernis, diluant H1 (pages 5 et 7) — au litre */
  'PRIMACRYL5': p('70701', "Prim'MARK ACRYL", 'bidon 5 L', 54.50, 10.90, 'L'),
  'VERNIMARK': p('70702', "Vernis'MARK", 'bidon 5 L', 69.75, 13.95, 'L'),
  'DILACETYL30': p('70815', 'DILUANT Acétyl', 'bidon 30 L', 119.70, 3.99, 'L'),
  'DILACETYL5': p('70802', 'DILUANT Acétyl', 'bidon 5 L', 41.70, 8.34, 'L'),
  'PRIMARK5L': p('71102', "Prim'MARK THERMO", 'bidon 5 L', 44.00, 8.80, 'L'),
  /* Enduit à froid H1, seau de 8 kg durcisseur compris (page 6) */
  'EAFARAVIS8ISO': p('72211', 'ARAVIS', 'seau 8 kg', 31.80, 3.98),
  'EAFEVEREST8 ISO': EVEREST,
  'EAFEVEREST8PL': EVEREST,
  'EAFJAUNE8 ISO': ENDUIT_COULEUR('72210', 'JAUNE 1023'),
  'EAFNOIRE8 ISO': ENDUIT_COULEUR('72213', 'NOIR'),
  'EAFBLEU8 ISO': ENDUIT_COULEUR('72221', 'BLEU 5012'),
  'EAFOCRE8 ISO': ENDUIT_COULEUR('72215', 'OCRE CLAIR'),
  'EAFVERT8 ISO': ENDUIT_COULEUR('72219', 'VERT 6024'),
  'EAFROUGE8 ISO': ENDUIT_COULEUR('72217', 'ROUGE 3020'),
  'ELONYXNEUTRE': p('72238', 'ONYX NEUTRE', 'seau 15 kg', 89.50, 5.97),
  /* Enduit thermoplastique H1, sac de 20 kg (page 7) */
  'EACTHANATOS20': p('71005', 'Thermolit THANATOS', 'sac 20 kg', 27.20, 1.36),
  'EACMERCURE20': p('71003', 'Thermolit MERCURE', 'sac 20 kg', 30.80, 1.54),
  'EACMERCURE15.2': p('71004', 'Thermolit MERCURE 15.2', 'sac 20 kg', 33.80, 1.69),
  /* Résines gravillonnées (page 19) */
  'EAFGRAN20 ISO': p('72308', "Granu'MARK", 'seau 20 kg', 68.40, 3.42),
  'EAFEMERAUDE20': p('72313', 'EMERAUDE', 'seau 20 kg', 69.80, 3.49),
  'KIT.DIAMANT.28KG': p('72309', 'DIAMANT', 'kit 28 kg', 105.75, 3.78),
};

/** Date du tarif, affichée avec chaque prix. */
export const DATE_TARIF_ISOMARK = '15/07/2026';

export function tarifApplicateurDe(reference: string | undefined): PrixTarifApplicateur | undefined {
  return reference ? TARIF_ISOMARK_APPLICATEUR[reference.trim().toUpperCase()] : undefined;
}
