import { describe, it, expect } from 'vitest';
import { estDevisOdoo, lireDevisOdoo, lireLigneMontant } from './devisOdooPdf';
import { comparerParReference } from './comparaisonDevis';
import type { Devis, Produit } from './store';

/* Extrait du PDF Odoo AF039468 tel que pdf.js le rend. */
const PAGE1 = `Adresse de facturation : Adresse de facturation : 
AGILIS
245 ALLÉE DU SIROCCO
Devis # AF039468 
Votre référence : Votre référence : 
TRAM LE HAVRE
Date du devis : Date du devis : 
08/10/2026
N° N°   Description Description   Image Image   Quantité Quantité   Prix unit. Prix unit.   bpu bpu   Montant Montant 
Ensemble AF039468/0001 Ensemble AF039468/0001 
2   DF50 2200 250 C2 50 O BRUT FLECHE LAPEROUSE P50 
Réf :   DF50.2200.250.C2.50.IS.BRUT 
1,000   Unité   126,920   126,92 € 
3   MAT MC MONO 89 2800 BRUT + CHAPEAU Alu 
Réf :   MC.89.2800.IS.BRUT 
1,000   Unité   124,281   124,28 € 
4   COLLIER 89 SIMPLE FACE P50 / BTR 
Réf :   CO89SFP50.BRUT 
2,000   Unité   11,820   23,64 € 
Sous-total Sous-total   274,84 €
ISOSIGN SAS
ZA DU MONAY
Page : 1 / 2 `;

const PAGE2 = `Ensemble AF039468/0003 Ensemble AF039468/0003 
19   MAT MD 114 REH 89 3600 BRUT + CHAPEAU Alu 
Réf :   MDREH.3600.IS.BRUT 
1,000   Unité   292,490   292,49 € 
692   REMISE PROMOTIONNELLE DU 01/10/2026 AU 31/12/2026 
Réf :   REVPBPU 
1,000   Unité   -8 206,079   -8 206,08 € 
Sous-total Sous-total   -7 945,49 €
Montant HT Montant HT   1 234,00 € 
TVA 20%   246,80 € 
Total Total   1 480,80 €`;

describe('devis Odoo en PDF', () => {
  it('se reconnaît', () => {
    expect(estDevisOdoo([PAGE1, PAGE2])).toBe(true);
    expect(estDevisOdoo(['Bonjour, pouvez-vous chiffrer 14 J11 ?'])).toBe(false);
  });

  it('lit la ligne de montant, nombres négatifs et milliers compris', () => {
    expect(lireLigneMontant('1,000   Unité   -8 206,079   -8 206,08 € ')).toEqual({ quantite: 1, unite: 'Unité', pu: -8206.079, montant: -8206.08 });
    expect(lireLigneMontant('Sous-total Sous-total   274,84 €')).toBeNull();
  });

  it('lit en-tête, lignes, ensembles et remise', () => {
    const d = lireDevisOdoo([PAGE1, PAGE2])!;
    expect(d).toMatchObject({
      typeDocument: 'offre_prix', numeroDocument: 'AF039468', nomPartenaire: 'AGILIS',
      referencePartenaire: 'TRAM LE HAVRE', dateDocument: '2026-10-08', totalHT: 1234,
    });
    expect(d.lignes.map(l => [l.reference, l.quantite, l.prixUnitaireHT, l.groupe])).toEqual([
      ['DF50.2200.250.C2.50.IS.BRUT', 1, 126.92, 'AF039468/0001'],
      ['MC.89.2800.IS.BRUT', 1, 124.28, 'AF039468/0001'],
      ['CO89SFP50.BRUT', 2, 11.82, 'AF039468/0001'],
      ['MDREH.3600.IS.BRUT', 1, 292.49, 'AF039468/0003'],
      ['REVPBPU', 1, -8206.08, 'AF039468/0003'],
    ]);
    expect(d.lignes[1].description).toBe('MAT MC MONO 89 2800 BRUT + CHAPEAU Alu');
  });
});

