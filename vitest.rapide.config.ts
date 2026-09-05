/**
 * Configuration d'exécution rapide des tests de logique.
 *
 * La configuration habituelle monte un DOM complet (jsdom) : quarante-cinq
 * secondes de préparation avant la première assertion, pour des fonctions qui
 * ne touchent jamais au navigateur. Ici l'environnement est Node, et la suite
 * s'exécute en quelques secondes — assez vite pour être lancée à chaque
 * modification, ce qui est la seule façon qu'un test serve à quelque chose.
 *
 * Les tests de composants, eux, gardent `vitest.config.ts` et son DOM.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    globals: true,
    /* DES VALEURS DE SUPABASE PROPRES AUX TESTS.
     *
     * `store.ts` crée le client Supabase au chargement du module, et le client
     * refuse une URL vide : le seul fait d'importer un type depuis ce fichier
     * faisait échouer six suites sur « supabaseUrl is required ». Tant que
     * `.env` était versionné, personne ne le voyait — il l'a été jusqu'à ce
     * qu'on le retire du suivi, à juste titre. Sur une machine neuve, la suite
     * ne démarrait plus.
     *
     * Ces valeurs sont VOLONTAIREMENT fausses, et c'est le second bénéfice :
     * elles priment sur le `.env` du poste, si bien qu'un test ne peut pas
     * atteindre le vrai projet par accident. Aucun test n'appelle le réseau ;
     * il ne s'agit que de laisser passer la construction du client.
     */
    env: {
      VITE_SUPABASE_URL: 'https://tests.supabase.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'cle-de-test-sans-valeur',
      VITE_SUPABASE_PROJECT_ID: 'tests',
    },
    environment: 'node',
    setupFiles: ['./src/test/setup.node.ts'],
    include: ['src/lib/**/*.test.ts'],
  },
});
