import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Core + adapter tests run on Node; browser popup tests opt into jsdom via a
    // per-file `// @vitest-environment jsdom` directive.
    environment: 'node',
  },
});
