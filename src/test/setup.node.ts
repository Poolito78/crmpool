/**
 * Amorce minimale pour les tests de logique, hors navigateur.
 *
 * `store.ts` et `systemes.ts` importent le client Supabase, qui range sa
 * session dans `localStorage`. Sous Node il n'existe pas, et le seul fait
 * d'importer un type depuis ces fichiers faisait échouer la suite — alors
 * qu'aucune de ces fonctions ne touche au stockage.
 *
 * Ce faux stockage suffit à laisser passer l'import. Il n'est pas une
 * émulation : les tests qui dépendraient vraiment de la persistance doivent
 * tourner sous jsdom, avec `vitest.config.ts`.
 */
class StockageFactice implements Storage {
  private donnees = new Map<string, string>();
  get length() { return this.donnees.size; }
  clear() { this.donnees.clear(); }
  getItem(cle: string) { return this.donnees.get(cle) ?? null; }
  key(i: number) { return [...this.donnees.keys()][i] ?? null; }
  removeItem(cle: string) { this.donnees.delete(cle); }
  setItem(cle: string, valeur: string) { this.donnees.set(cle, String(valeur)); }
}

const g = globalThis as unknown as Record<string, unknown>;
if (!g.localStorage) g.localStorage = new StockageFactice();
if (!g.sessionStorage) g.sessionStorage = new StockageFactice();
