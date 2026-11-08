/**
 * nuancierFlowcrete.ts — LES TEINTES FLOWCRETE, PAR TIER, ET LEUR DÉLAI.
 *
 * Transcription du dépliant « Colour Tiers » (ISOFLOOR\FC-Colour-Tiers-Leaflet-Web.pdf).
 * Une teinte n'a pas UN tier : il dépend de la gamme. Le 232 (RAL 7035) est en
 * Tier 1 sur Flowshield SL et en Tier 2 sur Flowseal EPW.
 *
 * ⚠️ **LE DÉLAI EST CELUI DE LA MAISON, PAS CELUI DU DÉPLIANT** (règle du
 * 08/11/2026) : Tier 1 = disponible, Tier 2 = 10 à 15 jours ouvrés. Le dépliant
 * annonce 7 et 14 jours départ usine. Le minimum de commande, lui, est le sien :
 * un kit complet en Tier 1, 100 kg en Tier 2.
 *
 * Le Tier 3 (teintes sur mesure, 500 kg) n'a pas de liste : une teinte absente
 * de cette table n'a ni tier ni délai, on ne lui en invente pas.
 *
 * Une teinte du RAL demandé mais d'une autre gamme ne compte pas : `familles`
 * dit où elle existe. RAL 7037 porte deux codes (222 Goosewing, 234 Dusty) :
 * le Tier 1 est rendu d'abord, et le code reste affiché sur la ligne.
 */

import type { Produit } from './store';

export type FamilleNuancier = 'EPW' | 'FL110' | 'SF41' | 'SL' | 'LXP' | 'DECK';
export type TierTeinte = 1 | 2;

export interface TeinteNuancier {
  tier: TierTeinte;
  code: string;
  ral?: string;
  nom: string;
  familles: FamilleNuancier[];
}

const t = (tier: TierTeinte, code: string, ral: string, nom: string, familles: string): TeinteNuancier => ({
  tier, code, ...(ral ? { ral } : {}), nom, familles: familles.split(' ') as FamilleNuancier[],
});

const TOUTES = 'EPW FL110 SF41 SL LXP DECK';

const NUANCIER: readonly TeinteNuancier[] = [
  t(1, '050', '9003', 'Signal White', 'EPW'),
  t(1, '217', '7044', 'Silk Grey', 'EPW'),
  t(1, '222', '7037', 'Goosewing Grey', 'EPW SF41 SL LXP'),
  t(1, '232', '7035', 'Light Grey', 'FL110 SF41 SL LXP DECK'),
  t(1, '296', '7047', 'Telegrey 4', 'FL110'),
  t(1, '2012', '7040', 'Window Grey', 'FL110 SF41 SL LXP DECK'),
  t(1, '280', '7043', 'Mid Grey', 'EPW SF41 SL LXP DECK'),
  t(1, '281', '', 'Dark Grey', 'DECK'),
  t(1, '326', '1015', 'Sand Beige', 'EPW SF41 SL LXP'),
  t(1, '340', '', 'Pastel Yellow', 'EPW SF41 SL LXP'),
  t(1, '452', '', 'Pastel Blue', 'EPW SF41 SL LXP'),
  t(1, '637', '', 'Tile Red', 'EPW SF41 SL LXP DECK'),
  t(1, '754', '', 'Forest Green', 'DECK'),
  t(1, '740', '', 'Pastel Green', 'EPW SF41 SL LXP'),
  t(1, '920', '4006', 'Traffic Purple', 'DECK'),

  t(2, '004', '9010', 'Pure White', 'EPW'),
  t(2, '209', '7032', 'Pebble Grey', 'EPW SF41 SL LXP DECK'),
  t(2, '217', '7044', 'Silk Grey', 'SF41 SL LXP DECK'),
  t(2, '218', '7004', 'Signal Grey', 'FL110'),
  t(2, '222', '', 'Goosewing Grey', 'DECK'),
  t(2, '232', '7035', 'Light Grey', 'EPW'),
  t(2, '234', '7037', 'Dusty Grey', 'EPW SF41 SL LXP DECK'),
  t(2, '235', '7038', 'Agate Grey', 'EPW FL110 SF41 SL LXP'),
  t(2, '256', '7042', 'Traffic Grey', 'SF41 SL LXP DECK'),
  t(2, '281', '', 'Dark Grey', 'EPW FL110 SF41 SL LXP'),
  t(2, '287', '7001', 'Silver Grey', 'EPW FL110 SF41 SL LXP'),
  t(2, '296', '7047', 'Telegrey 4', 'SF41 SL LXP DECK'),
  t(2, '297', '7045', 'Telegrey 1', 'SF41 SL LXP'),
  t(2, '2009', '7024', 'Graphite Grey', 'DECK'),
  t(2, '2011', '7021', 'Black Grey', 'DECK'),
  t(2, '2012', '7040', 'Window Grey', 'EPW'),
  t(2, '319', '1023', 'Traffic Yellow', 'EPW FL110 SF41 SL LXP'),
  t(2, '321', '1018', 'Zinc Yellow', 'SF41 SL LXP DECK'),
  t(2, '354', '', 'Arabian Yellow', 'EPW DECK'),
  t(2, '466', '5017', 'Traffic Blue', TOUTES),
  t(2, '479', '5015', 'Sky Blue', TOUTES),
  t(2, '605', '3001', 'Signal Red', TOUTES),
  t(2, '606', '3020', 'Traffic Red', TOUTES),
  t(2, '709', '6001', 'Emerald Green', 'FL110 SF41 SL LXP'),
  t(2, '754', '', 'Forest Green', 'EPW FL110 SF41 SL LXP DECK'),
  t(2, '776', '', 'Bright Green', 'DECK'),
  t(2, '990', '9005', 'Jet Black', TOUTES),
];

