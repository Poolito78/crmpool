/**
 * Moquette de pierre Flowbind 2700 : le choix d'épaisseur fixe les doses.
 *
 * Le mortier se compose de granulat (marbre roulé 2-5 mm) et de liant Flowbind
 * A+B ; ni l'un ni l'autre ne se dose au même taux selon l'épaisseur posée.
 * Un sélecteur du devis applique le choix aux lignes Flowbind et marbre : leur
 * consommation (kg/m²) change, la quantité suit, et l'usage retenu se lit en
 * info-bulle sur la ligne (`consoUsage`) — c'est aussi ce qui permet de
 * retrouver le choix à la réouverture, sans colonne de plus.
 *
 * ⚠️ Doses saisies par le chargé d'affaires (tableau « pour 1 m² », 5 oct.
 * 2026) pour le SOL. Les épaisseurs en VERTICAL (6, 8, 10 mm) sont proposées
 * mais SANS valeurs : on n'invente pas une dose — l'option reste grisée
 * jusqu'à ce qu'elles soient renseignées ici.
 */

export interface PresetMoquette {
  id: string;
  /** Libellé affiché au sélecteur ET enregistré comme usage de la ligne. */
  label: string;
  /** Flowbind A+B, kg par m². Absent = valeurs à renseigner. */
  flowbindKgM2?: number;
  /** Granulat 2-5 mm, kg par m². Absent = valeurs à renseigner. */
  granulatKgM2?: number;
}

export const PRESETS_MOQUETTE: PresetMoquette[] = [
  { id: 'sol-8',  label: 'Sol 8 mm',  flowbindKgM2: 0.76, granulatKgM2: 15.25 },
  { id: 'sol-10', label: 'Sol 10 mm', flowbindKgM2: 0.9,  granulatKgM2: 18 },
  { id: 'sol-30', label: 'Sol 30 mm', flowbindKgM2: 2.69, granulatKgM2: 53.8 },
  { id: 'sol-40', label: 'Sol 40 mm', flowbindKgM2: 3.59, granulatKgM2: 71.7 },
  { id: 'vert-6',  label: 'Vertical 6 mm' },
  { id: 'vert-8',  label: 'Vertical 8 mm' },
  { id: 'vert-10', label: 'Vertical 10 mm' },
];

export function presetRenseigne(p: PresetMoquette): boolean {
  return p.flowbindKgM2 != null && p.granulatKgM2 != null;
}

/** Les kits Flowbind 2700 A+B (10 et 25 kg) — pas les composants A ou B vendus seuls. */
const REF_FLOWBIND = /^FLOWBIND2700(10|25)$/i;
const REF_GRANULAT = /^MARBRER25$/i;

export type RoleMoquette = 'flowbind' | 'granulat';

export function roleMoquette(reference: string | undefined): RoleMoquette | null {
  if (!reference) return null;
  if (REF_FLOWBIND.test(reference.trim())) return 'flowbind';
  if (REF_GRANULAT.test(reference.trim())) return 'granulat';
  return null;
}

/** Le choix en cours, relu sur l'usage porté par les lignes (premier qui correspond). */
export function presetEnCours(usages: (string | undefined)[]): PresetMoquette | undefined {
  return PRESETS_MOQUETTE.find(p => usages.includes(p.label));
}
