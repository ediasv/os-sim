import { defineConfig } from 'vitest/config';

// Tests run in Node. core/ has no DOM, and Vue's reactivity works without one.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
