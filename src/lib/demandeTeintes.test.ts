import { describe, expect, it } from 'vitest';
import type { Devis, LigneDevis } from './store';
import {
  chiffrerTeintes, lireDemandeTeintes, modelesPourDemande, noteDesZones, pigmentDuModele,
  quantitesChantier, ralDeCouleur, reglePigment, remplacerPigments, surfaceDeZone,
  surfacesDuChantier, teintesDeTexte, teintesDuChantier,
} from './demandeTeintes';

/* La demande EMPREINTE SIGNA du 09/11/2026, telle qu'elle est collée. */
const DEMANDE = `client empriente signa
systeme flowcoat sf41 version Blank et pigment

Couleur\tSystème\tDétail\tdes Surfaces
RAL 5017 bleu\tAnti glissant\t13 allées piétonnes : 290 + 48 + 43 + 7 + 13,2 + 83,4 + 6 + 3\t493,6 m²
RAL 1015 ivoire clair\tAnti glissant\tEffacement : 4 zones (1 + 17,6 + 2 + 58)\t79 m²
RAL 3020 rouge\tAnti glissant\t1 carré de 6,5 × 7 m\t45,5 m²
Jaune / noir (zébra)\tAnti derapant\tEntrée, 8 × 2 m\t16 m²
Jaune / noir (zébra)\tAnti glissant\tPorte piétonne, 2 × 1,5 m\t3 m²
Total\t\t\t637,1 m²

Traçages en mètres linéaires et pictos (blanc) :

Bandes blanches périphériques : 979 ml
Pointillés blancs : 150 ml
Pictos piétons : 58

Effacement de bandes en RAL 1015 : 40 ml
`;

const ARTICLES = [
  { id: 'blank', reference: 'FLOWCOATSF41B', description: 'FLOWCOAT SF41 BLANK (14 kg)', poids: 14 },
  { id: 'quartz', reference: 'QUARTZ0308', description: 'Quartz 0,3- 0,8 (25 kg)', poids: 25 },
  { id: 'pig1', reference: 'PIGMENTKG', description: 'Pigment poudre micronisé (kg)', poids: 1 },
  { id: 'pig2', reference: 'PIGMENT2KG', description: 'Pigment poudre micronisé (2 kg)', poids: 2 },
];
const articleDe = (id: string | undefined) => ARTICLES.find(a => a.id === id);

const ligne = (l: Partial<LigneDevis> & { id: string }): LigneDevis => ({
  description: '', quantite: 0, unite: 'U', prixUnitaireHT: 0, tva: 20, remise: 0, ...l,
});
const devis = (d: Partial<Devis> & { numero: string; lignes: LigneDevis[] }): Devis => ({
  id: d.numero, statut: 'envoyé', dateCreation: '2026-10-01', ...d,
} as Devis);

/* Le modèle « Quarté Anti Glisse » et le devis réalisé DEV-2026-168, tels qu'en base. */
const MODELE = devis({
  numero: 'SYS - Flowcoat SF41 0,5-1mm Quarté Anti Glisse', statut: 'système',
  systeme: 'Flowcoat SF41 0,5-1mm Quarté Anti Glisse', surfaceGlobaleM2: 215,
  lignes: [
    ligne({ id: 'a', produitId: 'blank', consommation: 0.4, qteMode: 'chantier', quantite: 16, surfaceM2: 215 }),
    ligne({ id: 'b', produitId: 'quartz', consommation: 2, quantite: 18, surfaceM2: 215 }),
    ligne({ id: 'c', produitId: 'blank', consommation: 0.6, qteMode: 'chantier', quantite: 0, surfaceM2: 215 }),
    ligne({ id: 'd', produitId: 'pig1', consommation: 0.072, quantite: 16, surfaceM2: 215, variantesChoisies: { t: 'RAL 1000' } }),
  ],
});
const MODELE_LISSE = devis({
  numero: 'SYS - Flowcoat SF41 0,5-1mm', statut: 'système', systeme: 'Flowcoat SF41 0,5-1mm',
  lignes: [
    ligne({ id: 'a', produitId: 'blank', consommation: 0.5 }),
    ligne({ id: 'c', produitId: 'blank', consommation: 0.3 }),
    ligne({ id: 'd', produitId: 'pig1', consommation: 0.057, variantesChoisies: { t: 'RAL 1000' } }),
  ],
});
const DEV168 = devis({
  numero: 'DEV-2026-168', dateCreation: '2026-10-29',
  lignes: [
    ligne({ id: '1', produitId: 'blank', consommation: 0.5 }),
    ligne({ id: '2', produitId: 'pig2', consommation: 0.114, surfaceM2: 202.4, variantesChoisies: { t: '319 (RAL 1023, Traffic Yellow)' } }),
    ligne({ id: '3', produitId: 'pig1', consommation: 0.057, surfaceM2: 91.7, variantesChoisies: { t: 'RAL 9016' } }),
    ligne({ id: '4', produitId: 'pig1', consommation: 0.057, surfaceM2: 17.5, variantesChoisies: { t: '990 (RAL 9005, Jet Black)' } }),
  ],
});

