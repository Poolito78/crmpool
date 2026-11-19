import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  localiserSymboles, formeDuMasque, zoneDuSigne, empreinte, empreintePictogramme, reconnaissance,
  vignetteSymbole, panneauxAnnonces, estPlanDePanneauxEnImage, lignesDesPanneaux, avecPanneauxDuPlan,
  estPanneauAVerifier, libellePanneauPlan, type Empreinte, type ImageRVBA, type PanneauDetecte,
} from './panneauxSurPlan';
import { codeDansTexte, normaliserCodes } from './tarifPanneaux';

/* ── outils de dessin ── */
type RVB = [number, number, number];
function toile(w: number, h: number, fond: RVB = [255, 255, 255]): ImageRVBA {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) { data.set(fond, p * 4); data[p * 4 + 3] = 255; }
  return { data, width: w, height: h };
}
function peindre(img: ImageRVBA, dedans: (x: number, y: number) => boolean, c: RVB) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) if (dedans(x, y)) img.data.set(c, (y * img.width + x) * 4);
  }
}
const BLEU: RVB = [20, 80, 200];
const ROUGE: RVB = [220, 20, 30];
const NOIR: RVB = [20, 20, 20];
const disque = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const couronne = (cx: number, cy: number, r: number, e: number) => (x: number, y: number) => {
  const d = Math.hypot(x - cx, y - cy);
  return d <= r && d >= r - e;
};

describe('localiserSymboles', () => {
  it('trouve un rond bleu et une couronne rouge, pas les traits de cote ni une croix', () => {
    const img = toile(240, 80);
    peindre(img, disque(30, 40, 11), BLEU);
    peindre(img, (x, y) => y >= 38 && y <= 42 && x >= 24 && x <= 36, [255, 255, 255]); // flèche blanche
    peindre(img, couronne(80, 40, 12, 3), ROUGE);
    peindre(img, (x, y) => y === 10 && x >= 110 && x <= 230, ROUGE); // trait de cote
    peindre(img, (x, y) => (Math.abs(x - 150 - (y - 40)) <= 1 || Math.abs(x - 150 + (y - 40)) <= 1)
      && Math.abs(y - 40) <= 10, ROUGE); // deux traits qui se croisent
    peindre(img, (x, y) => x >= 190 && x <= 230 && y >= 60 && y <= 63, [30, 30, 140]); // bordure marine
    const b = localiserSymboles(img.data, img.width, img.height).sort((u, v) => u.x - v.x);
    expect(b.map(x => x.couleurs)).toEqual([['bleu'], ['rouge']]);
    expect(b[0]).toMatchObject({ x: 19, y: 29, w: 23, h: 23 });
  });

  it('deux symboles accolés sur un mât restent deux ; une couronne autour d’un fond bleu fait un seul panneau', () => {
    const img = toile(120, 80);
    peindre(img, disque(25, 20, 10), BLEU);
    peindre(img, couronne(25, 41, 11, 3), ROUGE);
    peindre(img, disque(85, 40, 11), BLEU);
    peindre(img, couronne(85, 40, 13, 3), ROUGE); // stationnement interdit
    const b = localiserSymboles(img.data, img.width, img.height);
    expect(b).toHaveLength(3);
    expect(b.find(x => x.x > 60)?.couleurs.sort()).toEqual(['bleu', 'rouge']);
  });
});

describe('formeDuMasque', () => {
  const masque = (w: number, h: number, f: (x: number, y: number) => boolean) => {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = f(x, y) ? 1 : 0;
    return m;
  };
  it('triangle, triangle inversé, carré, rond', () => {
    expect(formeDuMasque(masque(20, 18, (x, y) => Math.abs(x - 9.5) <= (y + 1) * 0.55), 20, 18)).toBe('triangle');
    expect(formeDuMasque(masque(20, 18, (x, y) => Math.abs(x - 9.5) <= (18 - y) * 0.55), 20, 18)).toBe('triangle_inverse');
    expect(formeDuMasque(masque(20, 20, () => true), 20, 20)).toBe('carre');
    expect(formeDuMasque(masque(21, 21, disque(10, 10, 10.5)), 21, 21)).toBe('rond');
  });
});

