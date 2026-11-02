// Gera `submission/`: a versao do projeto para entrega, com poucos arquivos.
//
// O projeto original nunca e alterado. Esta versao so contem o que o app
// precisa para compilar e rodar (sem testes, docs, CI nem componentes nao
// ligados ao app), e os modulos pequenos sao fundidos em arquivos maiores,
// separados por banners. O codigo e os comentarios de cada modulo sao copiados
// sem alteracao; so os `import` entre modulos fundidos mudam.
//
// Uso: npm run submission

import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'submission');
const MAX_FILES = 20;

// ---------------------------------------------------------------------------
// Manifesto: o que vai para a entrega e como os modulos sao agrupados.
// ---------------------------------------------------------------------------

/**
 * Arquivos de saida feitos da fusao de varios modulos. A ordem das secoes
 * importa: um modulo vem depois dos que ele usa na inicializacao (constantes e
 * classes), ja que `const` e `class` nao sofrem hoisting.
 */
const MERGED = [
    {
        out: 'src/core/core.ts',
        title: 'Nucleo do simulador',
        summary:
            'Regras do simulador em TypeScript puro (sem Vue, Electron ou Node): modelo de dados, leitura e validacao da configuracao, politicas RM/EDF e motor de simulacao.',
        sections: [
            [
                'src/core/helpers/key.ts',
                'chaves',
                'identificacao e ordenacao de jobs',
            ],
            [
                'src/core/helpers/deepCopy.ts',
                'copia',
                'copia profunda de dados simples',
            ],
            [
                'src/core/helpers/freezeCopy.ts',
                'copia congelada',
                'copia profunda imutavel (snapshots)',
            ],
            [
                'src/core/domain.ts',
                'dominio',
                'tipos e constantes do modelo: tarefas, jobs, CPUs, eventos e estado',
            ],
            [
                'src/core/cpuOff.ts',
                'cpu desligada',
                'periodos em que cada CPU ficou desligada, derivados dos eventos',
            ],
            [
                'src/core/draw.ts',
                'sorteio',
                'sorteio deterministico para desempates residuais',
            ],
            [
                'src/core/eligibility.ts',
                'elegibilidade',
                'quais jobs podem executar agora',
            ],
            [
                'src/core/snapshot.ts',
                'snapshot',
                'estado inicial e copias imutaveis do estado',
            ],
            [
                'src/core/consistency.ts',
                'consistencia',
                'verificacao cruzada do estado apos cada passo',
            ],
            [
                'src/core/config.ts',
                'configuracao',
                'validacao da configuracao do sistema e das tarefas',
            ],
            [
                'src/core/parser.ts',
                'parser',
                'leitura das linhas do arquivo de configuracao',
            ],
            [
                'src/core/loadConfig.ts',
                'carga de arquivo',
                'conversao do texto do arquivo de configuracao em SystemConfig',
            ],
            [
                'src/core/policy.ts',
                'contrato de politica',
                'interface entre o motor e os algoritmos de escalonamento',
            ],
            [
                'src/core/policies.ts',
                'politicas RM e EDF',
                'implementacao dos algoritmos e registro de politicas',
            ],
            [
                'src/core/simulator.ts',
                'simulador',
                'motor de simulacao: tick, historico, avancar e retroceder',
            ],
            [
                'src/core/createSimulator.ts',
                'criacao do simulador',
                'monta o simulador com a politica do algoritmo configurado',
            ],
        ],
    },
    {
        out: 'src/renderer/app.ts',
        title: 'Logica da interface',
        summary:
            'Ponte entre o nucleo e o Vue: icones, tratamento de erros e o composable que guarda o simulador.',
        sections: [
            [
                'src/renderer/components/icons.ts',
                'icones',
                'SVGs embutidos como data URLs (antes eram arquivos .svg)',
            ],
            [
                'src/renderer/errors.ts',
                'erros',
                'banner global de erros e classificacao do resultado de comandos',
            ],
            [
                'src/renderer/composables/useSimulation.ts',
                'useSimulation',
                'mantem o simulador privado e publica snapshots imutaveis',
            ],
        ],
    },
];

/** CSS: `index.css` e a base; cada `@import './x.css'` local vira uma secao. */
const CSS_OUT = 'src/renderer/index.css';
const CSS_DESCRIPTIONS = {
    'src/renderer/styles/tokens.css': [
        'tokens',
        'valores visuais (cores, espacamentos, fontes)',
    ],
    'src/renderer/styles/base.css': ['base', 'padroes globais de elementos'],
};

