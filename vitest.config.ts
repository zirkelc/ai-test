import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run type-level tests (`*.test-d.ts`) alongside the runtime suite.
    typecheck: {
      enabled: true,
    },
  },
});
