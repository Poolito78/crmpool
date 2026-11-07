import { describe, it, expect } from 'vitest';
import {
  regrouperKits, separerKit, cleLigneAchat, memeIntitule, composantsDuKit, reporterPrixKit, noteKit, intituleKit, type LigneAKit,
} from './kitFournisseur';

/* Les lignes du devis TTS 74164, telles que le modèle les recopie. */
const TTS = [
  { reference: '0046062', description: '! OPTIQUE 130/30 KIT TRIFLASH SOLAIRE', quantite: 3, prixUnitaireHT: 861, prixConseille: 1435 },
  { reference: '0055887', description: 'Optique noire 130-30 Slim C5Y25 12V RC !!!F2!!!', quantite: 9 },
  { reference: '0029815', description: 'Option 3 pinces fixation universelle pour optique Ø 130 mm', quantite: 3 },
  { reference: '0029578', description: 'Boîtier cde. Triflash RC pour Kit solaire', quantite: 3 },
  { reference: '0029577', description: 'Kit solaire 20W 17A/h chantier avec batterie (embase XLR)', quantite: 3 },
  { reference: '', description: 'Pinces livrées non montées', quantite: null },
  { reference: '0046062', description: '! OPTIQUE Défilante Solaire', quantite: 2, prixUnitaireHT: 2281, prixConseille: 3755 },
  { reference: '0011400', description: 'Optique jaune 200-80 Y30 20mA 12V Def Défilant - XLR - Antivol', quantite: 10 },
  { reference: '0037192', description: 'Bac plastique gris 600x400x320 rangement 5 optiques TTS D200', quantite: 2 },
  { reference: '0043667', description: 'Kit solaire 100W 60Ah mode figé sans atténuation avec batterie', quantite: 2 },
  { reference: '0051218', description: 'Prestation de modification de produit', quantite: 2 },
  { reference: '', description: 'Mettre une fiche XLR', quantite: null },
  { reference: '0000463', description: 'Embase XLR 3pts mâle PSG01587', quantite: 2 },
  { reference: '0001009', description: 'MO-TTS Monteur câbleur', quantite: 2 },
  { reference: '', description: 'Sans fixations ni colliers', quantite: null },
  { reference: '0068752', description: 'Majoration temporaire de 5,5 %', quantite: 1, prixUnitaireHT: 392 },
];

describe('regrouperKits — le devis TTS 74164', () => {
  const lignes = regrouperKits<LigneAKit>(TTS);

  it('rend 2 kits et la majoration, au prix UNITAIRE', () => {
    expect(lignes.map(l => [l.quantite, l.prixUnitaireHT])).toEqual([[3, 861], [2, 2281], [1, 392]]);
    const total = lignes.reduce((s, l) => s + (l.quantite as number) * l.prixUnitaireHT!, 0);
    expect(total).toBe(7537); // le MONTANT H.T. du document
  });

  it('ramène les quantités des composants à UN kit', () => {
    expect(lignes[0].composants!.map(c => [c.reference, c.quantite, c.quantiteDocument])).toEqual([
      ['0055887', 3, 9], ['0029815', 1, 3], ['0029578', 1, 3], ['0029577', 1, 3],
    ]);
    expect(lignes[1].composants!.map(c => [c.reference, c.quantite])).toEqual([
      ['0011400', 5], ['0037192', 1], ['0043667', 1], ['0051218', 1], ['0000463', 1], ['0001009', 1],
    ]);
    expect(lignes.flatMap(l => l.composants ?? []).some(c => c.aVerifier)).toBe(false);
  });

  it('garde les mentions du fournisseur en notes du kit', () => {
    expect(lignes[0].notesKit).toEqual(['Pinces livrées non montées']);
    expect(lignes[1].notesKit).toEqual(['Mettre une fiche XLR', 'Sans fixations ni colliers']);
  });

  it('écarte la mise en page des mentions', () => {
    const [k] = regrouperKits<LigneAKit>([
      { reference: 'K', description: 'Kit', quantite: 1, prixUnitaireHT: 10 },
      { reference: 'C', description: 'Composant', quantite: 1 },
      { reference: '', description: '!!!!!', quantite: null },
      { reference: '', description: '________', quantite: null },
      { reference: '', description: 'Vraie mention', quantite: null },
    ]);
    expect(k.notesKit).toEqual(['Vraie mention']);
  });

  it('retire le « ! » de tête de l’intitulé', () => {
    expect(lignes[0].description).toBe('OPTIQUE 130/30 KIT TRIFLASH SOLAIRE');
    expect(intituleKit('!!! Kit')).toBe('Kit');
  });

  it('la majoration reste une ligne ordinaire', () => {
    expect(lignes[2].composants).toBeUndefined();
  });
});