/** Copiados como estao (com imports reescritos para os arquivos fundidos). */
const COPIES = [
    'src/renderer/renderer.ts',
    'src/renderer/Root.vue',
    'src/renderer/App.vue',
    'src/renderer/components/ErrorBanner.vue',
    'src/renderer/components/UiAlert.vue',
    'src/renderer/components/UiIcon.vue',
    'index.html',
    '.oxlintrc.json',
    '.gitignore',
    'tsconfig.json',
];

/** Pontos de entrada usados para detectar arquivos novos ligados ao app. */
const ENTRIES = ['src/main/main.ts', 'src/renderer/renderer.ts'];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const read = (rel) =>
    readFileSync(path.join(ROOT, rel), 'utf8').replaceAll('\r\n', '\n');

function write(rel, content) {
    const file = path.join(OUT_DIR, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
}

function fail(message) {
    console.error(`build-submission: ${message}`);
    process.exit(1);
}

/** Aplica uma troca e falha se o trecho esperado nao existir mais. */
function replaceOnce(text, pattern, replacement, what) {
    const next = text.replace(pattern, replacement);
    if (next === text) {
        fail(
            `nao encontrei ${what}; o arquivo original mudou e o script precisa ser ajustado.`,
        );
    }
    return next;
}

/** Resolve um import relativo para o caminho (relativo a ROOT) do arquivo real. */
function resolveImport(fromRel, spec) {
    const base = path.posix.join(path.posix.dirname(fromRel), spec);
    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.vue`,
        `${base}/index.ts`,
    ]) {
        if (existsSync(path.join(ROOT, candidate)) && !isDirectory(candidate)) {
            return candidate;
        }
    }
    return fail(`import ${spec} em ${fromRel} nao resolve para um arquivo.`);
}

function isDirectory(rel) {
    try {
        readdirSync(path.join(ROOT, rel));
        return true;
    } catch {
        return false;
    }
}

const IMPORT_RE =
    /^import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s+'([^']+)';?[ \t]*\n?/gm;
const SIDE_EFFECT_RE = /^import\s+'([^']+)';?[ \t]*\n?/gm;
const SVG_RE = /^import\s+([\w$]+)\s+from\s+'([^']+\.svg)';?[ \t]*\n?/gm;

/** Mapa: arquivo-fonte -> arquivo de saida (para reescrever imports). */
const outputOf = new Map();
for (const merged of MERGED) {
    for (const [source] of merged.sections) {
        outputOf.set(source, merged.out);
    }
}
for (const copy of COPIES) {
    outputOf.set(copy, copy);
}
const inlined = new Set(); // SVGs embutidos: nao viram arquivo.

/** Especificador relativo de `fromOut` para o arquivo de saida `toOut`. */
function relativeSpec(fromOut, toOut, keepExtension) {
    let spec = path.posix.relative(path.posix.dirname(fromOut), toOut);
    if (!keepExtension) {
        spec = spec.replace(/\.(ts|vue)$/, '');
    }
    return spec.startsWith('.') ? spec : `./${spec}`;
}

/** Reescreve imports relativos de um arquivo copiado (sem fundir imports). */
function rewriteImports(sourceRel, outRel, text) {
    const rewrite = (match, spec) => {
        if (!spec.startsWith('.')) {
            return match;
        }
        const target = resolveImport(sourceRel, spec);
        const targetOut = outputOf.get(target);
        if (targetOut === undefined) {
            fail(`${sourceRel} importa ${target}, que nao esta no manifesto.`);
        }
        const keepExtension = /\.(vue|css)$/.test(spec);
        return match.replace(
            spec,
            relativeSpec(outRel, targetOut, keepExtension),
        );
    };
    return text
        .replace(/from\s+'([^']+)'/g, rewrite)
        .replace(/^import\s+'([^']+)'/gm, rewrite);
}

// ---------------------------------------------------------------------------
// Fusao de modulos TypeScript
// ---------------------------------------------------------------------------

function parseNames(named) {
    return (named ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const isType = part.startsWith('type ');
            return { name: isType ? part.slice(5).trim() : part, isType };
        });
}

function formatImport(spec, entry) {
    const values = [...entry.values].sort();
    const types = [...entry.types].filter((n) => !entry.values.has(n)).sort();
    const parts = [
        ...values,
        ...types.map((n) => (values.length > 0 || entry.def ? `type ${n}` : n)),
    ];
    const onlyTypes = values.length === 0 && !entry.def;
    const keyword = onlyTypes ? 'import type' : 'import';
    const def = entry.def ? `${entry.def}${parts.length > 0 ? ', ' : ''}` : '';
    if (parts.length === 0) {
        return `${keyword} ${entry.def} from '${spec}';`;
    }
    const oneLine = `${keyword} ${def}{ ${parts.join(', ')} } from '${spec}';`;
    if (oneLine.length <= 80) {
        return oneLine;
    }
    return `${keyword} ${def}{\n${parts.map((p) => `    ${p},`).join('\n')}\n} from '${spec}';`;
}

const TOP_LEVEL_DECL_RE =
    /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;

function buildMerged({ out, title, summary, sections }) {
    const imports = new Map(); // especificador -> { def, values, types }
    const declared = new Map(); // nome -> secao que o declarou
    const bodies = [];
    const sectionOwn = new Set(sections.map(([source]) => source));

    for (const [source, name, description] of sections) {
        let text = read(source);

        text = text.replace(SVG_RE, (_, ident, spec) => {
            const svgRel = resolveImport(source, spec);
            const svg = readFileSync(path.join(ROOT, svgRel), 'utf8')
                .replaceAll('\r\n', '\n')
                .trim();
            inlined.add(svgRel);
            return `const ${ident} = 'data:image/svg+xml,${encodeURIComponent(svg)}';\n`;
        });

        if (SIDE_EFFECT_RE.test(text)) {
            fail(`${source} tem import sem nomes; nao sei fundi-lo.`);
        }
        SIDE_EFFECT_RE.lastIndex = 0;

        text = text.replace(IMPORT_RE, (_, typeKw, def, named, spec) => {
            let target = spec;
            if (spec.startsWith('.')) {
                const targetSource = resolveImport(source, spec);
                const targetOut = outputOf.get(targetSource);
                if (targetOut === undefined) {
                    fail(
                        `${source} importa ${targetSource}, que nao esta no manifesto.`,
                    );
                }
                if (targetOut === out) {
                    if (!sectionOwn.has(targetSource)) {
                        fail(`${targetSource} deveria estar em ${out}.`);
                    }
                    return '';
                }
                target = relativeSpec(out, targetOut, false);
            }
            const entry = imports.get(target) ?? {
                def: null,
                values: new Set(),
                types: new Set(),
            };
            if (def) {
                entry.def = def;
            }
            for (const { name: n, isType } of parseNames(named)) {
                (typeKw || isType ? entry.types : entry.values).add(n);
            }
            imports.set(target, entry);
            return '';
        });

        text = text.replace(/^\n+/, '').trimEnd();

        for (const [, ident] of text.matchAll(TOP_LEVEL_DECL_RE)) {
            if (declared.has(ident)) {
                fail(
                    `o nome "${ident}" e declarado em ${declared.get(ident)} e em ${source}; renomeie um deles no original antes de fundir.`,
                );
            }
            declared.set(ident, source);
        }

        bodies.push(
            [
                `// ================= ${name} =================`,
                `// ${description}`,
                `// origem: ${source}`,
                '',
                text,
            ].join('\n'),
        );
    }

    const header = [
        '/**',
        ` * ${title}`,
        ` * ${summary}`,
        ' *',
        ' * Arquivo gerado por scripts/build-submission.mjs a partir de modulos menores',
        ' * do projeto original. Cada secao abaixo comeca com um banner que diz qual',
        ' * modulo ela era; o codigo e os comentarios de cada secao sao os originais.',
        ' *',
        ' * Secoes:',
        ...sections.map(
            ([, name, description]) => ` *  - ${name}: ${description}`,
        ),
        ' */',
    ].join('\n');

    const importLines = [...imports]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([spec, entry]) => formatImport(spec, entry));

    const content = [header, importLines.join('\n'), bodies.join('\n\n\n')]
        .filter(Boolean)
        .join('\n\n');
    write(out, `${content}\n`);
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function buildCss() {
    outputOf.set(CSS_OUT, CSS_OUT);
    const sources = [];
    const text = read('src/renderer/index.css').replace(
        /^@import '(\.[^']+)';[ \t]*\n?/gm,
        (_, spec) => {
            const rel = resolveImport('src/renderer/index.css', spec);
            const [name, description] =
                CSS_DESCRIPTIONS[rel] ??
                fail(`${rel} sem descricao em CSS_DESCRIPTIONS.`);
            sources.push(rel);
            return `\n/* ================= ${name} ================= */\n/* ${description} */\n/* origem: ${rel} */\n\n${read(rel).trimEnd()}\n\n`;
        },
    );
    for (const rel of sources) {
        outputOf.set(rel, CSS_OUT);
    }
    write(CSS_OUT, `${text.trimEnd()}\n`);
    return sources;
}

