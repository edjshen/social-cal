import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // node:test suites (run via `node --test`, not vitest): mayfly + the e2e-fidelity tooling
    exclude: ['node_modules/**', '.claude/**', 'lib/mayfly/shared/**', 'workers/**', 'e2e/**', 'scripts/e2e-fidelity/**'],
  },
});
