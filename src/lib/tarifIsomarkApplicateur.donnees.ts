/**
 * TARIF NET APPLICATEUR ISOMARK — applicable au 15 juillet 2026.
 *
 * Source : « Tarif Isomark au 15 07 2026.pdf » (VENTES\00 TARIFS CLIENTS
 * One Drive\CATALOGUE), pages 4 à 7 (H1) et 9 à 25 (H2), relu le 23/11/2026. Prix HT,
 * remise déduite : ce que paie l'applicateur.
 *
 * ⚠️ POURQUOI UNE TABLE ET PAS LA REMISE DE GAMME. Les fiches articles portent
 * le public d'Odoo, sans rapport avec ce tarif : SANCY 25 kg est à 210,73 €
 * public sur la fiche et 73,75 € net au tarif (−65 %, pas −50 %). Comparer un
 * prix concurrent net à « public − 50 % » nous faisait paraître 30 à 100 %
 * plus chers qu'en réalité. Le prix du tarif fait foi.
 *
 * Clé = notre référence (les copies LABOFRANCE / ALIZON / seau plastique d'un
 * même produit portent le même prix). ISOMARK TEMPORAIRE (jaune) n'a pas sa
 * ligne au tarif : il se vend au prix de la peinture JAUNE 70205 (règle de
 * l'utilisateur, 23/11/2026). Un article absent de la table (HIMALAYA, RAL
 * hors gamme, ONYX en couleur « nous consulter ») n'a PAS de prix
 * applicateur : on ne le devine pas.
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
  /** kg, litre, unité (pièce, rouleau, boîte au détail) ou m² (pavés). */
  unite: UniteTarif;
}

export type UniteTarif = 'kg' | 'L' | 'u' | 'm²';

const p = (code: string, nom: string, conditionnement: string, prixConditionnement: number, prixUnite: number, unite: UniteTarif = 'kg'): PrixTarifApplicateur =>
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


/* ── H2 : stock usine, unités au carton ─────────────────────────────────
   Le prix à l'unité est celui du tarif (colonne « Tarif unité »), le
   carton celui de la colonne « Tarif carton ». Couleur = blanc + 20 % au
   tarif : seules les lignes chiffrées en couleur y figurent. */
const u = (code: string, nom: string, carton: string, prixCarton: number, prixUnite: number) =>
  p(code, nom, carton, prixCarton, prixUnite, 'u');

const LETTRE_250 = u('73373', 'Lettre / chiffre hauteur 250', 'à l\'unité', 9.30, 9.30);
const LETTRES_250: Record<string, PrixTarifApplicateur> = Object.fromEntries(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ...'0123456789'.split('').map(c => `C${c}`)]
    .map(x => [`THERMO250${x}`, LETTRE_250]));