// ---------------------------------------------------------------------------
// Arquivos de configuracao derivados
// ---------------------------------------------------------------------------

function buildMain() {
    let text = read('src/main/main.ts');
    text = replaceOnce(
        text,
        /        webPreferences: \{\n            preload: path\.join\(__dirname, 'preload\.cjs'\),\n        \},\n/,
        '        // Sem preload: a interface ainda nao usa nenhuma API privilegiada do Electron.\n',
        'o bloco webPreferences/preload em main.ts',
    );
    write('src/main/main.ts', text);
}

function buildForge() {
    let text = read('forge.config.mts');
    text = text.replace(/^import \{ Maker\w+ \} from '[^']+';\n/gm, '');
    text = replaceOnce(
        text,
        /    publishers: \[[\s\S]*?\n    \],\n/,
        '',
        'o bloco publishers em forge.config.mts',
    );
    text = replaceOnce(
        text,
        /    makers: \[[\s\S]*?\n    \],\n/,
        '    makers: [],\n',
        'o bloco makers em forge.config.mts',
    );
    text = replaceOnce(
        text,
        /\n {16}\{\n {20}entry: 'src\/preload\/preload\.ts',[\s\S]*?\n {16}\},/,
        '',
        'a entrada de preload em forge.config.mts',
    );
    text = replaceOnce(
        text,
        /vite\.main\.config\.mts/,
        'vite.config.mts',
        'vite.main.config.mts',
    );
    text = replaceOnce(
        text,
        /vite\.renderer\.config\.mts/,
        'vite.config.mts',
        'vite.renderer.config.mts',
    );
    write('forge.config.mts', text);
}

