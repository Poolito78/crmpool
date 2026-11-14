import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* La fonction `tarif-catalogue` ne peut pas importer `src/` : elle porte des
   COPIES. Un prix calculé autrement en ligne et dans le devis serait un
   tarif faux envoyé au client — ces copies doivent rester identiques. */
const lire = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n');

function corps(source: string, nom: string): string {
  const debut = source.indexOf(`export function ${nom}(`);
  const fin = source.indexOf('\n}\n', debut);
  return source.slice(debut, fin + 2);
}

describe('copies de la fonction tarif-catalogue', () => {
  it('remiseGammes.ts est identique', () => {
    expect(lire('supabase/functions/tarif-catalogue/remiseGammes.ts')).toBe(lire('src/lib/remiseGammes.ts'));
  });
  it('designationProduit est identique', () => {
    expect(corps(lire('supabase/functions/tarif-catalogue/designation.ts'), 'designationProduit'))
      .toBe(corps(lire('src/lib/store.ts'), 'designationProduit'));
  });
});
