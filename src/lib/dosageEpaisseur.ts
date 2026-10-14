/**
 * LE DOSAGE D'UN MORTIER SELON L'ÉPAISSEUR (Flowfast F1 Mortar).
 *
 * Fiche produit Flowfast F1 Mortar (Tremco CPG, 11/2021) : le mortier se
 * consomme à 2,12 kg/m² PAR MM d'épaisseur, et au-delà de 6 mm il se charge de
 * quartz, PAR KIT (poudre 17,8 kg + liquide 2,2 kg), selon un tableau à
 * paliers — l'épaisseur du palier est une épaisseur MINIMALE :
 *
 *   6 mm   : kit seul
 *   25 mm  : + 8 kg sable de quartz 2-8
 *   50 mm  : + 3 kg 2-8 + 12 kg agrégat 8-16
 *   120 mm : + 4,8 kg 2-8 + 6,4 kg 8-16 + 8 kg 16-32
 *
 * Le palier retenu est donc le plus épais dont le minimum est atteint (30 mm
 * → mélange 25 mm). Sous le premier, rien ne se calcule : la fiche interdit
 * moins de 6 mm.
 *
 * ⚠️ LES 2,12 kg/m²/mm VALENT POUR LE MÉLANGE ENTIER, granulats compris : la
 * part du KIT est la masse du kit sur celle du mélange (20 / 28 à 25 mm). La
 * ligne de l'article reçoit cette conso en kg/m² — la quantité en kits suit
 * par le calcul ordinaire (surface × conso / poids du kit).
 *
 * LES GRANULATS SUIVENT LES KITS, PAS LA SURFACE : la fiche dose par kit et
 * recommande de toujours gâcher un kit complet. 5 kits à 25 mm = 40 kg de
 * 2-8, même si la surface n'en demandait que 4,5.
 *
 * Le dosage vit sur l'article (`Produit.dosageEpaisseur`, colonne jsonb
 * `dosage_epaisseur`), l'épaisseur sur la ligne du devis
 * (`LigneDevis.epaisseurMm`) ; une ligne de granulat se rattache à sa ligne
 * de mortier par `LigneDevis.granulatDe`.
 */

export interface AjoutDosage {
  /** « Sable de quartz 2-8 mm » — sert aussi de clé pour rattacher la ligne du devis. */
  libelle: string;
  kgParKit: number;
  /** Article du catalogue, s'il existe. Absent = ligne libre, prix à saisir. */
  produitId?: string;
}

export interface PalierDosage {
  /** Épaisseur MINIMALE à partir de laquelle ce mélange s'applique, en mm. */
  epaisseurMinMm: number;
  ajouts: AjoutDosage[];
}

export interface DosageEpaisseur {
  /** Consommation du mélange, en kg/m² par mm d'épaisseur. */
  kgM2ParMm: number;
  paliers: PalierDosage[];
  /** D'où viennent les chiffres (fiche, date) — affiché, jamais calculé. */
  source?: string;
}

export interface CalculDosage {
  epaisseurMm: number;
  palier: PalierDosage;
  /** Mélange entier, kg/m². */
  kgM2Melange: number;
  /** Part du kit (l'article de la ligne), kg/m² — la conso posée sur la ligne. */
  consoKitKgM2: number;
  ajouts: (AjoutDosage & { kgM2: number })[];
}

const arrondi = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Le dosage tel que lu en base : `undefined` s'il est illisible (pas de conso, pas de palier). */
export function lireDosage(v: unknown): DosageEpaisseur | undefined {
  const o = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!o || typeof o !== 'object') return undefined;
  const d = o as Partial<DosageEpaisseur>;
  if (!(Number(d.kgM2ParMm) > 0) || !Array.isArray(d.paliers) || !d.paliers.length) return undefined;
  return {
    kgM2ParMm: Number(d.kgM2ParMm),
    paliers: d.paliers
      .filter(p => p && Number(p.epaisseurMinMm) > 0)
      .map(p => ({
        epaisseurMinMm: Number(p.epaisseurMinMm),
        ajouts: (p.ajouts ?? []).filter(a => a?.libelle?.trim() && Number(a.kgParKit) > 0)
          .map(a => ({ libelle: a.libelle.trim(), kgParKit: Number(a.kgParKit), ...(a.produitId ? { produitId: a.produitId } : {}) })),
      }))
      .sort((a, b) => a.epaisseurMinMm - b.epaisseurMinMm),
    ...(d.source ? { source: d.source } : {}),
  };
}