describe('comparaison par référence', () => {
  const produits: Produit[] = [];
  const devis: Devis = {
    id: 'd', numero: 'DEV-2026-140', clientId: 'c', dateCreation: '2026-10-14', dateValidite: '', statut: 'brouillon',
    lignes: [
      { id: 'g', type: 'groupe', description: 'DEM1-47', quantite: 0, unite: '', prixUnitaireHT: 0, tva: 0, remise: 0 },
      { id: 'a', referenceOdoo: 'DF50.2200.250.C2.50.IS.BRUT', description: 'DF50', quantite: 1, unite: 'u', prixUnitaireHT: 126.92, tva: 20, remise: 0 },
      { id: 'b', referenceOdoo: 'MC.89.2800.IS.BRUT', description: 'MC', quantite: 2, unite: 'u', prixUnitaireHT: 124.28, tva: 20, remise: 0 },
      { id: 'c', referenceOdoo: 'CO89SFP50.BRUT', description: 'Collier', quantite: 1, unite: 'u', prixUnitaireHT: 11.82, tva: 20, remise: 0 },
      { id: 'c2', referenceOdoo: 'CO89SFP50.BRUT', description: 'Collier', quantite: 1, unite: 'u', prixUnitaireHT: 11.82, tva: 20, remise: 0 },
    ],
  };

  it('cumule les quantités par référence et trie par écart de montant', () => {
    const e = comparerParReference(lireDevisOdoo([PAGE1, PAGE2])!.lignes, devis, produits);
    const par = Object.fromEntries(e.map(x => [x.cle, x]));
    expect(par['REVPBPU']).toMatchObject({ type: 'manquant', montantRealise: -8206.08 });
    expect(par['MDREH.3600.IS.BRUT']).toMatchObject({ type: 'manquant', qteRealise: 1 });
    expect(par['MC.89.2800.IS.BRUT']).toMatchObject({ type: 'ecart', quantite: true, qteRealise: 1, qteCrm: 2 });
    expect(par['CO89SFP50.BRUT']).toMatchObject({ type: 'identique', qteRealise: 2, qteCrm: 2 });
    expect(e[0].cle).toBe('REVPBPU');
  });
});

import { prixAApprendre, substitutionsApprises, tauxPalDeLOffre } from './comparaisonDevis';

describe('ce que la comparaison par référence apprend (AF039468 / DEV-2026-145)', () => {
  const offre = [
    { reference: 'D3.2200.2100.C2.IS.BRUT', description: 'PAL', quantite: 1, prixUnitaireHT: 0 },
    { reference: 'PMSD', description: 'PAL m2 - C2', quantite: 1, prixUnitaireHT: 761.284 },
    { reference: 'D3.2200.2100.C2.IS.BRUT', description: 'PAL', quantite: 1, prixUnitaireHT: 0 },
    { reference: 'PMSD', description: 'PAL m2 - C2', quantite: 1, prixUnitaireHT: 761.284 },
    { reference: 'SFGAB168', description: 'GABARIT 168', quantite: 1, prixUnitaireHT: 35.3 },
  ];
  const devis: Devis = {
    id: 'd', numero: 'DEV-2026-145', clientId: 'agilis', dateCreation: '', dateValidite: '', statut: 'brouillon',
    lignes: [
      { id: 'a', referenceOdoo: 'D3.2200.2100.C2.ST.IS.BRUT', description: 'Tasman', quantite: 2, unite: 'u', prixUnitaireHT: 646.8, tva: 20, remise: 0 },
      { id: 'b', referenceOdoo: 'SFGAB168', description: 'Gabarit', quantite: 1, unite: 'u', prixUnitaireHT: 8.25, tva: 20, remise: 0 },
    ],
  };
  const e = comparerParReference(offre, devis, []);

  it('la référence remplacée, options ôtées — jamais un autre article', () => {
    expect(substitutionsApprises(e)).toEqual([
      { de: 'D3.2200.2100.C2.ST.IS.BRUT', vers: 'D3.2200.2100.C2.IS.BRUT', designation: 'PAL' },
    ]);
  });

  it('le prix pratiqué quand il diffère du CRM', () => {
    expect(prixAApprendre(e)).toEqual([{ reference: 'SFGAB168', prix: 35.3 }]);
  });

  it('le taux PAL : PMSD rapporté aux m² des D3', () => {
    const [t] = tauxPalDeLOffre(offre);
    expect(t.reference).toBe('PMSD.C2');
    expect(Math.round(t.prix * 4.62 * 100) / 100).toBe(761.28);
  });
});