function buildPackageJson() {
    const pkg = JSON.parse(read('package.json'));
    pkg.scripts = {
        start: 'electron-forge start',
        package: 'electron-forge package',
        lint: 'oxlint',
        typecheck: 'vue-tsc --noEmit',
    };
    const drop = [
        'vitest',
        'jsdom',
        '@vue/test-utils',
        'oxfmt',
        '@electron-forge/maker-deb',
        '@electron-forge/maker-rpm',
        '@electron-forge/maker-squirrel',
        '@electron-forge/maker-zip',
        '@electron-forge/publisher-github',
    ];
    for (const name of drop) {
        if (!(name in pkg.devDependencies)) {
            fail(`devDependency ${name} nao existe mais no package.json.`);
        }
        delete pkg.devDependencies[name];
    }
    write('package.json', `${JSON.stringify(pkg, null, 4)}\n`);
}

function buildReadme(cssSources) {
    const lines = [
        '# os-sim',
        '',
        'Simulador de sistema operacional multitarefa de tempo compartilhado (Projeto A: escalonamento RM e EDF), em Electron + Vue 3 + TypeScript.',
        '',
        '## Como rodar',
        '',
        'Requer Node.js (versao em `devEngines.runtime` do `package.json`).',
        '',
        '```sh',
        'npm install',
        'npm start          # abre o app',
        'npm run typecheck  # confere os tipos',
        'npm run lint       # confere as regras de importacao entre camadas',
        'npm run package    # gera o executavel em out/',
        '```',
        '',
        '## Organizacao',
        '',
        'Este diretorio e gerado por `scripts/build-submission.mjs` a partir do projeto completo. Modulos pequenos foram fundidos em arquivos maiores; cada secao tem um banner `// ===== nome =====` com uma descricao e a origem.',
        '',
        '- `src/core/core.ts`: regras do simulador (sem Vue, Electron ou Node).',
        '- `src/renderer/`: interface Vue (`app.ts` com a logica, `.vue` com os componentes, `index.css` com os estilos).',
        '- `src/main/main.ts`: processo principal do Electron.',
        '',
        '### Secoes de `src/core/core.ts`',
        '',
        ...MERGED[0].sections.map(
            ([source, name, description]) =>
                `- **${name}** (\`${source}\`): ${description}`,
        ),
        '',
        '### Secoes de `src/renderer/app.ts`',
        '',
        ...MERGED[1].sections.map(
            ([source, name, description]) =>
                `- **${name}** (\`${source}\`): ${description}`,
        ),
        '',
        '### Secoes de `src/renderer/index.css`',
        '',
        ...cssSources.map(
            (source) =>
                `- **${CSS_DESCRIPTIONS[source][0]}** (\`${source}\`): ${CSS_DESCRIPTIONS[source][1]}`,
        ),
        '',
        '### Regras de importacao (`.oxlintrc.json`)',
        '',
        '- `src/core/` nao importa Vue, Electron, Node nem outras camadas.',
        '- `src/renderer/` nao importa Electron, Node, `main/` nem `preload/`.',
        '- `src/main/` nao importa `renderer/`.',
        '',
    ];
    write('README.md', lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Verificacoes de completude
// ---------------------------------------------------------------------------

/** Todo arquivo de `src/core` (fora testes) precisa estar no manifesto. */
function checkCoreCovered() {
    const listed = [];
    const walk = (dir) => {
        for (const entry of readdirSync(path.join(ROOT, dir), {
            withFileTypes: true,
        })) {
            const rel = `${dir}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(rel);
            } else if (rel.endsWith('.ts') && !rel.endsWith('.test.ts')) {
                listed.push(rel);
            }
        }
    };
    walk('src/core');
    const missing = listed.filter((rel) => !outputOf.has(rel));
    if (missing.length > 0) {
        fail(
            `arquivos novos em src/core fora do manifesto: ${missing.join(', ')}. Inclua-os em MERGED.`,
        );
    }
}

/** Todo arquivo alcancavel dos pontos de entrada precisa estar na entrega. */
function checkReachableCovered() {
    const seen = new Set();
    const queue = [...ENTRIES];
    while (queue.length > 0) {
        const rel = queue.pop();
        if (seen.has(rel)) {
            continue;
        }
        seen.add(rel);
        if (!/\.(ts|vue|css)$/.test(rel)) {
            continue;
        }
        const text = read(rel);
        const specs = [
            ...[...text.matchAll(/from\s+'(\.[^']*)'/g)].map((m) => m[1]),
            ...[...text.matchAll(/^import\s+'(\.[^']*)'/gm)].map((m) => m[1]),
            ...[...text.matchAll(/^@import\s+'(\.[^']*)'/gm)].map((m) => m[1]),
        ];
        for (const spec of specs) {
            queue.push(resolveImport(rel, spec));
        }
    }
    const missing = [...seen].filter(
        (rel) =>
            !outputOf.has(rel) && !inlined.has(rel) && !ENTRIES.includes(rel),
    );
    if (missing.length > 0) {
        fail(
            `o app agora usa arquivos fora do manifesto: ${missing.join(', ')}. Inclua-os em MERGED ou COPIES.`,
        );
    }
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

if (path.basename(OUT_DIR) !== 'submission') {
    fail('destino inesperado.');
}
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR);

for (const merged of MERGED) {
    buildMerged(merged);
}
const cssSources = buildCss();
checkCoreCovered();
checkReachableCovered();

for (const copy of COPIES) {
    write(copy, rewriteImports(copy, copy, read(copy)));
}
write(
    'src/declarations.d.ts',
    `/// <reference types="vite/client" />\n${read('src/declarations.d.ts')}`,
);
write('vite.config.mts', read('vite.renderer.config.mts'));
buildMain();
buildForge();
buildPackageJson();
buildReadme(cssSources);
cpSync(
    path.join(ROOT, 'package-lock.json'),
    path.join(OUT_DIR, 'package-lock.json'),
);

// O lock original lista dependencias removidas; reconcilia sem baixar nada.
execSync(
    'npm install --package-lock-only --ignore-scripts --no-audit --no-fund',
    {
        cwd: OUT_DIR,
        stdio: 'inherit',
    },
);

const count = (dir) =>
    readdirSync(dir, { withFileTypes: true }).reduce(
        (total, entry) =>
            total +
            (entry.isDirectory() ? count(path.join(dir, entry.name)) : 1),
        0,
    );
const total = count(OUT_DIR);
console.log(`submission/: ${total} arquivos (limite ${MAX_FILES}).`);
if (total > MAX_FILES) {
    fail(`acima do limite de ${MAX_FILES} arquivos.`);
}
