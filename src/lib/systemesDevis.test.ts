import { describe, it, expect } from 'vitest';
import type { Devis, LigneDevis } from './store';
import { fusionnerSystemes, noteDeComposant, systemeDepuisDevis, systemesDeDevis } from './systemesDevis';
import { rapprocherSysteme } from './rapprochementSysteme';
import { declinerSysteme, type Systeme } from './systemes';

const l = (o: Partial<LigneDevis>): LigneDevis => ({
  id: Math.random().toString(36).slice(2), description: '', quantite: 0, unite: 'U',
  prixUnitaireHT: 0, tva: 20, remise: 0, ...o,
});

function modele(systeme: string, lignes: LigneDevis[], statut: Devis['statut'] = 'système'): Devis {
  return { id: `d-${systeme}`, numero: 'DEV-X', systeme, statut, lignes } as unknown as Devis;
}

describe('la note d’une ligne de système', () => {
  const EPW_MAT = systemeDepuisDevis(modele('Flowseal EPW Mat', [
    l({ produitId: 'p', description: 'EPW', consommation: 0.25, note: '1ère couche A diluer avec 20% H²O' }),
    l({ produitId: 'p', description: 'EPW', consommation: 0.25 }),
  ]))!;

  it('reprend la note du modèle sur sa ligne', () => {
    expect(noteDeComposant(EPW_MAT, EPW_MAT.composants[0], '0.25 kg/m² × 125 m²')).toBe('1ère couche A diluer avec 20% H²O');
  });

  it('sans note au modèle, le rôle et le calcul', () => {
    expect(noteDeComposant(EPW_MAT, EPW_MAT.composants[1], '0.25 kg/m² × 125 m²')).toBe('base — 0.25 kg/m² × 125 m²');
  });

  it('la phrase d’une fiche de la table n’est pas une note de devis', () => {
    expect(noteDeComposant({}, { role: 'primaire', phraseSource: 'phrase de la fiche' }, '3 kg')).toBe('primaire — 3 kg');
  });
});

const ROAD_107_319 = modele('FLowfast 107 319 Road', [
  l({ type: 'groupe', description: 'Primaire' }),
  l({ produitId: 'p107', description: 'FLOWFAST 107 Primer (20 kg)', note: 'Application raclette @ 0,5 kg/m²' }),
  l({ type: 'soustotal' }),
  l({ type: 'groupe', description: 'Finition' }),
  l({ produitId: 'p319', description: 'FLOWFAST 319 Flexible Seal Unpigmented (20 kg)', consommation: 0.523 }),
  l({ produitId: 'ppig', description: 'Pigment poudre micronisé (2 kg)', consommation: 0.1046 }),
  l({ type: 'groupe', description: 'Tire à zéro' }),
  l({ produitId: 'p215', description: 'FLOWFAST 215 Flexible Binder (20 kg)', consommation: 0.6 }),
  l({ description: 'SURCHARGE ENERGIE', quantite: 1, unite: 'pièce' }),
]);
const ROAD = modele('FLowfast 319 Road', [
  l({ produitId: 'p319', description: 'FLOWFAST 319', consommation: 0.523 }),
]);

