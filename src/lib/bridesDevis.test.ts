import { describe, it, expect } from 'vitest';
import { compterBrides, familleRails, railsDuPanneau } from '@/lib/bridesDevis';

describe('familleRails', () => {
  it('reconnait les familles dans le bon ordre', () => {
    expect(familleRails('AB4')).toBe('AB4');   // STOP avant les « A »
    expect(familleRails('AB3a')).toBe('AB3');
    expect(familleRails('AB6')).toBe('AB6');
    expect(familleRails('A13a')).toBe('A');
    expect(familleRails('B21a1')).toBe('B21A'); // avant les « B »
    expect(familleRails('B14')).toBe('B');
    expect(familleRails('B30')).toBe('ZONE');
    expect(familleRails('CE15a')).toBe('CE');
    expect(familleRails('M9z')).toBe('PANONCEAU');
  });

  /* ⚠️ RÈGLE CORRIGÉE PAR LE MÉTIER. La signalisation temporaire était
     écartée du comptage, au motif qu'elle se pose au sol ou sur trépied. Le
     devis Odoo AF036911 dit le contraire : ses AK3, AK5 et KC1 portent le
     segment « .R. » — kit rail — et ouvrent une ligne de brides. Les écarter
     revenait à livrer un chantier sans de quoi fixer ses panneaux.

     La forme décide, et la cote avec, comme pour la police. */
  it('donne aux familles de chantier la table de leur forme', () => {
    expect(familleRails('AK5')).toBe('A');          // triangle
    expect(familleRails('BK1')).toBe('B');          // disque
    expect(familleRails('KC1')).toBe('TEMPO_RECT'); // rectangle
    expect(familleRails('KD22a')).toBe('TEMPO_RECT');
    expect(familleRails('KM9')).toBe('PANONCEAU');
  });
});

describe('railsDuPanneau', () => {
  it('lit la table, taille par taille', () => {
    expect(railsDuPanneau('A', 'A13A.700.C1.BTR.IS.BRUT').rails).toBe(2);
    expect(railsDuPanneau('A', 'A13A.1250.C1.BTR.IS.BRUT').rails).toBe(3);
    expect(railsDuPanneau('B', 'B14.1250.C2.BTR').rails).toBe(3);
  });

  it('rend null hors table plutot que de deviner', () => {
    expect(railsDuPanneau('A', 'A13A.850.C1.BTR').rails).toBeNull();
    expect(railsDuPanneau('A', 'A13A sans cote').rails).toBeNull();
  });

  it('B21a1 porte 4 rails a toutes les tailles', () => {
    expect(railsDuPanneau('B21A', 'B21A1.450').rails).toBe(4);
    expect(railsDuPanneau('B21A', 'B21A1.850').rails).toBe(4);
  });

  it('les panonceaux se lisent au format', () => {
    expect(railsDuPanneau('PANONCEAU', 'M9z 700x200').rails).toBe(1);
    expect(railsDuPanneau('PANONCEAU', 'M9z 900x500').rails).toBe(2);
    expect(railsDuPanneau('PANONCEAU', 'M9z 900x900').rails).toBe(3);
  });

  it('G1 porte 3 rails, sans cote', () => {
    expect(railsDuPanneau('G1', 'G1b 1150x750').rails).toBe(3);
  });
});

describe('compterBrides', () => {
  it('une bride par rail, quantite comprise', () => {
    const c = compterBrides([
      { texte: 'A13A.700.C1.BTR.IS.BRUT', quantite: 3 },   // 2 rails x 3
      { texte: 'M9z 700x200 panonceau', quantite: 3 },     // 1 rail  x 3
    ]);
    expect(c.brides).toBe(9);
    expect(c.aVerifier).toHaveLength(0);
  });

  it('ne compte pas ce qui n a pas de rail', () => {
    const c = compterBrides([
      { texte: 'PLASTOBLOC16 plot PVC', quantite: 14 },
      { texte: 'SG80401_5.2500 mat', quantite: 4 },
      { texte: 'BR8040SFP50.BRUT BRIDE 80X40 SIMPLE FACE', quantite: 38 },
    ]);
    /* Un plot, un mât, une bride : aucun n'est un panneau. Ils ne sont pas
       « à vérifier » non plus — ils n'ont simplement rien à voir avec des
       rails. (Le KC1 qui figurait ici EN COMPTE désormais : voir plus haut.) */
    expect(c.brides).toBe(0);
    expect(c.aVerifier).toHaveLength(0);
  });

  it('signale au lieu de deviner quand la cote manque a la table', () => {
    const c = compterBrides([{ texte: 'A13A.850.C1.BTR.IS.BRUT', quantite: 2 }]);
    expect(c.brides).toBe(0);
    expect(c.aVerifier).toHaveLength(1);
    expect(c.aVerifier[0].raison).toBe('cote absente de la table');
    expect(c.aVerifier[0].famille).toBe('A');
  });

  it('ignore une ligne a quantite nulle', () => {
    expect(compterBrides([{ texte: 'A13A.700', quantite: 0 }]).brides).toBe(0);
  });
});