describe('lireDemandeTeintes', () => {
  const d = lireDemandeTeintes(DEMANDE);

  it('lit le client, le système et le total annoncé', () => {
    expect(d.client).toBe('empriente signa');
    expect(d.systeme).toBe('flowcoat sf41 version Blank et pigment');
    expect(d.totalAnnonceM2).toBe(637.1);
  });

  it('fait une zone de chaque ligne mesurée, pas de l\'en-tête ni du total', () => {
    expect(d.zones).toHaveLength(9);
    expect(d.zones.map(z => z.surfaceM2)).toEqual([493.6, 79, 45.5, 16, 3, undefined, undefined, undefined, undefined]);
  });

  it('ne prend pas « 3 493,6 » pour un millier', () => {
    expect(lireDemandeTeintes('RAL 5017 bleu allées : 6 + 3 493,6 m²').zones[0].surfaceM2).toBe(493.6);
  });

  it('lit RAL et couleur, et la finition', () => {
    expect(d.zones[0].teintes).toEqual([{ ral: '5017', couleur: 'bleu', part: 1 }]);
    expect(d.zones[1].teintes).toEqual([{ ral: '1015', couleur: 'ivoire', part: 1 }]);
    expect(d.zones[0].finition).toBe('Anti glissant');
    expect(d.zones[3].finition).toBe('Anti derapant');
  });

  it('partage un zébra : la première teinte entière, la seconde à moitié', () => {
    expect(d.zones[3].teintes).toEqual([{ couleur: 'jaune', part: 1 }, { couleur: 'noir', part: 0.5 }]);
  });

  it('signale un détail qui ne retombe pas sur la surface annoncée', () => {
    expect(d.zones[0].ecart).toBeUndefined();          // 290 + … + 3 = 493,6
    expect(d.zones[1].ecart).toContain('78,6');        // 1 + 17,6 + 2 + 58 ≠ 79
    expect(d.zones[2].ecart).toBeUndefined();          // 6,5 × 7 = 45,5
  });

  it('garde les mètres linéaires et les unités sans surface', () => {
    expect(d.zones[5]).toMatchObject({ libelle: 'Bandes blanches périphériques', lineaireMl: 979 });
    expect(d.zones[6]).toMatchObject({ lineaireMl: 150 });
    expect(d.zones[7]).toMatchObject({ libelle: 'Pictos piétons', nombre: 58 });
    expect(d.zones[8]).toMatchObject({ lineaireMl: 40 });
  });

  it('donne la teinte de l\'intertitre aux lignes qui n\'en nomment pas', () => {
    expect(d.zones[7].teintes).toEqual([{ couleur: 'blanc', part: 1 }]);
    expect(d.zones[8].teintes).toEqual([{ ral: '1015', part: 1 }]);
  });

  it('retire la mesure du libellé', () => {
    expect(d.zones[2].libelle).toBe('RAL 3020 rouge — Anti glissant — 1 carré de 6,5 × 7 m');
  });

  it('ne lit aucune zone dans une dictée sans teinte', () => {
    expect(lireDemandeTeintes('Devis société Dubois, 250 m², système Flowfast 319').zones).toEqual([]);
  });

  it('calcule un tracé dont la largeur est écrite', () => {
    const z = lireDemandeTeintes('Ligne jaune 0,10 m de largeur x 965 ml').zones[0];
    expect(z.surfaceM2).toBe(96.5);
  });
});

describe('teintesDeTexte', () => {
  it('reconnaît les accords', () => {
    expect(teintesDeTexte('Bandes blanches').map(t => t.couleur)).toEqual(['blanc']);
    expect(teintesDeTexte('zone grise et verte').map(t => t.couleur)).toEqual(['gris', 'vert']);
  });
  it('ne partage pas deux teintes hors d\'un motif bicolore', () => {
    expect(teintesDeTexte('jaune et noir').map(t => t.part)).toEqual([1, 1]);
  });
});

