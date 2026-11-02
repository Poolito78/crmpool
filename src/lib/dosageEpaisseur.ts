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
 * PRODUIT SIMPLE DOSÉ À L'ÉPAISSEUR (Flowbuild Cove F…) : une conso par mm,
 * sans palier ni granulat. La conso de la ligne est alors la conso par mm ×
 * l'épaisseur — au m² (`kgM2ParMm`) et/ou au ml (`kgMlParMm`), sans poids de
 * kit nécessaire. Le palier implicite part de 0 mm.
 *
 * RATIO DE CHARGE (1:5, 1:7…) : la conso par mm dépend de la charge gâchée
 * avec le produit. Chaque ratio porte sa conso par mm (m², ml) ; la ligne du
 * devis choisit le sien (`LigneDevis.ratioCharge`, le premier par défaut), qui
 * remplace la conso par mm de base. La fiche technique la donne parfois pour
 * la CHARGE (ISGB1 à 1:5 : 1,77 kg/m²/mm) ou pour le MÉLANGE : `consoDe` le
 * dit, et la conso du produit s'en déduit par les parts (÷ 5, ÷ 6 à 1:5).
 *
 * LA CHARGE DU RATIO (`DosageEpaisseur.charge`) : 1:5 = 5 kg de charge par kg
 * de produit, en poids. Elle suit les kits comme un granulat (kit gâché
 * entier) : kits × poids du kit × 5. Ligne rattachée par `granulatDe`, sous
 * le libellé de la charge — changer de ratio garde la ligne, sa quantité suit.
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
  /** Charge d'un ratio (« 1:5 ») plutôt que granulat d'un palier : seul le libellé de la ligne libre change. */
  ratio?: string;
}

export interface PalierDosage {
  /** Épaisseur MINIMALE à partir de laquelle ce mélange s'applique, en mm. */
  epaisseurMinMm: number;
  ajouts: AjoutDosage[];
}

/** De quoi est la conso saisie pour un ratio : du produit (défaut), de la charge, ou du mélange des deux. */
export type ConsoDe = 'produit' | 'charge' | 'melange';

export interface RatioCharge {
  /** « 1:5 » — clé du choix retenu sur la ligne du devis. */
  libelle: string;
  /** Conso à ce ratio, en kg/m² par mm — du produit, sauf `consoDe`. */
  kgM2ParMm: number;
  /** Idem au mètre linéaire, kg/ml par mm. */
  kgMlParMm?: number;
  /** Absent : la conso saisie est celle du produit. */
  consoDe?: Exclude<ConsoDe, 'produit'>;
}