export const DELAI_TIER: Record<TierTeinte, string> = { 1: 'disponible', 2: '10 à 15 jours ouvrés' };
export const MINIMUM_TIER: Record<TierTeinte, string> = { 1: '1 kit complet', 2: '100 kg' };

type ArticleNuancier = Partial<Pick<Produit, 'reference' | 'description'>> | undefined;

const FAMILLES: readonly [FamilleNuancier, RegExp][] = [
  ['EPW', /flowseal\s*epw/i],
  ['FL110', /flowcoat\s*fl\s*110/i],
  ['SF41', /flowcoat\s*(sf\s*41|sk)\b/i],
  ['LXP', /flowshield\s*lxp/i],
  ['SL', /(peran|flowshield)\s*(sl|tl)\b/i],
  ['DECK', /deckshield.*finish/i],
];

/** La gamme du nuancier que porte un article, si elle en a une. */
export function familleNuancier(article: ArticleNuancier): FamilleNuancier | undefined {
  const nom = `${article?.reference ?? ''} ${article?.description ?? ''}`;
  return FAMILLES.find(([, motif]) => motif.test(nom))?.[0];
}

const deLaFamille = (article: ArticleNuancier): TeinteNuancier[] => {
  const famille = familleNuancier(article);
  return famille ? NUANCIER.filter(e => e.familles.includes(famille)) : [];
};

/** La teinte du RAL demandé, dans la gamme de l'article : le Tier 1 d'abord. */
export function teinteParRal(article: ArticleNuancier, ral: string | undefined): TeinteNuancier | undefined {
  return ral ? deLaFamille(article).find(e => e.ral === ral) : undefined;
}

/** Le code en tête d'un libellé de teinte : « 479 (RAL 5015, Sky Blue) » → « 479 ». */
export function codeDeTeinte(libelle: string | undefined | null): string | undefined {
  return String(libelle || '').trim().match(/^(\d{3,4})\b/)?.[1];
}

/** Le libellé d'option, dans la forme des fiches : « 479 (RAL 5015, Sky Blue) ». */
export const libelleNuancier = (e: TeinteNuancier): string =>
  `${e.code} (${e.ral ? `RAL ${e.ral}, ` : ''}${e.nom})`;

export interface DelaiTeinte {
  tier: TierTeinte;
  delai: string;
  minimum: string;
}

/** Tier et délai d'une teinte choisie sur cet article ; rien si le nuancier ne la porte pas. */
export function delaiDeTeinte(article: ArticleNuancier, libelle: string | undefined | null): DelaiTeinte | undefined {
  const texte = String(libelle || '');
  const code = codeDeTeinte(texte);
  const ral = texte.match(/\bRAL\s*(\d{4})\b/i)?.[1];
  if (!code && !ral) return undefined;
  const candidates = deLaFamille(article);
  const e = code ? candidates.find(x => x.code === code) : candidates.find(x => x.ral === ral);
  return e ? { tier: e.tier, delai: DELAI_TIER[e.tier], minimum: MINIMUM_TIER[e.tier] } : undefined;
}
