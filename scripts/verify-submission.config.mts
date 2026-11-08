import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import submissionVite from '../submission/vite.config.mts';

// Roda os testes originais contra o codigo fundido de `submission/`
// (npm run verify:submission, depois de npm run submission). Cada modulo
// importado pelos testes que virou secao de um arquivo fundido e redirecionado
// para esse arquivo; o mapa vem dos banners `// origem:` e das linhas
// `@componente` da propria entrega. Os componentes passam pelo mesmo plugin
// vuePack usado no build.
const root = path
    .resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    .replaceAll('\\', '/');
const srcDir = `${root}/submission/src`;

// Pontos de entrada executam ao serem importados (montam o app, abrem a janela,
// publicam a API). Nos testes essas secoes saem do arquivo fundido, como os
// originais nao eram importados por nenhum teste.
const ENTRY_SECTIONS: Record<string, string> = {
    'app.ts': 'src/renderer/renderer.ts',
    'main.ts': 'src/main/main.ts',
    'preload.ts': 'src/preload/preload.ts',
};

const withoutExtension = (file: string) => file.replace(/\.ts$/, '');

const redirects = new Map<string, string>();
for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.ts') || name.endsWith('.d.ts')) {
        continue;
    }
    const file = `${srcDir}/${name}`;
    for (const [, origin] of readFileSync(file, 'utf8').matchAll(
        /^\/\/ origem: (\S+)$/gm,
    )) {
        redirects.set(withoutExtension(`${root}/${origin}`), file);
    }
}

const rawComponents = new Map<string, string>();
const pack = readFileSync(`${srcDir}/components.vue.pack`, 'utf8').replaceAll(
    '\r\n',
    '\n',
);
const parts = pack.split(
    /^<!-- @componente (\S+\.vue) \| origem: (\S+) -->\n/m,
);
for (let i = 1; i < parts.length; i += 3) {
    const id = `${srcDir}/${parts[i]}`;
    redirects.set(`${root}/${parts[i + 1]}`, id);
    rawComponents.set(id, parts[i + 2]);
}

const redirectToMerged: Plugin = {
    name: 'redirect-to-merged-submission',
    enforce: 'pre',
    resolveId(source, importer) {
        if (!source.startsWith('.') || importer === undefined) {
            return null;
        }
        const [file, query] = source.split('?');
        const target = path.posix.join(
            path.posix.dirname(importer.replaceAll('\\', '/')),
            file,
        );
        const redirected = redirects.get(withoutExtension(target));
        if (redirected === undefined) {
            return null;
        }
        return query === 'raw' ? `${redirected}?raw` : redirected;
    },
    load(id) {
        if (!id.endsWith('.vue?raw')) {
            return null;
        }
        const raw = rawComponents.get(id.slice(0, -'?raw'.length));
        return raw === undefined
            ? null
            : `export default ${JSON.stringify(raw)};`;
    },
    transform(code, id) {
        const entry = ENTRY_SECTIONS[path.posix.basename(id)];
        if (entry === undefined || path.posix.dirname(id) !== srcDir) {
            return null;
        }
        const banner = `// origem: ${entry}\n`;
        const at = code.replaceAll('\r\n', '\n').indexOf(banner);
        if (at === -1) {
            throw new Error(`secao ${entry} nao encontrada em ${id}`);
        }
        return code
            .replaceAll('\r\n', '\n')
            .slice(0, at)
            .replace(/^import Root from '\.\/Root\.vue';\n/m, '');
    },
};

// Estes testes trocam um modulo inteiro com vi.mock para injetar falhas. Na
// entrega o modulo trocado e o que o usa ficam no mesmo arquivo, entao a chamada
// interna nao passa pelo mock; no projeto original eles continuam rodando.
const NEEDS_MODULE_SEAM = [
    'opens in preparation without creating a simulator',
    'counts the tasks of the running snapshot, not the configuration it started from',
    'a refusal appears as a message and keeps the step; success clears it',
    'an unexpected failure clears the previous message instead of keeping it',
    'reports a block with its tick and reason as a warning',
    'shows a refused run as a message and keeps the cursor',
];

export default defineConfig({
    root,
    plugins: [
        redirectToMerged,
        ...((submissionVite as UserConfig).plugins ?? []),
    ],
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        testNamePattern: new RegExp(`^(?!.*(${NEEDS_MODULE_SEAM.join('|')}))`),
        css: { include: [/\.css\?raw$/] },
    },
});
