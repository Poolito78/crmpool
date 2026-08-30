import { describe, it, expect } from 'vitest';
import {
  rapprocherSysteme, surfaceDeDemande, epaisseurDansTexte, surfaceDansTexte,
} from './rapprochementSysteme';
import { declinerSysteme, type Systeme, type SystemeComposant } from './systemes';

function composant(p: Partial<SystemeComposant>): SystemeComposant {
  return {
    id: p.libelle || 'c', systemeId: 's', ordre: 0, libelle: 'x',
    role: 'base', obligatoire: true, ...p,
  } as SystemeComposant;
}

function systeme(nom: string, variante: string, composants: SystemeComposant[] = []): Systeme {
  return {
    id: `${nom}-${variante}`, nom, variante, support: 'tous', actif: true, composants,
  };
}

/* Les deux variantes du Flowshield Comfort, telles que la fiche les donne :
   Hydraseal DPM à 0,3 kg/m², Flowshield LXP Soft à 3 kg/m² pour 2 mm et
   4,5 kg/m² pour 3 mm, finition Peran PU à 0,15 kg/m² par couche. */
const COMFORT_2 = systeme('Flowshield Comfort', '2 mm', [
  composant({ id: 'h', libelle: 'Hydraseal DPM Natural', role: 'primaire', consommation: 0.3, produitId: 'p-hydraseal' }),
  composant({ id: 'l', libelle: 'Flowshield LXP Soft', role: 'couche de masse', consommation: 3, produitId: 'p-lxp' }),
  composant({ id: 'f', libelle: 'Peran PU Pigmented Matte', role: 'finition', consommation: 0.15, produitId: 'p-peranpu' }),
  composant({ id: 'o', libelle: 'Comfort Sealer', role: 'finition (alternative)', consommation: 0.1, obligatoire: false }),
]);
const COMFORT_3 = systeme('Flowshield Comfort', '3 mm', [
  composant({ id: 'h', libelle: 'Hydraseal DPM Natural', role: 'primaire', consommation: 0.3, produitId: 'p-hydraseal' }),
  composant({ id: 'l', libelle: 'Flowshield LXP Soft', role: 'couche de masse', consommation: 4.5, produitId: 'p-lxp' }),
  composant({ id: 'f', libelle: 'Peran PU Pigmented Matte', role: 'finition', consommation: 0.15, produitId: 'p-peranpu' }),
  composant({ id: 'o', libelle: 'Comfort Sealer', role: 'finition (alternative)', consommation: 0.1, obligatoire: false }),
]);
const PERAN_COMFORT = systeme('Peran Comfort', '2,5 mm mat');
const FLOWSHIELD_SL = systeme('Flowshield SL', '2-3 mm');
const PERAN_STB = systeme('Peran STB', 'Compact 3-4 mm');
const PERAN_STB_COMPACT = systeme('Peran STB Compact', 'Compact');
const CORACOAT = systeme('Coracoat', '2,5 mm');

const CATALOGUE = [
  COMFORT_2, COMFORT_3, PERAN_COMFORT, FLOWSHIELD_SL,
  PERAN_STB, PERAN_STB_COMPACT, CORACOAT,
];

describe('lecture des nombres dans une demande', () => {
  it('lit une épaisseur collée à son unité', () => {
    expect(epaisseurDansTexte('SYSTEME flOWSHIELD COMFORT 3MM')).toBe(3);
    expect(epaisseurDansTexte('Peran Comfort 2,5 mm mat')).toBe(2.5);
  });

  it('lit une surface écrite m² comme m2', () => {
    expect(surfaceDansTexte('Flowshield Comfort 3 mm — 30 m²')).toBe(30);
    expect(surfaceDansTexte('120m2 de résine')).toBe(120);
  });

  it("ne prend pas une épaisseur pour une surface", () => {
    expect(surfaceDansTexte('SYSTEME FLOWSHIELD COMFORT 3MM')).toBeUndefined();
  });
});