describe('pictogrammes IISR', () => {
  it('la légende noire à côté du signe n’entre pas dans sa zone', () => {
    const img = toile(64, 64);
    peindre(img, disque(20, 32, 12), ROUGE);
    peindre(img, (x, y) => x >= 40 && x <= 62 && y >= 28 && y <= 36 && x % 3 !== 0, NOIR); // « Arrêt de p… »
    const z = zoneDuSigne(img)!;
    expect(z.x).toBe(8);
    expect(z.x + z.w).toBeLessThanOrEqual(33);
  });

  it('un code n’est retenu que s’il se détache ; un panonceau (M…) n’est jamais candidat', () => {
    const stop = toile(64, 64);
    peindre(stop, disque(20, 32, 14), ROUGE);
    peindre(stop, (x, y) => y >= 29 && y <= 35 && x >= 10 && x <= 30, [255, 255, 255]);
    const rondBleu = toile(64, 64);
    peindre(rondBleu, disque(20, 32, 14), BLEU);
    const index = new Map<string, Empreinte>([
      ['AB4', empreintePictogramme(stop)!],
      ['B21b', empreintePictogramme(rondBleu)!],
      ['B21e', empreintePictogramme(rondBleu)!],
      ['M9z', empreintePictogramme(stop)!],
    ]);
    const plan = toile(30, 30, [235, 240, 230]);
    peindre(plan, disque(15, 15, 10), ROUGE);
    peindre(plan, (x, y) => y >= 13 && y <= 17 && x >= 8 && x <= 22, [250, 250, 250]);
    const boite = { x: 5, y: 5, w: 21, h: 21, couleurs: ['rouge' as const] };
    const r = reconnaissance(empreinte(vignetteSymbole(plan, boite))!, index);
    expect(r.code).toBe('AB4');
    expect(r.candidats.map(c => c.code)).not.toContain('M9z');

    const bleu = toile(30, 30);
    peindre(bleu, disque(15, 15, 10), BLEU);
    const r2 = reconnaissance(empreinte(vignetteSymbole(bleu, { ...boite, couleurs: ['bleu'] }))!, index);
    expect(r2.code).toBeNull();
    expect(r2.candidats.slice(0, 2).map(c => c.code).sort()).toEqual(['B21b', 'B21e']);
  });
});

/* ── Le plan CD28 d'AGILIS (« Plan Panneau pour CD28.pdf ») : trois zones de
   la page rendue à 5 000 px, avec le fouillis qui entoure les panneaux
   (bordures magenta, cotes rouges, hachures vertes). Sept panneaux : J5,
   rond bleu, rond bleu, B2c, J5, STOP dans la première zone et la deuxième,
   le triangle AB1 dans la troisième. ── */
