import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { origineChiffrageValide } from './depotChiffrage';

describe('PDF du Chiffrage ISOSIGN : origine acceptée', () => {
  it('le Chiffrage local, sur les ports de serve.py (8765 à 8789)', () => {
    expect(origineChiffrageValide('http://127.0.0.1:8765')).toBe(true);
    expect(origineChiffrageValide('http://localhost:8765')).toBe(true);
    expect(origineChiffrageValide('http://127.0.0.1:8789')).toBe(true);
  });

  it('rien d’autre : un site tiers ne dépose pas de pièce jointe', () => {
    expect(origineChiffrageValide('https://crmpool.vercel.app')).toBe(false);
    expect(origineChiffrageValide('https://exemple.com')).toBe(false);
    expect(origineChiffrageValide('http://127.0.0.1:8080')).toBe(false);
    expect(origineChiffrageValide('http://127.0.0.1.exemple.com:8765')).toBe(false);
    expect(origineChiffrageValide('http://192.168.1.10:8765')).toBe(false);
  });
});