describe('systèmes issus de devis modèles', () => {
  it('ne prend que les devis « système », sans la ligne sans article', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants.map(c => c.produitId)).toEqual(['p107', 'p319', 'ppig', 'p215']);
    expect(systemeDepuisDevis(modele('x', ROAD_107_319.lignes, 'brouillon'))).toBeNull();
  });

  it('lit la consommation de la note quand la ligne n\'en porte pas', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants[0].consommation).toBe(0.5);
  });

  it('range « Tire à zéro » en facultatif', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    expect(s.composants.map(c => c.obligatoire)).toEqual([true, true, true, false]);
  });

  it('« système 107 flowfast 319 Road 100m² gris 7040 » désigne le modèle 107 + 319', () => {
    const r = rapprocherSysteme('systeme 107 flowfast 319 Road 100m² gris 7040',
      systemesDeDevis([ROAD, ROAD_107_319]));
    expect(r?.nom).toBe('FLowfast 107 319 Road');
    expect(r?.retenu).toBeDefined();
    expect(r?.surfaceM2).toBe(100);
  });

  it('sans « 107 », c\'est le modèle 319 Road seul', () => {
    const r = rapprocherSysteme('flowfast 319 Road 100 m²', systemesDeDevis([ROAD, ROAD_107_319]));
    expect(r?.nom).toBe('FLowfast 319 Road');
  });

  it('décline sur 100 m² : les facultatifs restent à part', () => {
    const s = systemeDepuisDevis(ROAD_107_319)!;
    const d = declinerSysteme(s, 100);
    expect(d.map(x => x.quantiteKg)).toEqual([50, 52.3, 10.46]);
  });
});

describe('un système présent dans la table et dans un devis modèle', () => {
  const F1 = modele('Flowfast F1 Mortar', [
    l({ type: 'groupe', description: 'Primaire' }),
    l({ produitId: 'p107', description: 'FLOWFAST 107 Primer (20 kg)', consommation: 0.5 }),
    l({ produitId: 'pqz', description: 'Quartz 0,3- 0,8 (25 kg)', consommation: 0.5 }),
    l({ produitId: 'pcat', description: 'Catalyst (2 kg)' }),
    l({ type: 'groupe', description: 'FLOWFAST F1 MORTAR' }),
    l({ produitId: 'pf1', description: 'FLOWFAST F1 MORTAR (A 2,2 KG + B 17,8 kG)' }),
  ]);
  const ligneTable = (nom: string, articles: string[]): Systeme => ({
    id: `t-${nom}`, nom, support: 'Béton', actif: true, variante: 'Réparation',
    composants: articles.map((produitId, ordre) => ({
      id: `c${ordre}`, systemeId: `t-${nom}`, ordre, produitId, libelle: produitId, role: 'base', obligatoire: true,
    })) as Systeme['composants'],
  });
  const demande = 'Flowfast F1 Mortar 20 m²';

  it('mêmes articles : le modèle reste seul et se chiffre comme sans la ligne de la table', () => {
    const modeles = systemesDeDevis([F1]);
    const table = ligneTable('Flowfast F1 Mortar', ['pf1', 'pcat', 'pqz', 'p107']);
    const avant = rapprocherSysteme(demande, modeles)!;
    const apres = rapprocherSysteme(demande, fusionnerSystemes([table], modeles))!;
    expect(apres.variantes).toHaveLength(1);
    expect(apres.retenu?.id).toBe(avant.retenu?.id);
    expect(apres.retenu?.composants).toEqual(avant.retenu?.composants);
  });

  it('sans la fusion, la même ligne ne laisserait retenir aucune variante', () => {
    const table = ligneTable('Flowfast F1 Mortar', ['pf1', 'pcat', 'pqz', 'p107']);
    const r = rapprocherSysteme(demande, [table, ...systemesDeDevis([F1])])!;
    expect(r.variantes).toHaveLength(2);
    expect(r.retenu).toBeUndefined();
  });

  it('articles différents sous le même nom : les deux restent proposés', () => {
    const table = ligneTable('Flowfast F1 Mortar', ['pf1', 'pautre']);
    const tous = fusionnerSystemes([table], systemesDeDevis([F1]));
    expect(tous).toHaveLength(2);
    expect(rapprocherSysteme(demande, tous)!.retenu).toBeUndefined();
  });

  it('nom différent, ou ligne de table sans article : rien n’est retiré', () => {
    const modeles = systemesDeDevis([F1]);
    expect(fusionnerSystemes([ligneTable('Flowshield SL', ['pf1', 'pcat', 'pqz', 'p107'])], modeles)).toHaveLength(2);
    expect(fusionnerSystemes([ligneTable('Flowfast F1 Mortar', [])], modeles)).toHaveLength(2);
  });
});
