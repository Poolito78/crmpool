import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { useReordonnerAppuiLong } from './useReordonnerAppuiLong';
import { deplacerCle } from '@/lib/ordreNav';

/* jsdom 20 n'a ni PointerEvent ni elementFromPoint : on les simule, chaque
   entrée mesurant 40 px de haut, empilées dans l'ordre du DOM. */
class FauxPointerEvent extends MouseEvent {
  isPrimary = true;
  pointerId = 1;
}
beforeAll(() => {
  Object.assign(globalThis, { PointerEvent: FauxPointerEvent });
  Object.assign(window, { PointerEvent: FauxPointerEvent });
});

const HAUTEUR = 40;
function entrees() { return Array.from(document.querySelectorAll<HTMLElement>('[data-reordre-cle]')); }
function poser() {
  entrees().forEach((el, i) => {
    el.getBoundingClientRect = () => ({ top: i * HAUTEUR, height: HAUTEUR, bottom: (i + 1) * HAUTEUR, left: 0, right: 200, width: 200, x: 0, y: i * HAUTEUR, toJSON() {} });
  });
  document.elementFromPoint = (_x: number, y: number) => entrees()[Math.floor(y / HAUTEUR)] ?? null;
}

const clics: string[] = [];
function Menu() {
  const [cles, setCles] = useState(['a', 'b', 'c']);
  const { poignee } = useReordonnerAppuiLong((_l, cle, vers) => setCles(c => deplacerCle(c, cle, vers)), () => {});
  return (
    <nav>
      {cles.map(c => (
        <div key={c} {...poignee('racine', c)} onClick={() => clics.push(c)}>{c}</div>
      ))}
    </nav>
  );
}

const ev = (type: string, y: number) => new FauxPointerEvent(type, { bubbles: true, clientX: 10, clientY: y, button: 0 });
const ordre = () => entrees().map(e => e.dataset.reordreCle).join('');

afterEach(() => { vi.useRealTimers(); clics.length = 0; });

describe('useReordonnerAppuiLong', () => {
  it('appui long puis glisser : l\'entrée change de place, le clic qui suit est avalé', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { entrees()[0].dispatchEvent(ev('pointerdown', 20)); });
    act(() => { vi.advanceTimersByTime(500); });
    // Au-delà du milieu de « b » (60) : a passe sous b.
    act(() => { window.dispatchEvent(ev('pointermove', 65)); poser(); });
    expect(ordre()).toBe('bac');
    act(() => { window.dispatchEvent(ev('pointermove', 105)); poser(); });
    expect(ordre()).toBe('bca');
    act(() => { window.dispatchEvent(ev('pointerup', 105)); });
    act(() => { entrees()[2].click(); });
    expect(clics).toEqual([]);
  });

  it('pas de va-et-vient : rester sur la cible ne la rééchange pas', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { entrees()[0].dispatchEvent(ev('pointerdown', 20)); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { window.dispatchEvent(ev('pointermove', 65)); poser(); });
    act(() => { window.dispatchEvent(ev('pointermove', 70)); poser(); });
    act(() => { window.dispatchEvent(ev('pointermove', 75)); poser(); });
    expect(ordre()).toBe('bac');
  });

  it('appui bref : rien ne bouge et le clic passe', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { entrees()[0].dispatchEvent(ev('pointerdown', 20)); });
    act(() => { vi.advanceTimersByTime(200); window.dispatchEvent(ev('pointerup', 20)); });
    act(() => { window.dispatchEvent(ev('pointermove', 105)); });
    act(() => { entrees()[0].click(); });
    expect(ordre()).toBe('abc');
    expect(clics).toEqual(['a']);
  });

  it('bouger avant le délai (défilement) annule l\'appui', () => {
    vi.useFakeTimers();
    render(<Menu />);
    poser();
    act(() => { entrees()[0].dispatchEvent(ev('pointerdown', 20)); });
    act(() => { window.dispatchEvent(ev('pointermove', 60)); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { window.dispatchEvent(ev('pointermove', 105)); poser(); });
    expect(ordre()).toBe('abc');
  });
});
