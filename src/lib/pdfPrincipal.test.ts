import { describe, it, expect } from 'vitest';
import { choisirPdfPrincipal, notePdf } from './pdfPrincipal';

const CGV = `AFC Communication est une entreprise dédiée à la communication globale.
1 - Validité 2 - Tarifs 3 - Passation de commandes, acceptation de commandes et délais
Seules les présentes conditions générales de vente s'appliquent à toutes les offres, devis,
ventes et livraisons. Nos prix s'entendent toujours par produits vendus, hors frais de maquette.`;

const DEVIS = `Devis № DV5214
Description Quantité Prix unitaire Taxes Montant
Thermocollant préfabriqué Alerte SNCF diamètre 100cm 10,00 Unité(s) 273,28 TVA 20% 2 732,80 €
Idem, diamètre 150cm 10,00 Unité(s) 347,42 TVA 20% 3 474,20 €
Envoi messagerie 1,00 Forfait 90,00 TVA 20% 90,00 €
Sous-total 6 297,00 € Total 7 556,40 €
RESERVE DE PROPRIETE : (Loi du 12 mai 1980).`;

describe('choisirPdfPrincipal', () => {
  it('écarte les CGV jointes avant le devis (AFC DV5214)', () => {
    expect(choisirPdfPrincipal([
      { name: 'CGV_AFC.pdf', pages: [CGV] },
      { name: 'DV5214_brouillon.pdf', pages: [DEVIS] },
    ])).toBe(1);
  });

  it('garde l\'ordre du mail à égalité', () => {
    expect(choisirPdfPrincipal([
      { name: 'a.pdf', pages: [DEVIS] },
      { name: 'b.pdf', pages: [DEVIS] },
    ])).toBe(0);
  });

  it('un scan sans texte ne passe pas devant un devis lisible', () => {
    expect(choisirPdfPrincipal([
      { name: 'scan.pdf', pages: [''] },
      { name: 'devis.pdf', pages: [DEVIS] },
    ])).toBe(1);
  });

  it('un scan passe devant des CGV', () => {
    expect(choisirPdfPrincipal([
      { name: 'CGV.pdf', pages: [CGV] },
      { name: 'scan.pdf', pages: [''] },
    ])).toBe(1);
  });

  it('un renvoi aux CGV en pied de devis ne le disqualifie pas', () => {
    expect(notePdf('DV5214.pdf', [DEVIS + '\nVoir nos conditions générales de vente.'])).toBeGreaterThan(5);
  });
});