/** Le mélange qui s'applique à cette épaisseur : le plus épais dont le minimum est atteint. */
export function palierPour(d: DosageEpaisseur, epaisseurMm: number): PalierDosage | null {
  let retenu: PalierDosage | null = null;
  for (const p of d.paliers) if (epaisseurMm >= p.epaisseurMinMm) retenu = p;
  return retenu;
}

/** Épaisseur minimale admise par la fiche (premier palier). */
export const epaisseurMinimale = (d: DosageEpaisseur) => d.paliers[0]?.epaisseurMinMm ?? 0;

/**
 * Conso du kit et des granulats pour une épaisseur. `null` sous l'épaisseur
 * minimale, ou sans poids de kit — on ne devine pas la part du kit.
 */
export function calculerDosage(d: DosageEpaisseur, kitKg: number | undefined, epaisseurMm: number): CalculDosage | null {
  if (!(kitKg && kitKg > 0) || !(epaisseurMm > 0)) return null;
  const palier = palierPour(d, epaisseurMm);
  if (!palier) return null;
  const kgAjouts = palier.ajouts.reduce((s, a) => s + a.kgParKit, 0);
  const kgM2Melange = d.kgM2ParMm * epaisseurMm;
  const parKgMelange = kgM2Melange / (kitKg + kgAjouts);
  return {
    epaisseurMm,
    palier,
    kgM2Melange: arrondi(kgM2Melange),
    consoKitKgM2: arrondi(kitKg * parKgMelange),
    ajouts: palier.ajouts.map(a => ({ ...a, kgM2: arrondi(a.kgParKit * parKgMelange) })),
  };
}

/** Kilos d'un granulat pour un nombre de kits : la fiche dose par kit gâché. */
export function kgGranulat(kits: number, kgParKit: number): number {
  return arrondi((kits || 0) * kgParKit, 2);
}

/** L'usage affiché sur la ligne du mortier (info-bulle de la conso). */
export function usageEpaisseur(c: CalculDosage): string {
  const mm = (n: number) => String(n).replace('.', ',');
  return c.palier.epaisseurMinMm === c.epaisseurMm
    ? `Épaisseur ${mm(c.epaisseurMm)} mm`
    : `Épaisseur ${mm(c.epaisseurMm)} mm (mélange ${mm(c.palier.epaisseurMinMm)} mm)`;
}

/** Désignation d'une ligne de granulat sans article. */
export function libelleGranulat(a: AjoutDosage, epaisseurMm: number): string {
  const n = (x: number) => String(x).replace('.', ',');
  return `${a.libelle} (charge du mortier ép. ${n(epaisseurMm)} mm : ${n(a.kgParKit)} kg par kit)`;
}

/** Le libellé a-t-il été posé par `libelleGranulat` (donc à suivre quand l'épaisseur change) ? */
export const libelleGranulatAuto = (description: string, a: Pick<AjoutDosage, 'libelle'>) =>
  description.startsWith(`${a.libelle} (charge du mortier ép. `);

/** Quantité d'une ligne de granulat : kilos (ligne libre) ou contenants entiers de l'article. */
export function quantiteGranulat(kits: number, a: AjoutDosage, poidsArticle?: number): number {
  const kg = kgGranulat(kits, a.kgParKit);
  return poidsArticle && poidsArticle > 0 ? Math.ceil(kg / poidsArticle - 1e-9) : kg;
}

/** Les « consommations par usage » de la fiche, déduites du tableau : un usage par palier, à son épaisseur minimale. */
export function consommationsParPalier(d: DosageEpaisseur, kitKg: number): { valeur: number; usage: string }[] {
  const n = (x: number) => String(x).replace('.', ',');
  return d.paliers.flatMap(p => {
    const c = calculerDosage(d, kitKg, p.epaisseurMinMm);
    if (!c) return [];
    const charge = p.ajouts.length
      ? ` — chargé : + ${p.ajouts.map(a => `${n(a.kgParKit)} kg ${a.libelle.replace(/^(sable|agrégat) de quartz /i, '')}`).join(' + ')} par kit`
      : ' — mortier seul';
    return [{ valeur: c.consoKitKgM2, usage: `Épaisseur ${n(p.epaisseurMinMm)} mm${charge}` }];
  });
}