describe('la classe de rétroréflexion n’est pas un code de panneau', () => {
  /* ⚠️ Références réelles du devis Odoo AF036911. Une référence porte sa
     classe en segment — `AK3.700.C1.BTR.R.IS.BRUT` — et le motif « C + chiffres »
     y trouvait `C1` : AK3, KC1, MSP et POINT DE RASSEMBLEMENT ressortaient tous
     en famille « CE », avec une cote prise au hasard dans le reste de la
     référence. Le total ne voulait rien dire, et rien ne le signalait. */
  it('n’invente plus une famille C sur des références classées C1', () => {
    const r = compterBrides([
      { texte: 'AK3.700.C1.BTR.R.IS.BRUT IS AK3', quantite: 1 },
      { texte: 'KC1.800.600.C1.BTR.R.IS.BRUT IS KC1', quantite: 7 },
      { texte: 'POINTDERASSEMBLEMENT.500.C1.BTR.IS.BRUT IS POINT DE RASSEMBLEMENT', quantite: 2 },
      { texte: 'TRIFLASHAK5.700.C1.BTR.R.IS.BRUT IS AK5 3 FEUX LEDS', quantite: 3 },
    ]);
    /* Aucune ne doit ressortir en famille « CE » : c'etait le defaut. */
    expect(r.lignes.map(l => l.famille)).not.toContain('CE');
    expect(r.aVerifier).toEqual([]);
  });

  /* Le garde-fou ne doit pas emporter les vrais panneaux de la série C, qui
     portent au moins deux chiffres. */
  it('reconnaît toujours les vrais panneaux de la série C', () => {
    const r = compterBrides([{ texte: 'C18.500.C2.BTR.IS.BRUT IS C18', quantite: 1 }]);
    expect(r.lignes.length + r.aVerifier.length).toBe(1);
    const famille = r.lignes[0]?.famille ?? r.aVerifier[0]?.famille;
    expect(famille).toBe('CE');
  });
});

describe('le kit rail existe aussi en signalisation temporaire', () => {
  /* ⚠️ Les familles de chantier etaient purement exclues du comptage. Le devis
     AF036911 les facture : ses AK3, AK5 et KC1 portent le segment « .R. » —
     kit rail — et ouvrent une ligne de brides. Les ecarter revenait a livrer
     un chantier sans de quoi fixer ses panneaux.

     La forme decide, et la cote avec, comme pour la police. */
  it('compte les triangles de chantier sur la table des triangles', () => {
    const r = compterBrides([
      { texte: 'AK3.700.C1.BTR.R.IS.BRUT IS AK3', quantite: 1 },
      { texte: 'TRIFLASHAK5.700.C1.BTR.R.IS.BRUT IS AK5 3 FEUX LEDS', quantite: 3 },
    ]);
    expect(r.aVerifier).toEqual([]);
    expect(r.lignes.map(l => `${l.famille}/${l.cote}/${l.railsUnitaires}`))
      .toEqual(['A/700/2', 'A/700/2']);
    expect(r.brides).toBe(2 + 6);
  });

  /* Un KC1 800x600 ne releve d'aucune gamme de cotes : c'est un rectangle,
     donc 2 rails quelle que soit sa taille. */
  it('compte les rectangles de chantier a 2 rails, sans regarder la cote', () => {
    const r = compterBrides([
      { texte: 'KC1.800.600.C1.BTR.R.IS.BRUT IS KC1', quantite: 7 },
    ]);
    expect(r.aVerifier).toEqual([]);
    expect(r.brides).toBe(14);
  });

  /* Un disque de chantier lit la table des disques : 650 -> 2 rails. */
  it('compte les disques de chantier sur la table des disques', () => {
    const r = compterBrides([
      { texte: 'BK1.650.C1.BTR.R.IS.BRUT BKSPFO PIETON EN 650 KIT RAIL', quantite: 4 },
    ]);
    expect(r.brides).toBe(8);
  });
});

describe('les articles crees pour une affaire, quand ils annoncent un kit rail', () => {
  /* ⚠️ Sur le devis AF036911, les quatre « BKSPFO PIETON EN 650 CL 1 KIT RAIL »
     portent la reference GEAF036911-2 — le numero du devis. Aucune table ne
     peut les rattacher, et ils portent pourtant des rails. */
  it('compte 2 rails quand « kit rail » est ecrit et la cote lisible', () => {
    const r = compterBrides([
      { texte: 'GEAF036911-2 BKSPFO PIETON EN 650 CL 1 KIT RAIL', quantite: 4 },
    ]);
    expect(r.aVerifier).toEqual([]);
    expect(r.brides).toBe(8);
    expect(r.lignes[0].famille).toBe('KIT RAIL');
    expect(r.lignes[0].cote).toBe('650');
  });

  /* ⚠️ LE GARDE-FOU. Sans « kit rail » ecrit, on ne lit aucune cote : le
     premier nombre venu d'une designation quelconque deviendrait sinon une
     taille de panneau. */
  it('ne lit aucune cote sans la mention « kit rail »', () => {
    const r = compterBrides([
      { texte: 'GEAF036911-2 BKSPFO PIETON EN 650 CL 1', quantite: 4 },
      { texte: 'SG80401_5.1500.IS.BRUT IS SUPPORT AG 80X40 1.5 LG 1500', quantite: 14 },
      { texte: 'ALIM.BOITIERPILES Boitier alim 2 piles + jack et platine', quantite: 3 },
    ]);
    expect(r.brides).toBe(0);
    expect(r.aVerifier).toEqual([]);
  });

  /* ⚠️ On n'affirme que ce sur quoi toutes les formes s'accordent : jusqu'a
     850. Au-dela le carre passe a 3 rails et le triangle non — la forme
     manque, on signale au lieu de trancher. */
  it('signale au lieu de deviner au-dela de la plage d’accord', () => {
    const r = compterBrides([
      { texte: 'GEAF000000-1 PANNEAU SPECIFIQUE 1200 KIT RAIL', quantite: 2 },
      { texte: 'GEAF000000-2 PANNEAU SPECIFIQUE KIT RAIL', quantite: 1 },
    ]);
    expect(r.brides).toBe(0);
    expect(r.aVerifier.map(v => v.raison))
      .toEqual(['cote absente de la table', 'famille inconnue']);
  });
});
