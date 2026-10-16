import { describe, expect, it } from 'vitest';
import { indexerPixels, PIXELS_ECARTES_MAX } from './pdfImage';

/** Image RGBA opaque à partir d'une liste de couleurs [r, g, b]. */
function image(pixels: [number, number, number][]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => { d.set([r, g, b, 255], i * 4); });
  return d;
}

describe('indexerPixels', () => {
  it('rend une page de texte sans perte quand elle tient en 256 couleurs', () => {
    const px: [number, number, number][] = [];
    for (let i = 0; i < 1000; i++) px.push(i % 3 === 0 ? [255, 255, 255] : i % 3 === 1 ? [0, 0, 0] : [204, 0, 0]);
    const r = indexerPixels(image(px), 100, 10)!;
    expect(r).not.toBeNull();
    expect(r.palette.length).toBe(9);
    px.forEach(([cr, cg, cb], i) => {
      const k = r.indices[i] * 3;
      expect([r.palette[k], r.palette[k + 1], r.palette[k + 2]]).toEqual([cr, cg, cb]);
    });
  });

  it("rabat une demi-teinte rare sur la couleur proche (bord de lettre)", () => {
    const px: [number, number, number][] = [];
    // 256 gris fréquents, puis une teinte rare à 1 du gris 100.
    for (let g = 0; g < 256; g++) for (let n = 0; n < 4; n++) px.push([g, g, g]);
    px.push([101, 100, 100]);
    const r = indexerPixels(image(px), px.length, 1)!;
    expect(r).not.toBeNull();
    const k = r.indices[px.length - 1] * 3;
    expect(Math.abs(r.palette[k] - 101)).toBeLessThanOrEqual(1);
  });

  it('refuse une photo : trop de pixels loin de toute couleur de palette', () => {
    const px: [number, number, number][] = [];
    for (let i = 0; i < 256; i++) for (let n = 0; n < 10; n++) px.push([i, 0, 0]); // 256 rouges fréquents
    for (let i = 0; i <= PIXELS_ECARTES_MAX; i++) px.push([0, (i * 7) % 256, 200]); // bleus/verts : loin des rouges
    expect(indexerPixels(image(px), px.length, 1)).toBeNull();
  });
});
