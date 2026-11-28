import { describe, it, expect } from 'vitest';
import { buildOdooPayload } from './odooSync';
import type { Client, Devis, LigneDevis, Produit } from './store';

const ligne = (p: Partial<LigneDevis>): LigneDevis => ({
  id: Math.random().toString(36).slice(2), description: '', quantite: 1, unite: 'u',
  prixUnitaireHT: 10, tva: 20, remise: 0, ...p,
});
const TEINTE = 'dim-teinte';
const produits = [
  { id: 'sf41', reference: 'FLOWCOATSF41B', referenceOdoo: 'FLOWCOATSF41.14Kg', description: 'FLOWCOAT SF41 BLANK (14 kg)', catalogue: 'ISOFLOOR', categorie: 'EPOXY', poids: 14 },
  { id: 'pig', reference: 'PIGMENTKG', description: 'Pigment poudre micronisé (kg)', catalogue: 'ISOFLOOR', categorie: 'PIGMENTS', poids: 1,
    variantes: [{ id: TEINTE, nom: 'Teinte', options: [{ id: 'o', label: 'RAL 7036', prixDiff: 0 }] }] },
  { id: 'qz', reference: 'QUARTZ0308', description: 'Quartz 0,3- 0,8 (25 kg)', catalogue: 'ISOFLOOR', poids: 25 },
] as unknown as Produit[];

describe('envoi Odoo : devis système SF41 (RAL 7036)', () => {
  const devis = {
    id: 'd', numero: 'DEV-TEST', clientId: 'c', fraisPortHT: 178, lignes: [
      ligne({ id: 'g', type: 'groupe', description: 'Système : Flowcoat SF41' }),
      ligne({ produitId: 'sf41', description: 'FLOWCOAT SF41 BLANK (14 kg)', quantite: 6 }),
      ligne({ produitId: 'pig', description: 'Pigment poudre micronisé (kg)', quantite: 11, variantesChoisies: { [TEINTE]: 'RAL 7036' } }),
      ligne({ produitId: 'qz', description: 'Quartz 0,3- 0,8 (25 kg)', quantite: 8, pourMemoire: true, note: 'Option anti glisse' }),
      ligne({ id: 's', type: 'soustotal', description: '' }),
    ],
  } as unknown as Devis;
  const p = buildOdooPayload(devis, { id: 'c', societe: 'X' } as unknown as Client, produits);
  const produit = (ref: string) => p.lines.find(l => l.ref === ref);

  it('le BLANK part sous FLOWCOATSF41.14Kg, avec la teinte du système', () => {
    expect(produit('FLOWCOATSF41.14Kg')?.desc).toBe('FLOWCOAT SF41 BLANK (14 kg) — Teinte RAL 7036');
  });
  it('le pigment au kg part sous sa référence de teinte', () => {
    expect(produit('PIGMENTKG.L7036')).toBeTruthy();
  });
  it('la ligne PM part en note, suivie de sa note de ligne', () => {
    const notes = p.lines.filter(l => l.type === 'note').map(l => l.desc);
    expect(notes.some(n => n.startsWith('PM (pour mémoire'))).toBe(true);
    expect(notes).toContain('Option anti glisse');
  });
  it('le port part sous le mode SH de sa tranche (84 + 11 kg, PM exclue)', () => {
    expect(p.lines.find(l => l.port)?.portNom).toBe('FRAIS DE PORT SH DE 26 A 100KG');
  });
});
