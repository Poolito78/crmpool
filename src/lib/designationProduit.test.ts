import { describe, it, expect } from 'vitest';
import { designationProduit } from '@/lib/store';

describe('designationProduit', () => {
  it('rapatrie la pointe amovible que le modele annonce', () => {
    expect(designationProduit({
      description: 'IS KD22A + PA',
      descriptionVariante: 'KD22A BTR 1000 300 C2 BRUT (MARCO POLO)',
    })).toBe('KD22A BTR 1000 300 C2 BRUT (MARCO POLO) + PA');
  });

  it('efface les parentheses vides laissees par Odoo', () => {
    expect(designationProduit({
      description: 'IS KD22A + PA',
      descriptionVariante: 'KD22A BP 1000 300 C2 ST BRUT ()',
    })).toBe('KD22A BP 1000 300 C2 ST BRUT + PA');
  });

  it('ne repete pas un mot que la declinaison porte deja', () => {
    // « IS KD22 + PA BRUT » : BRUT est deja dans la declinaison, PA non.
    expect(designationProduit({
      description: 'IS KD22 + PA BRUT',
      descriptionVariante: 'KD22 BTR 1000 300 SFILM BRUT',
    })).toBe('KD22 BTR 1000 300 SFILM BRUT + PA');
  });

  it('garde plusieurs ajouts distincts', () => {
    expect(designationProduit({
      description: 'IS PLOT + RONDELLE + CHEVILLE 17x105 MM',
      descriptionVariante: 'PLOT PVC 200',
    })).toBe('PLOT PVC 200 + RONDELLE + CHEVILLE 17x105 MM');
  });

  it('retombe sur le modele quand la declinaison manque', () => {
    expect(designationProduit({ description: 'ENDUIT EVEREST 7.85KG' }))
      .toBe('ENDUIT EVEREST 7.85KG');
  });

  it('n ajoute rien quand le modele n annonce pas d option', () => {
    expect(designationProduit({
      description: 'IS A11',
      descriptionVariante: 'A11 1000 C1 BTR ST BRUT (MAGELLAN)',
    })).toBe('A11 1000 C1 BTR ST BRUT (MAGELLAN)');
  });
});
