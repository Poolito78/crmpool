import { describe, it, expect } from 'vitest';
import {
  comparerDevis, correctionsApprises, devisCandidats, rapportEcarts, referenceDeLigne, resumerEcarts,
} from './comparaisonDevis';
import { cleDemande, produitDeMemoire, type MemoireArticle } from './memoireArticles';
import type { Devis, LigneDevis, Produit } from './store';
import type { LigneAnalysee } from './analyseDocument';

function produit(p: Partial<Produit> & { id: string; reference: string; description: string }): Produit {
  return {
    prixAchat: 0, coefficient: 1.6, prixHT: 0, coeffRevendeur: 1.6, remiseRevendeur: 30,
    prixRevendeur: 0, tva: 20, unite: 'pièce', stock: 0, stockMin: 0,
    dateCreation: '2026-01-01T00:00:00Z', ...p,
  };
}

const ak3_1000 = produit({ id: 'a1000', reference: 'AK3.1000.C2.BTR.IS.BRUT', description: 'IS AK3', descriptionVariante: 'AK3 1000 C2 BRUT' });
const ak3_700 = produit({ id: 'a700', reference: 'AK3.700.C2.BTR.IS.BRUT', description: 'IS AK3', descriptionVariante: 'AK3 700 C2 BRUT' });
const plot = produit({ id: 'plot', reference: 'PLASTOBLOC24GM', description: 'PLASTOBLOC 24 GRIS MOYEN' });
const produits = [ak3_1000, ak3_700, plot];

function ligne(l: Partial<LigneDevis> & { description: string }): LigneDevis {
  return { id: l.description, quantite: 1, unite: 'u', prixUnitaireHT: 0, tva: 20, remise: 0, ...l };
}

function devis(lignes: LigneDevis[], extra: Partial<Devis> = {}): Devis {
  return {
    id: 'd1', numero: 'DEV-2026-120', clientId: 'c1', dateCreation: '2026-10-01', dateValidite: '2026-10-31',
    statut: 'envoyé', lignes, ...extra,
  };
}

const realise = (l: Partial<LigneAnalysee> & { description: string }): LigneAnalysee =>
  ({ reference: '', quantite: 1, ...l });

describe('cleDemande', () => {
  it('ignore casse, accents, liaisons et ordre des mots', () => {
    expect(cleDemande('Panneau AK3 de 700')).toBe(cleDemande('ak3 700 panneau'));
    expect(cleDemande('Plots PVC')).toBe(cleDemande('plots pvc'));
  });
  it('garde les nombres : « B14 70 » n’est pas « B14 50 »', () => {
    expect(cleDemande('B14 70')).not.toBe(cleDemande('B14 50'));
  });
  it('une demande faite de liaisons ne se retient pas', () => {
    expect(cleDemande('de la')).toBe('');
  });
});

describe('produitDeMemoire', () => {
  const memo = (m: Partial<MemoireArticle>): MemoireArticle => ({
    id: 'm', cle: 'k', demande: 'd', reference: '', origine: 'choix', nb: 1, updatedAt: '', ...m,
  });
  it('par identifiant, puis par référence MonCRM ou Odoo', () => {
    expect(produitDeMemoire(memo({ produitId: 'a700', reference: 'X' }), produits)).toBe(ak3_700);
    expect(produitDeMemoire(memo({ reference: 'ak3.700.c2.btr.is.brut' }), produits)).toBe(ak3_700);
  });
  it('un article Odoo absent du catalogue ne se trouve pas localement', () => {
    expect(produitDeMemoire(memo({ reference: 'AK3.1250.C2.BTR.IS.BRUT' }), produits)).toBeUndefined();
  });
});

describe('referenceDeLigne', () => {
  it('lit la référence entre crochets d’Odoo', () => {
    expect(referenceDeLigne('', '[AK3.700.C2.BTR.IS.BRUT] Panneau AK3')).toBe('AK3.700.C2.BTR.IS.BRUT');
    expect(referenceDeLigne('[plastobloc24gm]', '')).toBe('PLASTOBLOC24GM');
  });
});

