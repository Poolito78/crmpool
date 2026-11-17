/**
 * Mélange Flowfast 319 pour une surface de pochoirs — reprise À L'IDENTIQUE
 * du calculateur « Surface Pochoirs » du site isofloor.fr (aide applicateurs,
 * relevé le 17/11/2026). Les deux doivent rendre les mêmes chiffres : un écart
 * entre le site et MonCRM ferait douter des deux. Toute règle changée là-bas
 * se recopie ici.
 *
 * - Surface à couvrir = surface à peindre × 1,10 (marge d'erreur à l'application).
 * - Mélange = surface × consommation (1 kg/m² en Road, 0,8 en Concrete, modifiable).
 * - Le mélange se répartit en résine 319 + catalyseur (% de la résine, lu sur
 *   la courbe température, ici 20 °C → 1,5 %) + pigment (% de la résine) +
 *   charge SNLR / SNLC (× 1,165 ou × 0,504 de la résine).
 * - Kit le plus adapté : la combinaison de kits de charge qui couvre la
 *   charge nécessaire avec le moins de surplus, puis le moins de kits (au plus
 *   3 de chaque petit format, le reste en grand). Le kit fixe alors les
 *   quantités réellement préparées : résine = charge du kit ÷ ratio.
 */

export type GammeFlowfast319 = 'road' | 'concrete';

export interface KitCharge { code: string; kg: number }

export const KITS_CHARGE: Record<GammeFlowfast319, KitCharge[]> = {
  road: [
    { code: 'SNLR-025', kg: 0.291 }, { code: 'SNLR-05', kg: 0.583 }, { code: 'SNLR-1', kg: 1.165 },
    { code: 'SNLR1', kg: 1.455 }, { code: 'SNLR2', kg: 2.91 }, { code: 'SNLR5', kg: 5.825 }, { code: 'SNLR11', kg: 11.65 },
  ],
  concrete: [
    { code: 'SNLC-025', kg: 0.126 }, { code: 'SNLC-05', kg: 0.252 }, { code: 'SNLC-1', kg: 0.504 },
    { code: 'SNLC1', kg: 1.26 }, { code: 'SNLC2', kg: 2.52 }, { code: 'SNLC5', kg: 5.04 },
  ],
};

export const GAMMES_FLOWFAST319: Record<GammeFlowfast319, { libelle: string; charge: string; ratioCharge: number; conso: number }> = {
  road: { libelle: 'Flowfast 319 Road', charge: 'SNLR', ratioCharge: 1.165, conso: 1 },
  concrete: { libelle: 'Flowfast 319 Concrete', charge: 'SNLC', ratioCharge: 0.504, conso: 0.8 },
};

export const PIGMENTS_319 = [
  { pct: 10, libelle: 'Couleur standard 10 %' },
  { pct: 20, libelle: 'Jaune 20 %' },
  { pct: 0, libelle: 'Sans pigment' },
] as const;

export const MARGE_APPLICATION = 1.1;
export const TEMPERATURE_BASE = 20;

/** Catalyseur en % de la résine selon la température (°C), interpolé. */
const COURBE_CATALYSEUR: [number, number][] = [[0, 4], [10, 3], [20, 1.5], [30, 1]];
export function catalyseurPct(t: number): number {
  if (t < 0) return 5;
  for (let i = 0; i < COURBE_CATALYSEUR.length; i++) {
    if (t <= COURBE_CATALYSEUR[i][0]) {
      if (!i) return COURBE_CATALYSEUR[0][1];
      const [t0, p0] = COURBE_CATALYSEUR[i - 1];
      const [t1, p1] = COURBE_CATALYSEUR[i];
      return p0 + (p1 - p0) * (t - t0) / (t1 - t0);
    }
  }
  return COURBE_CATALYSEUR[COURBE_CATALYSEUR.length - 1][1];
}

/** Kits de charge couvrant `besoinKg` : moindre total, puis moins de kits. */
export function kitsPour(besoinKg: number, liste: KitCharge[]): { parts: [KitCharge, number][]; totalKg: number } {
  const tries = [...liste].sort((a, b) => b.kg - a.kg);
  const grand = tries[0];
  const petits = tries.slice(1);
  let meilleur: { tot: number; k: number; cnt: number[]; nb: number } | null = null;
  const cnt: number[] = [];
  const rec = (i: number, somme: number) => {
    if (i === petits.length) {
      const nb = Math.max(0, Math.ceil((besoinKg - somme - 1e-6) / grand.kg));
      const tot = somme + nb * grand.kg;
      const k = nb + cnt.reduce((a, b) => a + b, 0);
      if (!meilleur || tot < meilleur.tot - 1e-6 || (Math.abs(tot - meilleur.tot) < 1e-6 && k < meilleur.k)) {
        meilleur = { tot, k, cnt: cnt.slice(), nb };
      }
      return;
    }
    for (let c = 0; c <= 3; c++) { cnt[i] = c; rec(i + 1, somme + c * petits[i].kg); }
  };
  rec(0, 0);
  const m = meilleur!;
  const parts: [KitCharge, number][] = [];
  if (m.nb) parts.push([grand, m.nb]);
  petits.forEach((x, i) => { if (m.cnt[i]) parts.push([x, m.cnt[i]]); });
  return { parts, totalKg: m.tot };
}

export interface MelangeFlowfast319 {
  surfaceACouvrir: number;
  /** Mélange nécessaire (kg) et sa part de résine. */
  melangeKg: number;
  resineKg: number;
  kits: [KitCharge, number][];
  /** Quantités préparées avec le kit retenu (kg). */
  kit: { resine: number; charge: number; pigment: number; catalyseur: number; total: number };
  /** Surface que couvre le mélange du kit, marge comprise (m²). */
  couvreM2: number;
  catalyseurPct: number;
}

export function melangeFlowfast319(surfaceAPeindre: number, gamme: GammeFlowfast319, pigmentPct: number, conso?: number): MelangeFlowfast319 {
  const G = GAMMES_FLOWFAST319[gamme];
  const rt = conso && conso > 0 ? conso : G.conso;
  const cp = catalyseurPct(TEMPERATURE_BASE);
  const facteur = 1 + cp / 100 + pigmentPct / 100 + G.ratioCharge;
  const surfaceACouvrir = surfaceAPeindre * MARGE_APPLICATION;
  const melangeKg = surfaceACouvrir * rt;
  const resineKg = melangeKg / facteur;
  const { parts, totalKg } = kitsPour(resineKg * G.ratioCharge, KITS_CHARGE[gamme]);
  const resine = totalKg / G.ratioCharge;
  const pigment = resine * pigmentPct / 100;
  const catalyseur = resine * cp / 100;
  return {
    surfaceACouvrir, melangeKg, resineKg, kits: parts,
    kit: { resine, charge: totalKg, pigment, catalyseur, total: resine + pigment + catalyseur + totalKg },
    couvreM2: resine * facteur / rt,
    catalyseurPct: cp,
  };
}

const nf = (n: number, d: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Masse lisible, comme le site : grammes sous le kilo, sinon kg à 2 décimales. */
export function masse(kg: number): string {
  if (kg < 1) { const g = kg * 1000; return `${nf(g, g < 10 ? 1 : 0)} g`; }
  return `${nf(kg, 2)} kg`;
}