describe('reconnaissance d’un système dans une demande', () => {
  /* Le cas qui a motivé tout ceci : cette ligne partait au rapprochement par
     libellé, qui retenait un SYSTÈME D'ACCROCHE (KIT DE 2 CROCHETS) POUR
     PANNEAU à 0,70 €, chiffré 30 fois. */
  it('reconnaît le système et sa variante malgré la casse et le mot « système »', () => {
    const r = rapprocherSysteme('SYSTEME flOWSHIELD COMFORT 3MM', CATALOGUE)!;
    expect(r.nom).toBe('Flowshield Comfort');
    expect(r.retenu).toBe(COMFORT_3);
    expect(r.epaisseurMm).toBe(3);
  });

  it('ne tranche pas la variante quand la demande ne dit pas l’épaisseur', () => {
    const r = rapprocherSysteme('Flowshield Comfort', CATALOGUE)!;
    expect(r.nom).toBe('Flowshield Comfort');
    expect(r.retenu).toBeUndefined();
    expect(r.variantes).toHaveLength(2);
    expect(r.pourquoi).toMatch(/variante à choisir/);
  });

  it('retient d’office un système à variante unique', () => {
    expect(rapprocherSysteme('Peran Comfort 2,5mm', CATALOGUE)!.retenu).toBe(PERAN_COMFORT);
  });

  it('exige TOUS les mots du nom — « Comfort » ne répond pas pour « SL »', () => {
    expect(rapprocherSysteme('Flowshield Comfort 2mm', CATALOGUE)!.nom).toBe('Flowshield Comfort');
    expect(rapprocherSysteme('Flowshield SL', CATALOGUE)!.nom).toBe('Flowshield SL');
  });

  it('préfère le nom le plus précis', () => {
    // « Peran STB » et « Peran STB Compact » répondent tous deux ; le second
    // reprend davantage de ce que le client a écrit.
    expect(rapprocherSysteme('PERAN STB COMPACT 4 mm', CATALOGUE)!.nom)
      .toBe('Peran STB Compact');
    expect(rapprocherSysteme('Peran STB classic', CATALOGUE)!.nom).toBe('Peran STB');
  });

  it('reconnaît un nom d’un seul mot s’il est distinctif', () => {
    expect(rapprocherSysteme('CORACOAT 2,5mm sur 40 m²', CATALOGUE)!.nom).toBe('Coracoat');
  });

  /* LE FAUX POSITIF EST PIRE QUE L'ABSENCE DE RECONNAISSANCE : il remplace un
     chiffrage par un autre, sans que rien ne le signale. */
  it('ne reconnaît rien dans un article qui porte seulement le mot « système »', () => {
    expect(rapprocherSysteme(
      "SYSTÈME D'ACCROCHE (KIT DE 2 CROCHETS) POUR PANNEAU", CATALOGUE)).toBeNull();
    expect(rapprocherSysteme('MÂT DE PAVOISEMENT CYLINDRIQUE EN ALUMINIUM - AVEC SYSTÈME', CATALOGUE))
      .toBeNull();
  });

  /* « Comfort » chez Flowcrete, « confort » chez ceux qui le vendent : une
     lettre séparait la demande du système, et le rapprochement retombait sur
     un kit de crochets à 0,70 €. */
  it('tient « confort » et « comfort » pour la même chose', () => {
    const fr = rapprocherSysteme('système Flowshield confort 100 m²', CATALOGUE)!;
    expect(fr.nom).toBe('Flowshield Comfort');
    expect(fr.surfaceM2).toBe(100);
    expect(rapprocherSysteme('FLOWSHIELD CONFORT 3MM', CATALOGUE)!.retenu).toBe(COMFORT_3);
    expect(rapprocherSysteme('peran confort 2,5mm', CATALOGUE)!.nom).toBe('Peran Comfort');
  });

  it('ne reconnaît rien sans systèmes en base', () => {
    expect(rapprocherSysteme('Flowshield Comfort 3mm', [])).toBeNull();
    expect(rapprocherSysteme('', CATALOGUE)).toBeNull();
  });
});