describe('surfaces', () => {
  const d = lireDemandeTeintes(DEMANDE);

  it('ne devine ni largeur ni surface de picto', () => {
    expect(surfaceDeZone(d.zones[5])).toBeUndefined();
    expect(surfaceDeZone(d.zones[7])).toBeUndefined();
    expect(surfacesDuChantier(d.zones).solM2).toBe(637.1);
  });

  it('calcule dès que la cote est saisie', () => {
    expect(surfaceDeZone(d.zones[5], { largeurM: 0.1 })).toEqual({ surfaceM2: 97.9, calcul: '979 ml × 0,1 m = 97,9 m²' });
    expect(surfaceDeZone(d.zones[7], { surfaceUniteM2: 0.129 })?.surfaceM2).toBe(7.482);
  });

  it('une surface corrigée à la main l\'emporte', () => {
    expect(surfaceDeZone(d.zones[1], { surfaces: { '1': 78.6 } })?.surfaceM2).toBe(78.6);
  });

  it('additionne par teinte, les zones sans surface à part', () => {
    const t = teintesDuChantier(d.zones);
    const par = Object.fromEntries(t.map(x => [x.cle, x]));
    expect(par['ral:5017'].surfaceM2).toBe(493.6);
    expect(par['ral:1015']).toMatchObject({ surfaceM2: 79, couleur: 'ivoire' });
    expect(par['ral:1015'].manque).toHaveLength(1);       // les 40 ml d'effacement
    expect(par['couleur:jaune'].surfaceM2).toBe(19);
    expect(par['couleur:noir'].surfaceM2).toBe(9.5);
    expect(par['couleur:blanc']).toMatchObject({ surfaceM2: 0 });
    expect(par['couleur:blanc'].manque).toHaveLength(3);
  });

  it('distingue le sol de la surface peinte', () => {
    expect(surfacesDuChantier(d.zones, { largeurM: 0.1 })).toEqual({ solM2: 754, peinteM2: 763.5 });
  });

  it('écrit la note des zones', () => {
    const note = noteDesZones(d.zones, { largeurM: 0.1 }).split('\n');
    expect(note[5]).toBe('Bandes blanches périphériques : 979 ml × 0,1 m = 97,9 m²');
    expect(note[7]).toBe('Pictos piétons : 58 unités — surface d\'une unité à préciser');
  });
});

describe('modèle et devis réalisés', () => {
  it('lit la ligne pigment du modèle', () => {
    expect(pigmentDuModele(MODELE, articleDe)).toEqual({ produitId: 'pig1', conso: 0.072 });
  });

  it('préfère le modèle antiglisse à une demande antidérapante', () => {
    const c = modelesPourDemande(DEMANDE, [MODELE_LISSE, MODELE, DEV168], articleDe);
    expect(c.map(x => x.nom)).toEqual(['Flowcoat SF41 0,5-1mm Quarté Anti Glisse', 'Flowcoat SF41 0,5-1mm']);
  });

  it('préfère le modèle lisse sans antidérapant', () => {
    const c = modelesPourDemande('système flowcoat sf41 blank, RAL 7035 : 100 m²', [MODELE, MODELE_LISSE], articleDe);
    expect(c[0].nom).toBe('Flowcoat SF41 0,5-1mm');
  });

  it('écarte un modèle d\'une autre gamme', () => {
    expect(modelesPourDemande('système flowfast 319 road', [MODELE], articleDe)).toEqual([]);
  });

  it('retrouve le RAL d\'une couleur dans les devis réalisés', () => {
    expect(ralDeCouleur('jaune', [DEV168, MODELE], articleDe)).toEqual({ ral: '1023', devis: 1 });
    expect(ralDeCouleur('noir', [DEV168], articleDe)?.ral).toBe('9005');
    expect(ralDeCouleur('blanc', [DEV168], articleDe)?.ral).toBe('9016');
    expect(ralDeCouleur('violet', [DEV168], articleDe)).toBeUndefined();
  });

  it('dose une teinte ordinaire comme le modèle', () => {
    expect(reglePigment('5017', MODELE, [DEV168], articleDe)).toMatchObject({ produitId: 'pig1', conso: 0.072 });
  });

  it('double la dose du RAL 1023 et prend son pot de 2 kg, comme DEV-2026-168', () => {
    const r = reglePigment('1023', MODELE, [DEV168], articleDe);
    expect(r).toMatchObject({ produitId: 'pig2', conso: 0.144 });
    expect(r?.source).toContain('DEV-2026-168');
  });

  it('garde la dose du modèle quand le devis réalisé dose la teinte comme les autres', () => {
    expect(reglePigment('9016', MODELE, [DEV168], articleDe)).toMatchObject({ produitId: 'pig1', conso: 0.072 });
  });

  it('ignore un devis qui ne partage que le quartz avec le modèle', () => {
    const flowfast = devis({
      numero: 'DEV-2026-165', dateCreation: '2026-11-01',
      lignes: [
        ligne({ id: 'q', produitId: 'quartz', consommation: 2 }),
        ...DEV168.lignes.filter(l => l.produitId !== 'blank').map(l => ({ ...l, consommation: (l.consommation ?? 0) * 3 })),
      ],
    });
    expect(reglePigment('1023', MODELE, [flowfast], articleDe)).toMatchObject({ produitId: 'pig1', conso: 0.072 });
    expect(reglePigment('1023', MODELE, [flowfast, DEV168], articleDe)?.source).toContain('DEV-2026-168');
  });

  it('ignore un devis qui ne partage aucun article avec le modèle', () => {
    const autre = devis({ numero: 'DEV-X', lignes: DEV168.lignes.filter(l => l.produitId !== 'blank') });
    expect(reglePigment('1023', MODELE, [autre], articleDe)).toMatchObject({ produitId: 'pig1', conso: 0.072 });
  });
});

