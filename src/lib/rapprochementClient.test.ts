import { describe, it, expect } from 'vitest';
import {
  rapprocherClient, motsCles, normaliser, motsFrequentsDuCatalogue,
} from './rapprochementClient';

const c = (id: string, societe: string, nom = '') => ({ id, societe, nom });

/* Un fichier client de la même forme que le vrai : cinquante sociétés, dont
   sept portent « SIGNALISATION », cinq « AGILIS » et cinq « MARQUAGE ». Ce
   sont ces répétitions qui font tout l'intérêt de la pondération. */
const CLIENTS = [
  c('horus', 'HORUS', 'Matthieu NOLLET'),
  c('reflex', 'REFLEX SIGNALISATION'),
  c('agilis-n', 'AGILIS NORD'),
  c('agilis-s', 'AGILIS SUD'),
  c('agilis-e', 'AGILIS EST'),
  c('agilis-o', 'AGILIS OUEST'),
  c('agilis-sig', 'AGILIS SIGNALISATION'),
  c('girod', 'SIGNAUX GIROD'),
  c('marq-71', 'MARQUAGE 71'),
  c('marq-sud', 'MARQUAGE SUD'),
  c('marq-plus', 'MARQUAGE PLUS'),
  c('sig-ouest', 'SIGNALISATION OUEST'),
  c('sig-est', 'SIGNALISATION EST'),
  c('sig-idf', 'SIGNALISATION IDF'),
  c('beauregard', 'BEAUREGARD TP', 'Léa Vasseur'),
  c('batiment', 'BÂTIMENT LÉGER'),
  c('serv-resine', 'SERVICES & RESINE'),
  c('villequip', "VILL'EQUIP"),
  // Le fichier réel porte deux fois la même société, l'une sans contact.
  c('reflex-2', 'REFLEX SIGNALISATION', 'Thierry BARAILLER'),
  // De quoi étoffer le fichier, pour que la rareté ait un sens.
  ...Array.from({ length: 34 }, (_, i) => c(`x${i}`, `ENTREPRISE VARIEE ${i} ZETA${i}`)),
];

describe('normalisation', () => {
  it('efface accents, casse et ponctuation', () => {
    expect(normaliser('Bâtiment Léger, S.A.S.')).toBe('BATIMENT LEGER S A S');
  });

  it('écarte les formes juridiques et les mots trop courts', () => {
    expect(motsCles('Sté HORUS SAS')).toEqual(['HORUS']);
    expect(motsCles('Groupe Marquage 71')).toEqual(['MARQUAGE']);
  });
});

describe('reconnaissance dans un texte tapé', () => {
  /* LE CAS QUI MOTIVE TOUT : pas d'adresse e-mail, le nom du client est
     seulement dans la phrase. */
  it('reconnaît un nom distinctif au milieu d’une demande', () => {
    const r = rapprocherClient(
      'Peux-tu me faire un devis pour HORUS, 30 m² de Flowshield Comfort 3mm ?',
      undefined, CLIENTS);
    expect(r.retenu?.id).toBe('horus');
    expect(r.pourquoi).toMatch(/HORUS/);
  });

  it('trouve le client même quand le modèle n’a extrait aucun nom', () => {
    expect(rapprocherClient('devis beauregard tp 40m2', undefined, CLIENTS).retenu?.id)
      .toBe('beauregard');
  });

  it('se moque des accents et de la casse', () => {
    expect(rapprocherClient('commande batiment leger', undefined, CLIENTS).retenu?.id)
      .toBe('batiment');
    expect(rapprocherClient('commande Bâtiment Léger', undefined, CLIENTS).retenu?.id)
      .toBe('batiment');
  });

  /* L'INCIDENT QUI A MOTIVÉ LA PONDÉRATION. « SIGNALISATION » désigne sept
     clients : il ne peut pas, à lui seul, en désigner un. REFLEX
     SIGNALISATION arrivait pourtant sur un devis AGILIS, avec son contrat
     cadre et ses prix, parce qu'il était le premier du tableau à contenir
     le mot. */
  it('ne laisse pas un mot commun désigner un client', () => {
    const r = rapprocherClient('demande de signalisation pour un chantier',
      undefined, CLIENTS);
    expect(r.retenu).toBeUndefined();
    expect(r.pourquoi).toMatch(/ne désigne personne|plusieurs/);
  });

  /* Cinq sociétés portent AGILIS : le choix revient à l'utilisateur. Mais on
     lui rend la liste plutôt que le silence. */
  it('s’abstient et propose la liste quand plusieurs clients répondent', () => {
    const r = rapprocherClient('devis pour AGILIS', undefined, CLIENTS);
    expect(r.retenu).toBeUndefined();
    expect(r.candidats.length).toBeGreaterThanOrEqual(5);
    expect(r.candidats.every(x => x.client.societe.startsWith('AGILIS'))).toBe(true);
    expect(r.pourquoi).toMatch(/plusieurs/);
  });

  /* La raison sociale citée en entier lève l'ambiguïté d'un mot partagé. */
  it('tranche quand la raison sociale est écrite en entier', () => {
    expect(rapprocherClient('devis AGILIS SIGNALISATION 12 balises', undefined, CLIENTS)
      .retenu?.id).toBe('agilis-sig');
    // Deux fiches REFLEX existent : voir « formes écrites autrement » plus bas.
    expect(rapprocherClient('bon de commande REFLEX SIGNALISATION', undefined, CLIENTS)
      .retenu?.societe).toBe('REFLEX SIGNALISATION');
  });

  it('utilise le nom extrait en plus du texte, jamais à sa place', () => {
    // Le texte ne nomme personne ; le nom extrait, si.
    expect(rapprocherClient('merci de chiffrer 40 m2', 'Signaux Girod', CLIENTS)
      .retenu?.id).toBe('girod');
    // Et l'inverse : le nom extrait est faux, le texte a raison.
    expect(rapprocherClient('devis pour BEAUREGARD TP', 'Manue', CLIENTS)
      .retenu?.id).toBe('beauregard');
  });

  /* « SUD » ne doit pas se reconnaître dans « SUDOKU » : c'est ce que
     faisait l'inclusion de chaîne. */
  it('compare des mots entiers, pas des morceaux', () => {
    expect(rapprocherClient('livraison à Sudoku Street', undefined, CLIENTS).retenu)
      .toBeUndefined();
    expect(rapprocherClient('HORUSSON', undefined, CLIENTS).retenu).toBeUndefined();
  });

  it('reconnaît aussi par le nom du contact', () => {
    expect(rapprocherClient('demande de Matthieu NOLLET', undefined, CLIENTS)
      .retenu?.id).toBe('horus');
  });

  it('ne reconnaît rien dans un texte qui ne nomme aucun client', () => {
    const r = rapprocherClient('30 m² à traiter avant vendredi', undefined, CLIENTS);
    expect(r.retenu).toBeUndefined();
    expect(r.candidats).toHaveLength(0);
  });

  it('ne s’effondre pas sur les cas vides', () => {
    expect(rapprocherClient('', undefined, CLIENTS).retenu).toBeUndefined();
    expect(rapprocherClient('devis HORUS', undefined, []).retenu).toBeUndefined();
    expect(rapprocherClient('   ', 'HORUS', []).candidats).toHaveLength(0);
  });
});