describe('regrouperKits — ce qui n’est pas un kit', () => {
  it('une ligne à 0 € est chiffrée, pas un composant', () => {
    const l = regrouperKits<LigneAKit>([
      { reference: 'A', description: 'Thermocollant', quantite: 10, prixUnitaireHT: 273 },
      { reference: '', description: 'Maquette OFFERTE', quantite: 1, prixUnitaireHT: 0 },
    ]);
    expect(l).toHaveLength(2);
    expect(l[0].composants).toBeUndefined();
  });

  it('une simple remarque ne fabrique pas de kit', () => {
    const l = regrouperKits<LigneAKit>([
      { reference: 'A', description: 'Article', quantite: 1, prixUnitaireHT: 10 },
      { reference: '', description: 'Délai 3 semaines', quantite: null },
    ]);
    expect(l).toHaveLength(2);
    expect(l[0].composants).toBeUndefined();
  });

  it('des lignes sans prix en tête de document restent des lignes', () => {
    const l = regrouperKits<LigneAKit>([
      { reference: 'A', description: 'Sans prix', quantite: 2 },
      { reference: 'B', description: 'Chiffré', quantite: 1, prixUnitaireHT: 5 },
    ]);
    expect(l).toHaveLength(2);
    expect(l[1].composants).toBeUndefined();
  });

  it('une division qui ne tombe pas juste se signale, sans arrondir à l’unité', () => {
    const [k] = regrouperKits<LigneAKit>([
      { reference: 'K', description: 'Kit', quantite: 3, prixUnitaireHT: 100 },
      { reference: 'C', description: 'Composant', quantite: 4 },
    ]);
    expect(k.composants![0].quantite).toBe(1.3333);
    expect(k.composants![0].aVerifier).toBe(true);
  });

  it('un composant codé sans quantité écrite se signale', () => {
    const [k] = regrouperKits<LigneAKit>([
      { reference: 'K', description: 'Kit', quantite: 3, prixUnitaireHT: 100 },
      { reference: 'C', description: 'Composant', quantite: null },
    ]);
    expect(k.composants![0]).toMatchObject({ quantite: 1, aVerifier: true });
  });

  it('lit une quantité à la française', () => {
    const [k] = regrouperKits<LigneAKit>([
      { reference: 'K', description: 'Kit', quantite: '3,000', prixUnitaireHT: 100 },
      { reference: 'C', description: 'Composant', quantite: '9,000' },
    ]);
    expect(k.composants![0].quantite).toBe(3);
  });
});

describe('separerKit', () => {
  it('rend les composants à leur quantité écrite', () => {
    const [k] = regrouperKits<LigneAKit>(TTS);
    const { ligne, lignes } = separerKit(k);
    expect(ligne.composants).toBeUndefined();
    expect(ligne.notesKit).toBeUndefined();
    expect(lignes[0]).toMatchObject({ reference: '0055887', quantite: 9 });
  });
});

describe('cleLigneAchat — le code de tête est générique', () => {
  const [a, b] = regrouperKits<LigneAKit>(TTS);

  it('distingue deux kits de même code', () => {
    expect(cleLigneAchat(a)).not.toBe(cleLigneAchat(b));
  });

  it('une ligne ordinaire reste désignée par son seul code', () => {
    expect(cleLigneAchat({ reference: ' 0015339 ', description: 'solaire' })).toBe('0015339');
    expect(cleLigneAchat({ reference: '0015339', description: '230 V' })).toBe('0015339');
  });
});

describe('memeIntitule', () => {
  it('ignore casse, accents et ponctuation', () => {
    expect(memeIntitule('OPTIQUE Défilante Solaire', 'optique defilante  solaire!')).toBe(true);
    expect(memeIntitule('Optique', 'Optique solaire')).toBe(false);
    expect(memeIntitule('', '')).toBe(false);
  });
});

describe('composantsDuKit — le coût sans inventer le prix des composants', () => {
  it('porte le coût du kit sur la 1re ligne', () => {
    const c = composantsDuKit([{ produitId: 'a', quantite: 3 }, { produitId: 'b', quantite: 1 }], 861);
    expect(c).toEqual([
      { produitId: 'a', quantite: 3, prixAchatManuel: 861 },
      { produitId: 'b', quantite: 1, prixAchatManuel: 0 },
    ]);
  });
});

describe('reporterPrixKit — un nouveau prix tient au prochain enregistrement', () => {
  it('reporte sur la 1re ligne quand le coût y est porté', () => {
    const c = reporterPrixKit(composantsDuKit([{ produitId: 'a', quantite: 3 }, { produitId: 'b', quantite: 1 }], 861), 900);
    expect(c!.map(x => x.prixAchatManuel)).toEqual([900, 0]);
  });

  it('garde une répartition faite à la main, total exact', () => {
    const c = reporterPrixKit([
      { produitId: 'a', quantite: 1, prixAchatManuel: 1 },
      { produitId: 'b', quantite: 1, prixAchatManuel: 2 },
    ], 100);
    expect(c!.reduce((s, x) => s + x.prixAchatManuel!, 0)).toBe(100);
    expect(c![1].prixAchatManuel).toBe(66.67);
  });

  it('ne touche pas à un composé qui se calcule vraiment', () => {
    expect(reporterPrixKit([{ produitId: 'a', quantite: 1 }], 100)).toBeUndefined();
    expect(reporterPrixKit(undefined, 100)).toBeUndefined();
  });

  it('laisse le forfait par commande de côté', () => {
    const c = reporterPrixKit([
      { produitId: 'f', quantite: 1, forfaitCommande: true, prixAchatManuel: 15 },
      { produitId: 'a', quantite: 1, prixAchatManuel: 10 },
    ], 50);
    expect(c!.map(x => x.prixAchatManuel)).toEqual([15, 50]);
  });
});

describe('noteKit', () => {
  it('écrit la composition par kit et les mentions', () => {
    const [k] = regrouperKits<LigneAKit>(TTS);
    const n = noteKit(k);
    expect(n).toContain('- 3 × 0055887 Optique noire');
    expect(n).toContain('Mention : Pinces livrées non montées');
  });

  it('rien pour une ligne ordinaire', () => {
    expect(noteKit({})).toBe('');
  });
});
