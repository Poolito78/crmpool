import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { useReordonnerAppuiLong } from './useReordonnerAppuiLong';
import { placer, LISTE_RACINE, type StructureNav } from '@/lib/ordreNav';

/* jsdom 20 n'a ni PointerEvent ni elementFromPoint : on les simule. Chaque
   ligne affichée (lien, en-tête de groupe, page d'un groupe) mesure 40 px,
   empilée dans l'ordre du DOM ; un groupe couvre son en-tête et ses pages. */
class FauxPointerEvent extends MouseEvent {
  isPrimary = true;
  pointerId = 1;
}
beforeAll(() => {
  Object.assign(globalThis, { PointerEvent: FauxPointerEvent });
  Object.assign(window, { PointerEvent: FauxPointerEvent });
});

const H = 40;
const lignes = () => Array.from(document.querySelectorAll<HTMLElement>('[data-ligne]'));
function poser() {
  const ls = lignes();
  const rect = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON() {} });
  ls.forEach((el, i) => {
    const bloc = el.closest<HTMLElement>('[data-reordre-cle]')!;
    if (bloc === el) el.getBoundingClientRect = () => rect(i * H, H);
  });
  // Un groupe : de son en-tête à sa dernière page.
  document.querySelectorAll<HTMLElement>('[data-groupe]').forEach(g => {
    const mes = ls.filter(l => g.contains(l));
    const i0 = ls.indexOf(mes[0]);
    g.getBoundingClientRect = () => rect(i0 * H, mes.length * H);
  });
  document.elementFromPoint = (_x: number, y: number) => lignes()[Math.floor(y / H)] ?? null;
}

const clics: string[] = [];
function Menu() {
  const [s, setS] = useState<StructureNav>({ racine: ['a', 'groupe:G', 'b'], groupes: { G: ['g1', 'g2'] } });
  const { poignee } = useReordonnerAppuiLong({
    deplacer: (cle, liste, vers, apres) => setS(x => placer(x, cle, liste, vers, apres)),
    entrer: (cle, g) => setS(x => x.groupes[g].includes(cle) ? x : placer(x, cle, g, null, false)),
    accepte: (gl, liste) => liste === LISTE_RACINE || !gl.cle.startsWith('groupe:'),
    terminer: () => {},
  });
  return (
    <nav>
      {s.racine.map(c => c.startsWith('groupe:')
        ? (
          <div key={c} data-groupe {...poignee(LISTE_RACINE, c)}>
            <div data-ligne data-reordre-conteneur="G">G</div>
            {s.groupes.G.map(p => <div key={p} data-ligne {...poignee('G', p)}>{p}</div>)}
          </div>
        )
        : <div key={c} data-ligne {...poignee(LISTE_RACINE, c)} onClick={() => clics.push(c)}>{c}</div>)}
    </nav>
  );
}

const ev = (type: string, y: number) => new FauxPointerEvent(type, { bubbles: true, clientX: 10, clientY: y, button: 0 });
/** Le menu à plat : « G[…] » pour le groupe. */
const vue = () => Array.from(document.querySelector('nav')!.children).map(el =>
  (el as HTMLElement).dataset.groupe !== undefined
    ? `G[${Array.from(el.children).slice(1).map(p => p.textContent).join(' ')}]`
    : el.textContent).join(' ');

function appuyer(y: number) {
  const el = lignes()[Math.floor(y / H)];
  act(() => { el.dispatchEvent(ev('pointerdown', y)); });
  act(() => { vi.advanceTimersByTime(500); });
}
function glisser(y: number) {
  act(() => { window.dispatchEvent(ev('pointermove', y)); poser(); });
}

afterEach(() => { vi.useRealTimers(); clics.length = 0; });

describe('useReordonnerAppuiLong', () => {
  it('appui long puis glisser au premier niveau ; le clic qui suit est avalé', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    expect(vue()).toBe('a G[g1 g2] b');
    appuyer(180); // b
    glisser(5);   // haut de « a »
    expect(vue()).toBe('b a G[g1 g2]');
    act(() => { window.dispatchEvent(ev('pointerup', 5)); });
    act(() => { lignes()[0].click(); });
    expect(clics).toEqual([]);
  });

  it('une page sort de son groupe vers le premier niveau', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    appuyer(85);  // g1
    glisser(185); // bas de « b »
    expect(vue()).toBe('a G[g2] b g1');
  });

  it('une entrée du premier niveau entre dans un groupe', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    appuyer(180); // b
    glisser(145); // bas de g2
    expect(vue()).toBe('a G[g1 g2 b]');
  });

  it('s\'attarder sur l\'en-tête d\'un groupe y fait entrer', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    appuyer(5);   // a
    glisser(45);  // en-tête G, moitié haute du groupe : a reste avant G
    expect(vue()).toBe('a G[g1 g2] b');
    act(() => { vi.advanceTimersByTime(700); poser(); });
    expect(vue()).toBe('G[a g1 g2] b');
  });

  it('un groupe ne se pose pas dans un groupe', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    appuyer(45);  // en-tête G
    glisser(105); // sur g2 : la cible remonte au groupe lui-même
    expect(vue()).toBe('a G[g1 g2] b');
  });

  it('appui bref : rien ne bouge et le clic passe', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { lignes()[0].dispatchEvent(ev('pointerdown', 5)); });
    act(() => { vi.advanceTimersByTime(200); window.dispatchEvent(ev('pointerup', 5)); });
    glisser(185);
    act(() => { lignes()[0].click(); });
    expect(vue()).toBe('a G[g1 g2] b');
    expect(clics).toEqual(['a']);
  });

  it('bouger avant le délai (défilement) annule l\'appui', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { lignes()[0].dispatchEvent(ev('pointerdown', 5)); });
    act(() => { window.dispatchEvent(ev('pointermove', 60)); });
    act(() => { vi.advanceTimersByTime(500); });
    glisser(185);
    expect(vue()).toBe('a G[g1 g2] b');
  });
});