describe('chiffrerTeintes', () => {
  const d = lireDemandeTeintes(DEMANDE);
  const teintes = teintesDuChantier(d.zones, { largeurM: 0.1, surfaceUniteM2: 0.129 });
  const lignes = chiffrerTeintes(teintes, MODELE, [DEV168], articleDe, { 'couleur:jaune': '1023', 'couleur:noir': '9005', 'couleur:blanc': '9016' });
  const par = Object.fromEntries(lignes.map(l => [l.cle, l]));

  it('compte un pot par teinte, arrondi au supérieur', () => {
    expect(par['ral:5017']).toMatchObject({ produitId: 'pig1', conso: 0.072, quantite: 36 });      // 493,6 × 0,072 = 35,5
    expect(par['ral:3020'].quantite).toBe(4);                                                       // 45,5 × 0,072 = 3,3
    expect(par['couleur:jaune']).toMatchObject({ ral: '1023', produitId: 'pig2', quantite: 2 });    // 19 × 0,144 / 2 = 1,4
    expect(par['couleur:noir']).toMatchObject({ ral: '9005', quantite: 1 });
    expect(par['ral:1015'].quantite).toBe(6);                                                       // (79 + 4) × 0,072 = 5,98
  });

  it('ne chiffre rien sans modèle, et le dit', () => {
    const [l] = chiffrerTeintes(teintes, undefined, [], articleDe);
    expect(l.quantite).toBeUndefined();
    expect(l.aVerifier.join(' ')).toContain('aucun devis modèle');
  });

  it('signale un RAL à préciser et les zones hors calcul', () => {
    const sans = chiffrerTeintes(teintesDuChantier(d.zones), MODELE, [], articleDe);
    const blanc = sans.find(l => l.cle === 'couleur:blanc')!;
    expect(blanc.aVerifier).toEqual(['RAL à préciser', '3 zones sans surface, hors du calcul']);
    expect(blanc.quantite).toBeUndefined();
  });
});

describe('lignes du modèle', () => {
  it('met les pigments des teintes à la place de celui du modèle', () => {
    const out = remplacerPigments(['r1', 'q', 'r2', 'P', 'fin'], ['p1', 'p2'], l => l === 'P');
    expect(out).toEqual(['r1', 'q', 'r2', 'p1', 'p2', 'fin']);
  });
  it('les ajoute à la fin quand le modèle n\'en a pas', () => {
    expect(remplacerPigments(['r1'], ['p1'], () => false)).toEqual(['r1', 'p1']);
  });

  it('arrondit une fois les couches d\'un même article', () => {
    const q = quantitesChantier(MODELE.lignes, 215, id => articleDe(id)?.poids);
    expect(q.get('a')).toBe(16);     // (0,4 + 0,6) × 215 / 14 = 15,4
    expect(q.get('c')).toBe(0);
    expect(q.has('b')).toBe(false);  // le quartz n'est pas en « Qté chantier »
  });
});
