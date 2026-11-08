import { beforeEach, describe, expect, it, vi } from 'vitest';

const { joindreAuDevis, download, pieces } = vi.hoisted(() => ({
  joindreAuDevis: vi.fn(async () => undefined),
  download: vi.fn(async () => ({ data: new Blob(['pdf']), error: null })),
  pieces: { data: [] as { fichier_nom: string; fichier_url: string }[] },
}));

vi.mock('@/lib/depotChiffrage', () => ({ joindreAuDevis }));
vi.mock('@/integrations/supabase/client', () => {
  const chaine = { select: () => chaine, eq: () => chaine, is: async () => ({ data: pieces.data, error: null }) };
  return { supabase: { from: () => chaine, storage: { from: () => ({ download }) } } };
});

import { choisirRecap, estFicheRecap, joindreFichesRecap } from './recapSysteme';

const RECAP_MODELE = {
  fichier_nom: 'fiche-recap-flowseal-epw.pdf',
  fichier_url: 'https://x.supabase.co/storage/v1/object/public/devis-pj/u/m/179_fiche-recap-flowseal-epw.pdf',
};
const FICHE_PRODUIT = { fichier_nom: 'FP_Flowfast_319.pdf', fichier_url: 'https://x/devis-pj/u/m/fp.pdf' };
const TABLE_EPW = { nom: 'Flowseal EPW', recapUrl: 'https://x/produits-fiches/p/1793966596722-fiche-recap-flowseal-epw.pdf' };

describe('la fiche récap du système', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pieces.data = [];
  });

  it('reconnaît une fiche récap à son nom', () => {
    expect(estFicheRecap('fiche-recap-flowshield-sl.pdf')).toBe(true);
    expect(estFicheRecap('Fiche récap - Flowseal EPW.pdf')).toBe(true);
    expect(estFicheRecap('Fiche Système - Flowfast BC.pdf')).toBe(false);
    expect(estFicheRecap(null)).toBe(false);
  });

  it('prend celle du devis modèle, jamais ses autres fichiers', () => {
    expect(choisirRecap({ nom: 'Flowseal EPW Mat' }, [FICHE_PRODUIT, RECAP_MODELE], [TABLE_EPW])).toEqual({
      nom: 'fiche-recap-flowseal-epw.pdf', chemin: 'u/m/179_fiche-recap-flowseal-epw.pdf',
    });
  });

  it('à défaut, celle de la table dont le nom est contenu dans le système', () => {
    expect(choisirRecap({ nom: 'Flowseal EPW Mat' }, [FICHE_PRODUIT], [{ nom: 'Coracoat', recapUrl: 'https://x/c.pdf' }, TABLE_EPW])).toEqual({
      nom: 'fiche-recap-flowseal-epw.pdf', url: TABLE_EPW.recapUrl,
    });
  });

  it('rien d’approchant quand aucune récap ne correspond', () => {
    expect(choisirRecap({ nom: 'Peran Floor Flakes' }, [FICHE_PRODUIT], [TABLE_EPW, { nom: 'Peran Floor Flakes' }])).toBeUndefined();
  });

  it('copie la récap du modèle dans le devis', async () => {
    pieces.data = [FICHE_PRODUIT, RECAP_MODELE];
    const r = await joindreFichesRecap('dev1', [{ id: 'devis:m', nom: 'Flowseal EPW Mat' }], []);
    expect(r).toEqual({ joints: ['fiche-recap-flowseal-epw.pdf'], absentes: [] });
    expect(download).toHaveBeenCalledWith('u/m/179_fiche-recap-flowseal-epw.pdf');
    expect(joindreAuDevis).toHaveBeenCalledTimes(1);
    const [devisId, fichier] = joindreAuDevis.mock.calls[0] as unknown as [string, File];
    expect(devisId).toBe('dev1');
    expect(fichier.name).toBe('fiche-recap-flowseal-epw.pdf');
    expect(fichier.type).toBe('application/pdf');
  });

  it('ne joint pas deux fois la même récap et nomme ce qui manque', async () => {
    pieces.data = [RECAP_MODELE];
    const r = await joindreFichesRecap('dev1', [
      { id: 'devis:m', nom: 'Flowseal EPW Mat' },
      { id: 'devis:b', nom: 'Flowseal EPW Brillant' },
    ], []);
    expect(r.joints).toHaveLength(1);
    expect(joindreAuDevis).toHaveBeenCalledTimes(1);

    pieces.data = [];
    expect(await joindreFichesRecap('dev1', [{ id: 's', nom: 'Peran Floor Flakes' }], [])).toEqual({ joints: [], absentes: ['Peran Floor Flakes'] });
  });
});
