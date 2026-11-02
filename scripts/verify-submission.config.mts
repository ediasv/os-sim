import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vitest/config';

// Roda os testes originais contra o codigo fundido de `submission/`
// (npm run verify:submission, depois de npm run submission). Cada modulo
// importado pelos testes que virou secao de um arquivo fundido e redirecionado
// para esse arquivo; o mapa vem dos banners `// origem:` do proprio arquivo.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mergedFiles = ['src/core/core.ts', 'src/renderer/app.ts'];

const redirects = new Map<string, string>();
for (const merged of mergedFiles) {
    const file = path.join(root, 'submission', merged);
    for (const [, origin] of readFileSync(file, 'utf8').matchAll(
        /^\/\/ origem: (\S+)$/gm,
    )) {
        redirects.set(path.join(root, origin).replace(/\.ts$/, ''), file);
    }
}

const redirectToMerged: Plugin = {
    name: 'redirect-to-merged-submission',
    enforce: 'pre',
    resolveId(source, importer) {
        if (!source.startsWith('.') || importer === undefined) {
            return null;
        }
        const target = path
            .resolve(path.dirname(importer), source)
            .replace(/\.ts$/, '');
        return redirects.get(target) ?? null;
    },
};

export default defineConfig({
    root,
    plugins: [redirectToMerged, vue()],
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        css: { include: [/\.css\?raw$/] },
    },
});
