import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Tests run in Node. core/ has no DOM, and Vue's reactivity works without one.
// This is the default; component tests opt into jsdom per file.
export default defineConfig({
    plugins: [vue()],
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
