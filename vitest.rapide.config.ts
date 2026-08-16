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
    environment: 'node',
    setupFiles: ['./src/test/setup.node.ts'],
    include: ['src/lib/**/*.test.ts'],
  },
});
