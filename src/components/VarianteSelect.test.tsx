import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import VarianteSelect from './VarianteSelect';

const DIM = { id: 'd', nom: 'Teinte', options: [
  { id: 'a', label: '232 (RAL 7035, Light Grey)' },
  { id: 'b', label: '479 (RAL 5015, Sky Blue)' },
] };

describe('VarianteSelect', () => {
  it('une teinte hors liste s’affiche telle quelle, pas comme la première option', () => {
    render(<VarianteSelect dimension={DIM} value="RAL 1003" onChange={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain('1003');
    expect(screen.getByRole('button').textContent).not.toContain('7035');
  });

  it('sans valeur, la première option reste affichée', () => {
    render(<VarianteSelect dimension={DIM} value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button').textContent).toContain('7035');
  });

  it('affiche le délai de chaque teinte dans la liste', () => {
    render(<VarianteSelect dimension={DIM} value="" onChange={vi.fn()} info={l => (l.startsWith('479') ? 'Tier 2 · 10 à 15 jours ouvrés' : undefined)} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Tier 2 · 10 à 15 jours ouvrés')).toBeTruthy();
  });
});