describe('comparerDevis', () => {
  it('même référence, même quantité, même prix : identique', () => {
    const d = devis([ligne({ produitId: 'plot', description: 'PLASTOBLOC 24 GRIS MOYEN', quantite: 14, prixUnitaireHT: 9.5 })]);
    const e = comparerDevis([realise({ reference: 'PLASTOBLOC24GM', description: 'Plastobloc', quantite: 14, prixUnitaireHT: 9.5 })], d, produits);
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('identique');
  });

  it('autre variante du même code : écart d’article, appris avec la demande', () => {
    const d = devis([ligne({
      produitId: 'a1000', description: 'AK3 1000 C2 BRUT', quantite: 2, prixUnitaireHT: 50.02,
      demandeClient: 'panneau AK3',
    })]);
    const e = comparerDevis([realise({ description: '[AK3.700.C2.BTR.IS.BRUT] AK3 700 C2 BRUT', quantite: 2, prixUnitaireHT: 39.41 })], d, produits);
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('ecart');
    expect(e[0].article).toBe(true);
    expect(e[0].prix).toBe(true);
    expect(correctionsApprises(e)).toEqual([
      { demande: 'panneau AK3', reference: 'AK3.700.C2.BTR.IS.BRUT', designation: 'AK3 700 C2 BRUT' },
    ]);
  });

  it('une ligne CRM sans demande d’origine n’apprend rien', () => {
    const d = devis([ligne({ produitId: 'a1000', description: 'AK3 1000 C2 BRUT', quantite: 2 })]);
    const e = comparerDevis([realise({ reference: 'AK3.700.C2.BTR.IS.BRUT', description: 'AK3 700 C2 BRUT', quantite: 2 })], d, produits);
    expect(e[0].article).toBe(true);
    expect(correctionsApprises(e)).toEqual([]);
  });

  it('quantité retouchée sur le même article', () => {
    const d = devis([ligne({ produitId: 'plot', description: 'PLASTOBLOC', quantite: 10, prixUnitaireHT: 9.5 })]);
    const e = comparerDevis([realise({ reference: 'PLASTOBLOC24GM', description: 'PLASTOBLOC', quantite: 14, prixUnitaireHT: 9.5 })], d, produits);
    expect(e[0]).toMatchObject({ type: 'ecart', quantite: true });
    expect(e[0].article).toBeUndefined();
  });

  it('oubli du CRM et ligne en trop', () => {
    const d = devis([ligne({ produitId: 'plot', description: 'PLASTOBLOC', quantite: 10, prixUnitaireHT: 9.5 })]);
    const e = comparerDevis([
      realise({ reference: 'BR8040SFP50', description: 'BRIDE 80X40 SIMPLE FACE P50', quantite: 4, prixUnitaireHT: 3.2 }),
    ], d, produits);
    expect(e.map(x => x.type).sort()).toEqual(['en_trop', 'manquant']);
  });

  it('le port répond au port, quel que soit son article', () => {
    const d = devis([], { fraisPortHT: 51, fraisPortLibelle: 'FRAIS DE PORT SH DE 26 A 100KG' });
    const e = comparerDevis([realise({ reference: 'PORTSH100', description: 'Frais de port', quantite: 1, prixUnitaireHT: 51 })], d, produits);
    expect(e).toHaveLength(1);
    expect(e[0].type).toBe('identique');
  });

  it('les groupes et textes du devis CRM ne comptent pas', () => {
    const d = devis([
      ligne({ type: 'groupe', description: 'Zone A' }),
      ligne({ type: 'texte', description: 'Pose non comprise' }),
    ]);
    expect(comparerDevis([], d, produits)).toEqual([]);
  });

  it('le résumé et le rapport nomment les écarts', () => {
    const d = devis([ligne({ produitId: 'plot', description: 'PLASTOBLOC', quantite: 10, prixUnitaireHT: 9.5 })]);
    const e = comparerDevis([
      realise({ reference: 'PLASTOBLOC24GM', description: 'PLASTOBLOC', quantite: 10, prixUnitaireHT: 9.5 }),
      realise({ reference: 'BR8040SFP50', description: 'BRIDE 80X40', quantite: 4, prixUnitaireHT: 3 }),
    ], d, produits);
    const r = resumerEcarts(e);
    expect(r).toMatchObject({ identiques: 1, manquants: 1, totalRealise: 107, totalCrm: 95 });
    expect(rapportEcarts(e, { devisCrm: 'DEV-2026-120', devisRealise: 'AF037700' })).toContain('OUBLI DU CRM : [BR8040SFP50]');
  });
});

describe('devisCandidats', () => {
  const a = devis([], { id: 'a', numero: 'DEV-2026-100', clientId: 'c1', dateCreation: '2026-09-01' });
  const b = devis([], { id: 'b', numero: 'DEV-2026-110', clientId: 'c1', dateCreation: '2026-10-01', referenceAffaire: 'PANTIN' });
  const c = devis([], { id: 'c', numero: 'DEV-2026-111', clientId: 'c2', dateCreation: '2026-10-02' });
  it('la référence d’affaire avant le plus récent du client', () => {
    expect(devisCandidats([a, b, c], { clientId: 'c1', referenceAffaire: 'pantin' }).map(d => d.id)).toEqual(['b', 'a']);
  });
  it('le numéro du CRM cité dans le document l’emporte', () => {
    expect(devisCandidats([a, b, c], { clientId: 'c1', texte: 'Suite à notre DEV-2026-100' })[0].id).toBe('a');
  });
});