export interface DosageEpaisseur {
  /** Consommation du mélange, en kg/m² par mm d'épaisseur. */
  kgM2ParMm: number;
  /** Consommation au mètre linéaire, en kg/ml par mm d'épaisseur (lignes au ml). */
  kgMlParMm?: number;
  /** Ratios de charge : chacun sa conso par mm, qui remplace celle de base. */
  ratios?: RatioCharge[];
  /** La charge gâchée selon le ratio (sable…) : ajoutée en ligne sous le produit. */
  charge?: { libelle: string; produitId?: string };
  /** Vide : produit simple, conso par mm seule (palier implicite à 0 mm). */
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

/** Le dosage tel que lu en base : `undefined` s'il est illisible (aucune conso par mm). */
export function lireDosage(v: unknown): DosageEpaisseur | undefined {
  const o = typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!o || typeof o !== 'object') return undefined;
  const d = o as Partial<DosageEpaisseur>;
  const kgM2ParMm = Number(d.kgM2ParMm) > 0 ? Number(d.kgM2ParMm) : 0;
  const kgMlParMm = Number(d.kgMlParMm) > 0 ? Number(d.kgMlParMm) : 0;
  const ratios = (Array.isArray(d.ratios) ? d.ratios : [])
    .filter(r => r?.libelle?.trim() && (Number(r.kgM2ParMm) > 0 || Number(r.kgMlParMm) > 0))
    .map(r => ({
      libelle: r.libelle.trim(),
      kgM2ParMm: Number(r.kgM2ParMm) > 0 ? Number(r.kgM2ParMm) : 0,
      ...(Number(r.kgMlParMm) > 0 ? { kgMlParMm: Number(r.kgMlParMm) } : {}),
      ...(r.consoDe === 'charge' || r.consoDe === 'melange' ? { consoDe: r.consoDe } : {}),
    }));
  if (!kgM2ParMm && !kgMlParMm && !ratios.length) return undefined;
  const charge = d.charge?.libelle?.trim()
    ? { libelle: d.charge.libelle.trim(), ...(d.charge.produitId ? { produitId: d.charge.produitId } : {}) }
    : undefined;
  return {
    kgM2ParMm,
    ...(kgMlParMm ? { kgMlParMm } : {}),
    ...(ratios.length ? { ratios } : {}),
    ...(charge ? { charge } : {}),
    paliers: (Array.isArray(d.paliers) ? d.paliers : [])
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

/** Le ratio de charge retenu : celui de la ligne, sinon le premier de la fiche. */
export function ratioRetenu(d: DosageEpaisseur, ratio?: string): RatioCharge | undefined {
  if (!d.ratios?.length) return undefined;
  return d.ratios.find(r => r.libelle === ratio) ?? d.ratios[0];
}

/**
 * La conso par mm DU PRODUIT à ce ratio, déduite de celle saisie : ÷ parts
 * pour la charge, ÷ (1 + parts) pour le mélange. 0 si le ratio est illisible
 * alors qu'il faudrait le lire — rien ne se calcule plutôt qu'un faux chiffre.
 */
export function consoProduitRatio(r: RatioCharge): { kgM2ParMm: number; kgMlParMm?: number } {
  const parts = partsDeCharge(r.libelle);
  const f = !r.consoDe ? 1 : parts == null ? 0 : r.consoDe === 'charge' ? 1 / parts : 1 / (1 + parts);
  const ml = r.kgMlParMm ? arrondi(r.kgMlParMm * f, 4) : 0;
  return { kgM2ParMm: arrondi(r.kgM2ParMm * f, 4), ...(ml ? { kgMlParMm: ml } : {}) };
}

/** Le dosage au ratio retenu : la conso par mm du produit à ce ratio remplace celle de base. */
export function dosagePourRatio(d: DosageEpaisseur, ratio?: string): DosageEpaisseur {
  const r = ratioRetenu(d, ratio);
  if (!r) return d;
  const { kgMlParMm: _base, ...reste } = d;
  return { ...reste, ...consoProduitRatio(r) };
}

/** Parts de charge par part de produit : « 1:5 » → 5, « 1 : 7,5 » → 7,5, « 2/7 » → 3,5. `null` si illisible. */
export function partsDeCharge(ratio: string | undefined): number | null {
  const m = ratio?.trim().match(/^(\d+(?:[.,]\d+)?)\s*[:/]\s*(\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const [a, b] = [m[1], m[2]].map(x => Number(x.replace(',', '.')));
  return a > 0 && b > 0 ? b / a : null;
}

/**
 * La charge à gâcher au ratio retenu, en kg par kit : `[]` sans charge sur la
 * fiche, sans ratio lisible, ou sans poids de kit (on ne devine pas).
 */
export function ajoutsCharge(d: DosageEpaisseur, ratio: string | undefined, kitKg: number | undefined): AjoutDosage[] {
  const r = ratioRetenu(d, ratio);
  const parts = partsDeCharge(r?.libelle);
  if (!d.charge || !r || parts == null || !(kitKg && kitKg > 0)) return [];
  return [{ ...d.charge, kgParKit: arrondi(kitKg * parts, 2), ratio: r.libelle }];
}

const PALIER_SEUL: PalierDosage = { epaisseurMinMm: 0, ajouts: [] };

/** Le mélange qui s'applique à cette épaisseur : le plus épais dont le minimum est atteint. */
export function palierPour(d: DosageEpaisseur, epaisseurMm: number): PalierDosage | null {
  if (!d.paliers.length) return epaisseurMm > 0 ? PALIER_SEUL : null;
  let retenu: PalierDosage | null = null;
  for (const p of d.paliers) if (epaisseurMm >= p.epaisseurMinMm) retenu = p;
  return retenu;
}

/** Épaisseur minimale admise par la fiche (premier palier). */
export const epaisseurMinimale = (d: DosageEpaisseur) => d.paliers[0]?.epaisseurMinMm ?? 0;

/**
 * Conso du kit et des granulats pour une épaisseur, au m². `null` sous
 * l'épaisseur minimale, sans conso au m², ou — quand le mélange porte des
 * granulats — sans poids de kit : on ne devine pas la part du kit. Sans
 * granulat, le kit est tout le mélange.
 */
export function calculerDosage(d: DosageEpaisseur, kitKg: number | undefined, epaisseurMm: number): CalculDosage | null {
  if (!(d.kgM2ParMm > 0) || !(epaisseurMm > 0)) return null;
  const palier = palierPour(d, epaisseurMm);
  if (!palier) return null;
  const kgAjouts = palier.ajouts.reduce((s, a) => s + a.kgParKit, 0);
  if (kgAjouts > 0 && !(kitKg && kitKg > 0)) return null;
  const kgM2Melange = d.kgM2ParMm * epaisseurMm;
  if (!kgAjouts) return { epaisseurMm, palier, kgM2Melange: arrondi(kgM2Melange), consoKitKgM2: arrondi(kgM2Melange), ajouts: [] };
  const parKgMelange = kgM2Melange / (kitKg! + kgAjouts);
  return {
    epaisseurMm,
    palier,
    kgM2Melange: arrondi(kgM2Melange),
    consoKitKgM2: arrondi(kitKg! * parKgMelange),
    ajouts: palier.ajouts.map(a => ({ ...a, kgM2: arrondi(a.kgParKit * parKgMelange) })),
  };
}

/** Conso au ml pour une épaisseur (kg/ml) : `null` sans conso au ml sur la fiche, ou sous l'épaisseur minimale. */
export function consoMlEpaisseur(d: DosageEpaisseur, epaisseurMm: number): number | null {
  if (!(d.kgMlParMm && d.kgMlParMm > 0) || !palierPour(d, epaisseurMm)) return null;
  return arrondi(d.kgMlParMm * epaisseurMm);
}

/** Kilos d'un granulat pour un nombre de kits : la fiche dose par kit gâché. */
export function kgGranulat(kits: number, kgParKit: number): number {
  return arrondi((kits || 0) * kgParKit, 2);
}

/** L'usage affiché sur la ligne du mortier (info-bulle de la conso). */
export function usageEpaisseur(c: Pick<CalculDosage, 'epaisseurMm' | 'palier'>, ratio?: string): string {
  const mm = (n: number) => String(n).replace('.', ',');
  const ep = c.palier.epaisseurMinMm === c.epaisseurMm || !c.palier.epaisseurMinMm
    ? `Épaisseur ${mm(c.epaisseurMm)} mm`
    : `Épaisseur ${mm(c.epaisseurMm)} mm (mélange ${mm(c.palier.epaisseurMinMm)} mm)`;
  return ratio ? `${ep}, ratio ${ratio}` : ep;
}

/** Désignation d'une ligne de granulat (ou de charge) sans article. */
export function libelleGranulat(a: AjoutDosage, epaisseurMm: number): string {
  const n = (x: number) => String(x).replace('.', ',');
  if (a.ratio) return `${a.libelle} (charge ratio ${a.ratio} : ${n(a.kgParKit)} kg par kit)`;
  return `${a.libelle} (charge du mortier ép. ${n(epaisseurMm)} mm : ${n(a.kgParKit)} kg par kit)`;
}

/** Le libellé a-t-il été posé par `libelleGranulat` (donc à suivre quand l'épaisseur change) ? */
export const libelleGranulatAuto = (description: string, a: Pick<AjoutDosage, 'libelle'>) =>
  description.startsWith(`${a.libelle} (charge du mortier ép. `) || description.startsWith(`${a.libelle} (charge ratio `);

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

/**
 * Copie des lignes sous de NOUVEAUX identifiants (devis dupliqué, modèle de
 * système repris) en gardant le rattachement d'un granulat à SON mortier :
 * sans cela, `granulatDe.ligneId` désignerait la ligne du devis d'origine et
 * le granulat ne suivrait plus les kits.
 */
export function copierLignes<L extends { id: string; granulatDe?: { ligneId: string; libelle: string } }>(
  lignes: L[], nouvelId: () => string,
): L[] {
  const ids = new Map(lignes.map(l => [l.id, nouvelId()]));
  return lignes.map(l => ({
    ...l,
    id: ids.get(l.id)!,
    ...(l.granulatDe ? { granulatDe: { ...l.granulatDe, ligneId: ids.get(l.granulatDe.ligneId) ?? l.granulatDe.ligneId } } : {}),
  }));
}