/* Le vocabulaire du métier, tel que le catalogue le donne : RESINE figure
   dans 58 désignations, ROUTE dans 11. */
const METIER = motsFrequentsDuCatalogue([
  ...Array.from({ length: 58 }, () => ({ description: 'RESINE EPOXY BICOMPOSANT' })),
  ...Array.from({ length: 11 }, () => ({ description: 'PLOT DE ROUTE 360' })),
  ...Array.from({ length: 3 }, () => ({ description: 'HORUS RARE' })),
]);

describe('le vocabulaire du métier fait contre-épreuve', () => {
  it('ne retient que les mots vraiment courants au catalogue', () => {
    expect(METIER.has('RESINE')).toBe(true);
    expect(METIER.has('ROUTE')).toBe(true);
    // Trois articles seulement : sous le seuil, ce n'est pas du vocabulaire.
    expect(METIER.has('HORUS')).toBe(false);
  });

  /* LE FAUX POSITIF QUE LE FICHIER RÉEL A RÉVÉLÉ. « RESINE » ne désigne
     qu'une société sur cinquante — il vaut donc très cher au calcul de
     rareté — mais il figure dans 58 désignations d'articles. Sans
     contre-épreuve, une demande de résine sortait SERVICES & RESINE. */
  it('ne prend pas un mot de métier pour un nom de client', () => {
    const sans = rapprocherClient('30 m² de résine époxy sur béton', undefined, CLIENTS);
    expect(sans.retenu?.id).toBe('serv-resine');          // sans le catalogue

    const avec = rapprocherClient('30 m² de résine époxy sur béton', undefined, CLIENTS, METIER);
    expect(avec.retenu).toBeUndefined();                   // avec
  });

  it('laisse passer un vrai client cité à côté d’un mot de métier', () => {
    expect(rapprocherClient('devis HORUS 40 m2 de resine', undefined, CLIENTS, METIER)
      .retenu?.id).toBe('horus');
  });
});

describe('formes écrites autrement', () => {
  /* « VILL'EQUIP » se normalise en deux mots, « Villequip » n'en fait qu'un :
     aucun des deux ne rencontrait l'autre. */
  it('reconnaît un nom dont l’apostrophe a sauté', () => {
    expect(rapprocherClient('chiffrage pour Villequip', undefined, CLIENTS).retenu?.id)
      .toBe('villequip');
    expect(rapprocherClient("VILL'EQUIP - 30 plots", undefined, CLIENTS).retenu?.id)
      .toBe('villequip');
  });

  /* Le fichier porte deux fiches REFLEX SIGNALISATION. S'abstenir alors que
     la raison sociale est écrite en toutes lettres serait absurde : on prend
     la plus renseignée, et on dit que le doublon existe. */
  it('tranche entre deux fiches de la même société, et le dit', () => {
    const r = rapprocherClient('bon de commande REFLEX SIGNALISATION', undefined, CLIENTS);
    expect(r.retenu?.id).toBe('reflex-2');       // celle qui porte un contact
    expect(r.pourquoi).toMatch(/2 fiches portent/);
  });
});