const TARIF_H2: Record<string, PrixTarifApplicateur> = {
  /* Préfabriqués thermoplastiques — lignes (page 11) */
  'THERMO501000BLANC': u('73405', 'Ligne blanche 50 x 1000', 'carton de 60', 91.20, 1.52),
  'THERMO1001000': u('73338', 'Ligne blanche 100 x 1000', 'carton de 30', 72.60, 2.42),
  'THERMO1201000B': u('73339', 'Ligne blanche 120 x 1000', 'carton de 25', 68.00, 2.72),
  'THERMO1501000': u('73340', 'Ligne blanche 150 x 1000', 'carton de 20', 68.60, 3.43),
  'THERMO1801000': u('73409', 'Ligne blanche 180 x 1000', 'carton de 15', 61.65, 4.11),
  'THERMO2001000': u('73341', 'Ligne blanche 200 x 1000', 'carton de 15', 71.25, 4.85),
  'THERMO2501000': u('73342', 'Ligne blanche 250 x 1000', 'carton de 10', 56.90, 5.69),
  'THERMO3001000': u('73343', 'Ligne blanche 300 x 1000', 'carton de 10', 68.60, 6.86),
  'THERMO3751000': u('73344', 'Ligne blanche 375 x 1000', 'carton de 5', 51.90, 10.38),
  'THERMO5001000': u('73345', 'Ligne blanche 500 x 1000', 'carton de 5', 58.80, 11.76),
  'ROULEAU1005000': u('73410', 'Rouleau blanc 100 x 5000', 'carton de 6', 93.42, 15.57),
  'ROULEAU1205000': u('73411', 'Rouleau blanc 120 x 5000', 'carton de 6', 102.12, 17.02),
  'ROULEAU1505000': u('73412', 'Rouleau blanc 150 x 5000', 'carton de 4', 76.92, 19.23),
  'ROULEAU1005000J': u('73413', 'Rouleau jaune 100 x 5000', 'carton de 6', 112.02, 18.67),
  'ROULEAU1205000J': u('73414', 'Rouleau jaune 120 x 5000', 'carton de 6', 122.52, 20.42),
  'ROULEAU1505000J': u('73415', 'Rouleau jaune 150 x 5000', 'carton de 4', 93.44, 23.36),
  'THERMO1001000JN': u('73346', 'Ligne jaune et noire 100 x 1000', 'carton de 30', 454.50, 15.15),
  'THERMO2501000JN': u('73347', 'Ligne jaune et noire 250 x 1000', 'carton de 10', 209.10, 20.91),
  'THERMO5001000JN': u('73348', 'Ligne jaune et noire 500 x 1000', 'carton de 5', 183.85, 36.77),
  'THERMO1001000J': u('73349', 'Ligne jaune 100 x 1000', 'carton de 30', 85.50, 2.85),
  'LIGNE1001000J': u('73349', 'Ligne jaune 100 x 1000', 'carton de 30', 85.50, 2.85),
  'THERMO1201000J': u('73419', 'Ligne jaune 120 x 1000', 'carton de 25', 75.50, 3.02),
  'THERMOCDP120500': u('73350', 'Cédez le passage 120 x 500', 'carton de 50', 78.00, 1.56),
  'THERMOCDP500500': u('73351', 'Cédez le passage 500 x 500', 'carton de 10', 59.50, 5.95),
  'THERMODAM600600': u('73352', 'Damier 600 x 600', 'carton de 5', 37.15, 7.43),
  /* Flèches (page 11) */
  'THERMOFLE1000215': u('73353', 'Flèche tout droit 1000 x 250', 'carton de 5', 67.05, 13.41),
  'THERMOFLE1600300': u('73354', 'Flèche tout droit 1600 x 300', 'carton de 5', 106.70, 21.34),
  'THERMOFLE2000350': u('73355', 'Flèche tout droit 2000 x 350', 'carton de 5', 122.20, 24.44),
  'THERMOFLE4000700': u('73356', 'Flèche tout droit 4000 x 700', 'carton de 2', 80.18, 40.09),
  'THERMOTFLE10035': u('73357', 'Tête de flèche 1000 x 350', 'carton de 5', 102.75, 20.55),
  'THERMOTAD1600450': u('73359', 'Tourne à droite 1600 x 450', 'carton de 5', 122.20, 24.44),
  'PTTAG1600450': u('73360', 'Tourne à gauche 1600 x 450', 'carton de 5', 122.20, 24.44),
  'THERMOTAD2000500': u('73361', 'Tourne à droite 2000 x 500', 'carton de 5', 138.35, 27.67),
  'PTTAG2000500': u('73362', 'Tourne à gauche 2000 x 500', 'carton de 5', 138.35, 27.67),
  'THERMOTAD40001000': u('73363', 'Tourne à droite 4000 x 1000', 'carton de 2', 85.66, 42.83),
  'PTTAG4000100': u('73364', 'Tourne à gauche 4000 x 1000', 'carton de 2', 85.66, 42.83),
  'THERMOTFLED10042': u('73365', 'Tête de flèche à droite / gauche 1000 x 425', 'carton de 5', 115.00, 23.00),
  'PTTFTAG1000425': u('73366', 'Tête de flèche à gauche 1000 x 425', 'carton de 5', 115.00, 23.00),
  'PTTFTAG2000850': u('73368', 'Tête de flèche à gauche 2000 x 850', 'carton de 2', 71.38, 35.69),
  'THERMOTFLE600860': u('73369', 'Flèche de rabattement 6000 x 860', 'carton de 2', 149.10, 74.55),
  'PTFRG6000860': u('73369', 'Flèche de rabattement 6000 x 860', 'carton de 2', 149.10, 74.55),
  /* Mots (page 11) */
  'THERMOPAYPOS': u('73404', 'Payant positif 1850 x 180', 'carton de 10', 192.50, 19.25),
  'THERMOPAYNEG': u('73403', 'Payant négatif 1850 x 180', 'carton de 10', 196.40, 19.64),
  'THERMOPAYPOS/NEG': u('73400', 'Payant positif + négatif 1850 x 180', 'carton de 5', 194.40, 38.88),
  'THERMOLIVR+': u('73399', 'Livraison positif 5000 x 350', 'à l\'unité', 68.04, 68.04),
  'THERMOLIVR-': u('73401', 'Livraison négatif 5000 x 350', 'à l\'unité', 79.80, 79.80),
  'THERMOLIVR+/-': u('73402', 'Livraison positif + négatif 5000 x 350', 'à l\'unité', 130.20, 130.20),
  /* Lettres, chiffres (page 12) */
  'THERMO150': u('73371', 'Lettre / chiffre hauteur 150', 'à l\'unité', 6.97, 6.97),
  'THERMO200': u('73372', 'Lettre / chiffre hauteur 200', 'à l\'unité', 7.87, 7.87),
  ...LETTRES_250,
  'THERMO300': u('73374', 'Lettre / chiffre hauteur 300', 'à l\'unité', 10.05, 10.05),
  'THERMO400': u('73375', 'Lettre / chiffre hauteur 400', 'à l\'unité', 11.62, 11.62),
  'THERMO500': u('73376', 'Lettre / chiffre hauteur 500', 'à l\'unité', 13.12, 13.12),
  'THERMO800': u('73377', 'Lettre / chiffre hauteur 800', 'à l\'unité', 18.52, 18.52),
  'THERMO1000': u('73378', 'Lettre / chiffre hauteur 1000', 'à l\'unité', 20.85, 20.85),
  'THERMO1500': u('73379', 'Lettre / chiffre hauteur 1500', 'à l\'unité', 27.75, 27.75),
  'THERMO2500': u('73380', 'Lettre / chiffre hauteur 2500', 'à l\'unité', 38.61, 38.61),
  'THERMO3000': u('73381', 'Lettre / chiffre hauteur 3000', 'à l\'unité', 46.49, 46.49),
  'THERMO4000': u('73382', 'Lettre / chiffre hauteur 4000', 'à l\'unité', 50.10, 50.10),
  'THERMOBUS2000300': u('73320', '« Bus » ville de Paris 2000 x 3000', 'à l\'unité', 119.00, 119.00),
  /* Symboles (page 12) */
  'THERMOHAN300250': u('73316', 'Pictogramme handicapé 300 x 250', 'carton de 30', 189.00, 6.30),
  'THERMOHAN600500': u('73317', 'Pictogramme handicapé 600 x 500', 'carton de 10', 98.80, 9.88),
  'THERMOHAN12001000': u('73321', 'Pictogramme handicapé 1200 x 1000', 'carton de 5', 78.40, 15.68),
  'THERMOPIET1000': u('73387', 'Piéton hauteur 1000', 'carton de 5', 84.75, 16.95),
  'THERMOFAM250300': u('73389', 'Famille 250 x 300', 'carton de 10', 118.70, 11.87),
  'THERMOFAM230250': u('73390', 'Famille 2300 x 2500', 'à l\'unité', 134.10, 134.10),
  'THERMOCHE': u('73391', 'Paire de chevrons 760 x 900 x 120', 'carton de 5', 70.00, 14.00),
  'THERMORENCONTRE': u('—', 'Zone de rencontre (piéton + vélo + voiture)', 'à l\'unité', 195.90, 195.90),
  /* Signaux A / AB, B, C / CE (page 13) */
  'MARQTAAB10002000': u('73334', 'Signal type A / AB 1000 x 2000', 'à l\'unité', 193.23, 193.23),
  'MARQTAAB10002500': u('73335', 'Signal type A / AB 1000 x 2500', 'à l\'unité', 220.07, 220.07),
  'MARQTAAB20004000': u('73336', 'Signal type A / AB 2000 x 4000', 'à l\'unité', 286.96, 286.96),
  'MARQTB450': u('73323', 'Signal type B Ø 450', 'carton de 2', 126.18, 63.09),
  'MARQTB650': u('73310', 'Signal type B Ø 650', 'carton de 2', 140.08, 70.04),
  'MARQTB750': u('73324', 'Signal type B Ø 750', 'carton de 2', 148.40, 74.20),
  'MARQTB850': u('73313', 'Signal type B Ø 850', 'carton de 2', 157.20, 78.60),
  'MARQTB1050': u('73302', 'Signal type B Ø 1050', 'à l\'unité', 87.36, 87.36),
  'MARQTB2000': u('73326', 'Signal type B Ø 2000', 'à l\'unité', 253.40, 253.40),
  'MARQTB20003000': u('73327', 'Signal type B 2000 x 3000', 'à l\'unité', 295.60, 295.60),
  'MARQTB20004000': u('73328', 'Signal type B 2000 x 4000', 'à l\'unité', 399.00, 399.00),
  'MARQTCCE700700': u('73329', 'Signal type C / CE 700 x 700', 'à l\'unité', 67.05, 67.05),
  'MARQTCCE700700.C6': u('73329', 'Signal type C / CE 700 x 700', 'à l\'unité', 67.05, 67.05),
  'MARQTCCE12001500': u('73330', 'Signal type C / CE 1200 x 1500', 'à l\'unité', 135.20, 135.20),
  'MARQTCCE12002000': u('73331', 'Signal type C / CE 1200 x 2000', 'à l\'unité', 193.20, 193.20),
  'MARQTCCE20002000': u('73332', 'Signal type C / CE 2000 x 2000', 'à l\'unité', 275.00, 275.00),
  'MARQTCCE12002400': u('73333', 'Signal type C / CE 1200 x 2400', 'à l\'unité', 236.90, 236.90),
  'MARQTCCE20004000': u('73337', 'Signal type C / CE 2000 x 4000', 'à l\'unité', 470.00, 470.00),
  /* Clous de chaussée et podotactiles (page 9) — prix de 1 à 100 u */
  'CLOUBRI80': u('75701', 'Clou inox brillant Ø 80', 'à l\'unité', 11.64, 11.64),
  'CLOUBRI100': u('75702', 'Clou inox brillant Ø 100', 'à l\'unité', 14.38, 14.38),
  'CLOUBRI120': u('75703', 'Clou inox brillant Ø 120', 'à l\'unité', 19.26, 19.26),
  'CLOUBRI150': u('75704', 'Clou inox brillant Ø 150', 'à l\'unité', 23.72, 23.72),
  'CLOUBRI200': u('75705', 'Clou inox brillant Ø 200', 'à l\'unité', 37.65, 37.65),
  'CLOUBRO100': u('75707', 'Clou inox brossé Ø 100', 'à l\'unité', 11.50, 11.50),
  'CLOUBRO120': u('75708', 'Clou inox brossé Ø 120', 'à l\'unité', 15.05, 15.05),
  'CLOUBRO150': u('75709', 'Clou inox brossé Ø 150', 'à l\'unité', 18.98, 18.98),
  'CLOUBRO200': u('75710', 'Clou inox brossé Ø 200', 'à l\'unité', 30.12, 30.12),
  'CLOUACIERZB': u('76132', 'Clou podotactile acier zingué blanc à sceller', 'boîte de 250', 125.00, 0.50),
  'CLOUACIERZN': u('76133', 'Clou podotactile acier zingué noir à sceller', 'boîte de 250', 130.00, 0.55),
  'CLOUA2304': u('76134', 'Clou podotactile inox A2 304 passivé à sceller', 'boîte de 216', 147.50, 0.68),
  'CLOUINOXA4316L': u('76135', 'Clou podotactile inox A4 316L à sceller', 'boîte de 250', 250.02, 1.00),
  'IZICNOIRINOX': u('76128', "Iso'CLOU polymère noir / inox", 'boîte de 250', 172.20, 0.69),
  'IZICNOIR': u('76130', "Iso'CLOU polymère noir", 'boîte de 250', 112.70, 0.45),
  'IZICGRIS': u('76131', "Iso'CLOU polymère gris", 'boîte de 250', 112.70, 0.45),
  'CLOUACIERZBVIS': u('76148', 'Clou podotactile acier zingué blanc à visser', 'boîte de 250', 385.00, 1.54),
  'CLOUACIERZNVIS': u('76149', 'Clou podotactile acier zingué noir à visser', 'boîte de 250', 405.00, 1.62),
  'CLOUA2304VIS': u('76150', 'Clou podotactile inox A2 304 à visser', 'boîte de 250', 570.00, 2.28),
  /* Bandes d'éveil de la vigilance (pages 22-23) — prix au carton */
  'BEVGRANITE': u('76113', 'BEV granitée 610 x 420', 'carton de 10', 168.00, 16.80),
  'BEVGRANITEC': u('76114', 'BEV granitée 610 x 420 couleur', 'carton de 10', 168.00, 16.80),
  'BEVGRANITEADHB': u('76115', 'BEV granitée souple adhésive 610 x 420', 'carton de 10', 229.50, 22.95),
  'BEVGRANITEADHC': u('76116', 'BEV granitée souple adhésive 610 x 420 couleur', 'carton de 10', 229.50, 22.95),
  'BEVBLANCHE': u('76122', 'BEV polyuréthane adhésive intérieur blanche 815 x 400', 'carton de 10', 461.70, 46.17),
  'BEVNOIRE': u('76123', 'BEV polyuréthane adhésive intérieur noire 815 x 400', 'carton de 10', 461.70, 46.17),
  'BEVGRISE': u('76124', 'BEV polyuréthane adhésive intérieur grise 815 x 400', 'carton de 10', 461.70, 46.17),
  /* Bandes d'aide à l'orientation (pages 24-25) — prix au carton */
  'GUIDMARK3BLANC': u('76210', "Guid'MARK 3 rails 1000 x 170", 'carton de 10', 159.50, 15.95),
  'GUIDMARK3ADH': u('76211', "Guid'MARK 3 rails 1000 x 170 adhésive", 'carton de 10', 202.40, 20.24),
  'GUIDMARK4BLANC': u('76235', "Guid'MARK 4 rails 1000 x 210", 'carton de 10', 192.00, 19.20),
  'GUIDMARK4ADH': u('76236', "Guid'MARK 4 rails 1000 x 210 adhésive", 'carton de 10', 244.00, 24.40),
  'GUIDGRIP4BLANC': u('76200', "Guid'GRIP 4 rails 1000 x 210 blanche", 'carton de 15', 299.10, 19.94),
  'GUIDGRIP4BLANCADH': u('76202', "Guid'GRIP 4 rails 1000 x 210 blanche adhésive", 'carton de 15', 376.50, 25.10),
  'GUIDGRIP4NOIR': u('76204', "Guid'GRIP 4 rails 1000 x 210 noire", 'carton de 15', 359.25, 23.95),
  'GUIDGRIP4GRIS': u('76205', "Guid'GRIP 4 rails 1000 x 210 grise", 'carton de 15', 359.25, 23.95),
  'GUIDGRIP4NOIRADH': u('76206', "Guid'GRIP 4 rails 1000 x 210 noire adhésive", 'carton de 15', 436.50, 29.10),
  'GUIDGRIP4GRISADH': u('76207', "Guid'GRIP 4 rails 1000 x 210 grise adhésive", 'carton de 15', 436.50, 29.10),
  'BAOGRANITE3.NOIR': u('76209', 'BAO granitée 4 rails 1000 x 220', 'carton de 10', 209.50, 20.95),
  'BAOGRANITE3ADH.GRISE': u('—', 'BAO granitée 3 rails 1000 x 170 adhésive', 'carton de 10', 246.70, 24.67),
  'BAOGRANITE3ADH.NOIR': u('—', 'BAO granitée 3 rails 1000 x 170 adhésive', 'carton de 10', 246.70, 24.67),
  'BAO3NXLEVO': u('76214', "Iso'RAIL BAO 3 bandes 3NXL Evo (rouleau 10 ml)", 'carton de 5 rouleaux', 293.00, 58.60),
  'BAO4BANDESB50EVO': u('76234', "Iso'RAIL BAO 4 bandes 4NXL Evo (rouleau 10 ml)", 'carton de 4 rouleaux', 294.80, 73.70),
  'BAOADH3B': u('76219', 'BAO polyuréthane adhésive 3 nervures 625 x 150 blanche', 'carton de 15', 293.85, 19.59),
  'BAOADH3N': u('76220', 'BAO polyuréthane adhésive 3 nervures 625 x 150 noire', 'carton de 15', 293.85, 19.59),
  'BAOADH4B': u('76221', 'BAO polyuréthane adhésive 4 nervures 1000 x 220 blanche', 'carton de 15', 735.75, 49.05),
  'BAOADH4N': u('76222', 'BAO polyuréthane adhésive 4 nervures 1000 x 220 noire', 'carton de 15', 735.75, 49.05),
  'IZIGUIDE3N': u('76223', "Iso'GUIDE 3 bandes adhésives 420 x 180 noir", 'carton de 24', 357.70, 14.90),
  'IZIGUIDE3': u('76224', "Iso'GUIDE 3 bandes adhésives 420 x 180 gris", 'carton de 24', 357.70, 14.90),
  'IZIGUIDE4N': u('76225', "Iso'GUIDE 4 bandes adhésives 425 x 240 noir", 'carton de 20', 378.00, 18.90),
  'IZIGUIDE4': u('76226', "Iso'GUIDE 4 bandes adhésives 425 x 240 gris", 'carton de 20', 378.00, 18.90),
  /* Granulats routiers, sac de 25 kg (page 19) */
  'QUARTZJAUNE0.4-0.8': p('74227', 'Quartz jaune HN 0,4-0,8', 'sac 25 kg', 16.00, 0.64),
  'QUARTZJAUNE0.5-1.25': p('74210', 'Quartz jaune PG2 0,5-1,25', 'sac 25 kg', 19.75, 0.79),
  'QUARTZCLAIR1-/2.5': p('74211', 'Quartz jaune / clair HN 1-2,5', 'sac 25 kg', 16.00, 0.64),
  'QUARTZJAUNE2-4': p('74213', 'Quartz jaune HN 2-4', 'sac 25 kg', 19.50, 0.78),
  'QUARTZGRI0.7-1.3': p('74206', 'Quartz gris clair TG2 0,7-1,3', 'sac 25 kg', 16.00, 0.64),
  'QUARTZGRIS1-2.5': p('74207', 'Quartz gris clair 1-2,5', 'sac 25 kg', 16.00, 0.64),
  'QUARTZGRIS2-4': p('74208', 'Quartz gris clair 2-4', 'sac 25 kg', 16.00, 0.64),
  'GRANITEGRIS58': p('74228', 'Granit Granoflour gris 5-8', 'sac 25 kg', 16.00, 0.64),
  /* Pavés synthétiques à coller, au m² par tranche (page 18) — 10x20 hors tarif */
  'PAVPREF101030': p('73501', 'Pavés 10 x 10 (< 30 m²)', 'au m²', 47.50, 47.50, 'm²'),
  'PAVPREF101031': p('73501', 'Pavés 10 x 10 (31 à 100 m²)', 'au m²', 46.00, 46.00, 'm²'),
  'PAVPREF1010101': p('73501', 'Pavés 10 x 10 (101 à 300 m²)', 'au m²', 42.40, 42.40, 'm²'),
  'PAVPREF151530': p('73502', 'Pavés 15 x 15 (< 30 m²)', 'au m²', 47.50, 47.50, 'm²'),
  'PAVPREF151531': p('73502', 'Pavés 15 x 15 (31 à 100 m²)', 'au m²', 46.00, 46.00, 'm²'),
  'PAVPREF1515101': p('73502', 'Pavés 15 x 15 (101 à 300 m²)', 'au m²', 42.40, 42.40, 'm²'),
  'PAVPREF152030': p('73503', 'Pavés 15 x 20 (< 30 m²)', 'au m²', 47.50, 47.50, 'm²'),
  'PAVPREF152031': p('73503', 'Pavés 15 x 20 (31 à 100 m²)', 'au m²', 46.00, 46.00, 'm²'),
  'PAVPREF1520101': p('73503', 'Pavés 15 x 20 (101 à 300 m²)', 'au m²', 42.40, 42.40, 'm²'),
  'ECLIPSE25': p('72301', 'Colle Eclipse', 'seau 25 kg', 99.50, 3.98),
  'SILICE0409': p('74216', 'Silice 0,4/0,9 épaississant colle', 'sac 25 kg', 19.50, 0.78),
  /* Catalyseur MMA (pages 17 et 19) */
  'CATALYST2': p('77125', 'Catalyst', 'sachet 2 kg', 74.00, 37.00),
};

export const TARIF_ISOMARK_APPLICATEUR: Record<string, PrixTarifApplicateur> = {
  ...TARIF_H2,
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
  /* Temporaire jaune : au prix de la JAUNE (règle du 23/11/2026). */
  'PSTTEMPO25P ISO': JAUNE25,
  'PSTTEMPO25PLABO': JAUNE25,
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
