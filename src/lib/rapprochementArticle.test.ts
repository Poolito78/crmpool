import { describe, it, expect } from 'vitest';
import { caracteristiques, rapprocherArticle } from './rapprochementArticle';
import type { Produit } from './store';

function art(reference: string, description: string): Produit {
  return {
    id: reference, reference, description, categorie: '',
    prixAchat: 0, coefficient: 1, prixRevendeur: 0, prixHT: 0, tva: 20,
    dateCreation: '2026-01-01',
  } as Produit;
}

/* Le catalogue réel, tel qu'il a produit l'erreur : la demande « Support Ø 60
   mm long 3.50 m » avait été rapprochée de SUPPORTGB, un support de glissière
   béton pour tube 40×40, et chiffrée 122,28 € — le prix contrat de ce mauvais
   article. Le 3,50 m et le 4,00 m recevaient le même. */
const CATALOGUE = [
  art('SUPPORTGB', 'Support Glissière Béton pour tube 40x40'),
  art('SUPPORTGM', 'Support deporté Glissière Métal pour tube 40x40'),
  art('SUPPORTLED', 'CLIPS LED PLASTIQUE POUR LED Ø5 REF: LEDC-2'),
  art('SG.F.D60.3500', 'IS FARDEAU 61 SUPPORT ACIER D60 LONGUEUR 3,50m'),
  art('SG.F.D60.4000', 'IS FARDEAU 61 SUPPORT ACIER D60 LONGUEUR 4,00m'),
  art('SGB.M.60.2000.G', 'SUPPORT GLISSIERE BETON 160-210 Ø60 2000 GALVA'),
  art('PM60.3500.BRUT', 'PROFIL MAT ALU 6005A DIA 60 LG 3.50M BRUT'),
];

describe('lecture des caractéristiques', () => {
  it('lit le diamètre et la longueur d’une demande', () => {
    const c = caracteristiques('Support Ø 60 mm long 3.50 m');
    expect(c.diametre).toBe(60);
    expect(c.longueur).toBe(3500);
  });

  it('lit la section sans la confondre avec un diamètre', () => {
    const c = caracteristiques('Support Glissière Béton pour tube 40x40');
    expect(c.section).toBe('40x40');
    expect(c.diametre).toBeUndefined();
  });

  it('reconnaît les longueurs écrites autrement', () => {
    expect(caracteristiques('LG 3500').longueur).toBe(3500);
    expect(caracteristiques('LONGUEUR 3,50m').longueur).toBe(3500);
    expect(caracteristiques('D60 LG 4.00M').longueur).toBe(4000);
  });

  it('repère un conditionnement groupé', () => {
    expect(caracteristiques('IS FARDEAU 61 SUPPORT ACIER D60').groupe).toBe(true);
    expect(caracteristiques('Support acier D60').groupe).toBeUndefined();
  });
});

describe('rapprochement d’une demande', () => {
  it('n’attribue plus un support 40×40 à une demande en Ø60', () => {
    const r = rapprocherArticle('Support Ø 60 mm long 3.50 m', CATALOGUE);
    expect(r.candidats.map(p => p.reference)).not.toContain('SUPPORTGB');
    expect(r.meilleur?.reference).not.toBe('SUPPORTGB');
  });

  it('écarte un fardeau de 61 quand on demande des unités', () => {
    const r = rapprocherArticle('Support Ø 60 mm long 3.50 m', CATALOGUE);
    expect(r.candidats.map(p => p.reference)).not.toContain('SG.F.D60.3500');
  });

  it('distingue le 3,50 m du 4,00 m', () => {
    // C'est le symptôme le plus parlant de l'ancien code : deux longueurs
    // différentes recevaient le même article et le même prix.
    const a = rapprocherArticle('Support Ø 60 mm long 3.50 m', CATALOGUE);
    const b = rapprocherArticle('Support Ø 60 mm long 4.00 m', CATALOGUE);
    expect(a.meilleur?.reference).not.toBe(b.meilleur?.reference);
  });

  it('retient l’article dont diamètre et longueur concordent', () => {
    const r = rapprocherArticle('Mat Ø 60 mm long 3.50 m', CATALOGUE);
    expect(r.meilleur?.reference).toBe('PM60.3500.BRUT');
    expect(r.confiance).toBe('sure');
  });

  it('ne choisit rien plutôt que de choisir mal', () => {
    // Une ligne vide se remarque ; un mauvais article chiffré avec assurance,
    // non. Ø 90 n'existe pas au catalogue d'exemple.
    const r = rapprocherArticle('Support Ø 90 mm long 3.50 m', CATALOGUE);
    expect(r.meilleur).toBeUndefined();
    expect(r.confiance).toBe('aucun');
    expect(r.pourquoi).toMatch(/Ø90/);
  });

  it('reste prudent quand la longueur manque à l’article', () => {
    const r = rapprocherArticle('Support Ø 60 mm long 5.00 m', CATALOGUE);
    expect(r.confiance).not.toBe('sure');
  });
});

describe('déclinaisons de scellement et conditionnements groupés', () => {
  /* Catalogue réel, tel qu'il est en base. */
  const CATALOGUE = [
    { id: '1', reference: 'SUPGBA8040', description: 'Support GBA 80 x 40 Longueur 2m' },
    { id: '2', reference: 'SUPGBA80401.5', description: 'Support GBA 80 x 40 Longueur 1.50m' },
    { id: '3', reference: 'SG.F.8040.2500', description: 'IS FARDEAU 54 SUPPORT ACIER 80x40 LONGUEUR 2,50m' },
    { id: '4', reference: 'SG80402.2000', description: 'IS SUPPORT ACIER GALVA 80x40 LONGUEUR 2,00m' },
  ] as any[];

  it('ne propose pas un support GBA pour une demande de support nu', () => {
    /* « Support GBA 80 × 40 Longueur 2m » a la même section et la même
       longueur que la demande : sans règle, il arrivait en tête à 104,88 €
       quand le bon support en vaut 15,09. */
    const r = rapprocherArticle('mat de 80 x 40 de 2 ml', CATALOGUE);
    expect(r.candidats.map(c => c.reference)).not.toContain('SUPGBA8040');
    expect(r.candidats.map(c => c.reference)).toContain('SG80402.2000');
  });

  it('propose le GBA quand la demande le nomme', () => {
    const r = rapprocherArticle('support GBA 80 x 40 de 2 ml', CATALOGUE);
    expect(r.candidats.map(c => c.reference)).toContain('SUPGBA8040');
  });

  it('n’oppose jamais un fardeau à une demande à l’unité', () => {
    /* Un fardeau de 54 supports ne peut pas satisfaire une demande de 9 :
       sa quantité est imposée par le conditionnement. */
    const r = rapprocherArticle('9 supports acier 80 x 40 de 2,50 m', CATALOGUE);
    expect(r.candidats.map(c => c.reference)).not.toContain('SG.F.8040.2500');
  });

  it('propose le fardeau quand la demande le nomme', () => {
    const r = rapprocherArticle('fardeau support acier 80 x 40 de 2,50 m', CATALOGUE);
    expect(r.candidats.map(c => c.reference)).toContain('SG.F.8040.2500');
  });
});