describe('surface à chiffrer', () => {
  it('préfère la surface écrite dans la demande', () => {
    const r = rapprocherSysteme('Flowshield Comfort 3 mm sur 45 m²', CATALOGUE);
    expect(surfaceDeDemande(r, 1)).toBe(45);
  });

  /* Un système ne se commande pas à l'unité : la quantité EST la surface. */
  it('retombe sur la quantité de la ligne quand la demande ne dit pas la surface', () => {
    const r = rapprocherSysteme('SYSTEME flOWSHIELD COMFORT 3MM', CATALOGUE);
    expect(surfaceDeDemande(r, 30)).toBe(30);
  });

  it('ne chiffre rien sans surface ni quantité', () => {
    expect(surfaceDeDemande(null, 0)).toBe(0);
  });
});

/* ── Le chiffrage HORUS, de bout en bout ─────────────────────────────────── */

describe('chiffrage du devis DEV-2026-052 — HORUS, 30 m²', () => {
  const POIDS: Record<string, number> = {
    'p-hydraseal': 12,   // HYDRASEAL DPM (12 kg)
    'p-lxp': 19,         // Flowshield LXP Soft A 15 kg + B 4 kg
    'p-peranpu': 5,      // Peran PU Pigmented Matt (TP600) A+B 5 kg
  };
  /* Tarif public de la fiche, remise revendeur de 30 % déjà appliquée. */
  const PRIX: Record<string, number> = {
    'p-hydraseal': 185.29, 'p-lxp': 207.50, 'p-peranpu': 134.77,
  };

  it('retrouve les contenants et le total du devis établi à la main', () => {
    const r = rapprocherSysteme('SYSTEME flOWSHIELD COMFORT 3MM', CATALOGUE)!;
    const surface = surfaceDeDemande(r, 30);
    const lignes = declinerSysteme(r.retenu!, surface, {
      poidsParProduit: (id) => (id ? POIDS[id] : undefined),
    });

    const par = (id: string) => lignes.find(l => l.composant.id === id)!;
    expect(par('h').quantiteKg).toBeCloseTo(9);      // 0,3 × 30
    expect(par('h').contenants).toBe(1);             // un seau de 12 kg
    expect(par('l').quantiteKg).toBeCloseTo(135);    // 4,5 × 30
    expect(par('l').contenants).toBe(8);             // 135 / 19 = 7,10 → 8
    expect(par('f').quantiteKg).toBeCloseTo(4.5);    // 0,15 × 30
    expect(par('f').contenants).toBe(1);

    // Le Comfort Sealer est facultatif : il ne s'invite pas au devis.
    expect(lignes.find(l => l.composant.id === 'o')).toBeUndefined();

    const total = lignes.reduce(
      (s, l) => s + (l.contenants ?? 0) * (PRIX[l.composant.produitId ?? ''] ?? 0), 0);
    /* Exactement le devis DEV-2026-052 : 185,29 + 8 × 207,50 + 134,77. */
    expect(total).toBeCloseTo(1980.06, 2);
    expect(total / surface).toBeCloseTo(66.00, 2);
  });

  it('la variante 2 mm ne coûte pas la même chose — d’où le refus de deviner', () => {
    const lignes = declinerSysteme(COMFORT_2, 30, {
      poidsParProduit: (id) => (id ? POIDS[id] : undefined),
    });
    // 3 kg/m² × 30 = 90 kg → 5 seaux, contre 8 en 3 mm.
    expect(lignes.find(l => l.composant.id === 'l')!.contenants).toBe(5);
    const total = lignes.reduce(
      (s, l) => s + (l.contenants ?? 0) * (PRIX[l.composant.produitId ?? ''] ?? 0), 0);
    expect(total).toBeCloseTo(1357.56, 2);
  });
});