describe('plan CD28 (pixels réels)', () => {
  const fixture = JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/planPanneauxCD28.json'), 'utf8')) as {
    zones: { x: number; y: number; w: number; h: number; rgb: string }[];
  };
  const zones = fixture.zones.map(z => {
    const rgb = Buffer.from(z.rgb, 'base64');
    const img = toile(z.w, z.h);
    for (let p = 0; p < z.w * z.h; p++) img.data.set([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]], p * 4);
    return { ...z, img };
  });

  it('localise les 7 panneaux et rien d’autre', () => {
    const vus = zones.flatMap(z => localiserSymboles(z.img.data, z.w, z.h)
      .map(b => ({ x: z.x + b.x, y: z.y + b.y, forme: b.forme, couleurs: b.couleurs })));
    expect(vus).toHaveLength(7);
    expect(vus.filter(v => v.couleurs.includes('rouge'))).toHaveLength(3);
    expect(vus.find(v => v.x > 1300)?.forme).toBe('triangle');
  });

  /* La bibliothèque du Chiffrage se décode avec @napi-rs/canvas (dépendance
     de pdf.js) ; absente, ce test est sauté plutôt que faux. */
  it('reconnaît le STOP et les deux J5 ; le B2c reste à vérifier parmi ses voisins', async () => {
    let napi: typeof import('@napi-rs/canvas') | null = null;
    try { napi = await import('@napi-rs/canvas'); } catch { /* absent */ }
    if (!napi) return;
    const lib = JSON.parse(readFileSync(resolve(__dirname, '../../public/iisr_pictos.json'), 'utf8')) as Record<string, string>;
    const index = new Map<string, Empreinte>();
    for (const [code, url] of Object.entries(lib)) {
      const im = await napi.loadImage(Buffer.from(url.split(',')[1], 'base64'));
      const c = napi.createCanvas(im.width, im.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, im.width, im.height); ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, im.width, im.height);
      const f = empreintePictogramme({ data: d.data, width: d.width, height: d.height });
      if (f) index.set(code, f);
    }
    const lus = zones.flatMap(z => localiserSymboles(z.img.data, z.w, z.h).map(b => {
      const f = empreinte(vignetteSymbole(z.img, b))!;
      return { x: z.x + b.x, y: z.y + b.y, ...reconnaissance({ ...f, forme: b.forme }, index) };
    })).sort((a, b) => a.y - b.y || a.x - b.x);
    expect(lus.map(l => l.code)).toEqual([null, 'J5', null, null, null, 'AB4', 'J5']);
    const b2c = lus.find(l => l.x > 760 && l.x < 780 && l.y > 2190 && l.y < 2200)!;
    expect(b2c.candidats.map(c => c.code)).toContain('B2c');
  }, 30_000);
});

describe('demande et lignes', () => {
  it('le nombre de panneaux annoncé par le mail', () => {
    expect(panneauxAnnonces('Suite à notre échange, voici les 7 panneaux :')).toBe(7);
    expect(panneauxAnnonces('il faut sept panneaux')).toBe(7);
    expect(panneauxAnnonces('Panneaux sous fourreaux.')).toBeNull();
  });

  it('un plan à lire sur le dessin : PDF sans texte et une demande de panneaux', () => {
    expect(estPlanDePanneauxEnImage(['', '  '], 'voici les 7 panneaux', 'plan.pdf')).toBe(true);
    expect(estPlanDePanneauxEnImage([''], 'bonjour', 'Plan Panneau pour CD28.pdf')).toBe(true);
    expect(estPlanDePanneauxEnImage(['Devis n° 123 du 12/11/2026 — 7 panneaux AB4, total 1 250,00 € HT'], 'panneaux', 'devis.pdf')).toBe(false);
    expect(estPlanDePanneauxEnImage([''], 'merci pour la résine', 'chantier.pdf')).toBe(false);
  });

  const p = (code: string | null): PanneauDetecte => ({
    page: 1, boite: { x: 0, y: 0, w: 20, h: 20, couleurs: ['bleu'] }, candidats: [], code,
  });

  it('une ligne par panneau ; le code seul se lit comme un code, l’inconnu comme rien', () => {
    const l = lignesDesPanneaux([p('AB4'), p(null), p('J5')]);
    expect(l.map(x => x.description)).toEqual(['AB4', 'Panneau n° 2 détecté sur le plan — code à vérifier', 'J5']);
    expect(l.every(x => x.quantite === 1)).toBe(true);
    expect(codeDansTexte(normaliserCodes(l[0].description))?.code).toBe('AB4');
    expect(codeDansTexte(normaliserCodes(l[1].description))).toBeNull();
    expect(estPanneauAVerifier(l[1].description)).toBe(true);
    expect(estPanneauAVerifier(libellePanneauPlan('B21A2', 2))).toBe(false);
  });

  it('le résumé « 7 panneaux » de l’IA cède la place au détail du plan', () => {
    const { lignes, resumees } = avecPanneauxDuPlan(
      [{ reference: '', description: 'Panneaux sous fourreaux', quantite: 7 }, { reference: '', description: 'Mât 3 m', quantite: 2 }],
      [p('AB4'), p(null)],
      t => !!codeDansTexte(t),
    );
    expect(resumees).toEqual(['Panneaux sous fourreaux']);
    expect(lignes.map(l => l.description)).toEqual(['Mât 3 m', 'AB4', 'Panneau n° 2 détecté sur le plan — code à vérifier']);
  });
});
