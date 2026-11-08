// Gera `submission/`: a versao do projeto para entrega, com no maximo 20 arquivos.
//
// O projeto original nunca e alterado. Esta versao so contem o que o app
// precisa para compilar e rodar (sem testes, docs nem CI). Os modulos sao
// fundidos em poucos arquivos planos dentro de `src/`, separados por banners;
// o codigo e os comentarios de cada modulo sao copiados sem alteracao, so os
// `import` entre modulos fundidos mudam. Os componentes Vue vao, inteiros, para
// `src/components.vue.pack`, que o plugin `vuePack` de `vite.config.mts`
// separa de novo na hora do build.
//
// Uso: npm run submission

import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
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
 * Arquivos de saida feitos da fusao de varios modulos. Dentro de cada arquivo
 * as secoes sao ordenadas para que um modulo venha depois dos que ele importa
 * (`const` e `class` nao sofrem hoisting); `last` forca o ponto de entrada
 * para o fim.
 */
const MERGED = [
    {
        out: 'src/model.ts',
        title: 'Nucleo (1/4): modelo de dados e utilitarios.',
        summary:
            'Tipos e constantes do dominio e funcoes auxiliares puras. Nao importa nenhum outro arquivo do nucleo.',
        sections: [
            [
                'src/core/domain.ts',
                'dominio',
                'tipos e constantes do modelo: tarefas, jobs, CPUs, eventos e estado',
            ],
            [
                'src/core/taskId.ts',
                'identificadores',
                'formato e ordenacao dos identificadores de tarefa',
            ],
            [
                'src/core/defaultColor.ts',
                'cor padrao',
                'cor atribuida a tarefas sem cor configurada',
            ],
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
                'src/core/refusal.ts',
                'recusa',
                'resultado padrao de comandos recusados',
            ],
            [
                'src/core/cpuOff.ts',
                'cpu desligada',
                'periodos em que cada CPU ficou desligada, derivados dos eventos',
            ],
        ],
    },
    {
        out: 'src/config.ts',
        title: 'Nucleo (2/4): configuracao.',
        summary:
            'Leitura do arquivo de configuracao e validacao do sistema e das tarefas. Importa so model.ts.',
        sections: [
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
        ],
    },
    {
        out: 'src/scheduling.ts',
        title: 'Nucleo (3/4): escalonamento.',
        summary:
            'Politicas RM e EDF e as regras usadas a cada tick (ativacao, elegibilidade, progresso e sorteio). Importa so model.ts.',
        sections: [
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
                'src/core/eligibility.ts',
                'elegibilidade',
                'quais jobs podem executar agora',
            ],
            [
                'src/core/activation.ts',
                'ativacao',
                'liberacao de jobs periodicos',
            ],
            [
                'src/core/progress.ts',
                'progresso',
                'deteccao de falta de progresso',
            ],
            [
                'src/core/draw.ts',
                'sorteio',
                'sorteio deterministico para desempates residuais',
            ],
        ],
    },
    {
        out: 'src/simulator.ts',
        title: 'Nucleo (4/4): motor de simulacao.',
        summary:
            'Snapshots, consistencia, edicao, historico e o simulador em si. Importa os outros tres arquivos do nucleo.',
        sections: [
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
                'src/core/edit.ts',
                'edicao',
                'inclusao, alteracao e exclusao de tarefas durante a simulacao',
            ],
            [
                'src/core/history.ts',
                'historico',
                'pilha de estados para retroceder e ramificar',
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
        out: 'src/shared.ts',
        title: 'Contratos compartilhados entre main, preload e renderer.',
        summary:
            'Tipos e constantes das APIs de arquivo expostas pelo preload.',
        sections: [
            [
                'src/shared/configFile.ts',
                'arquivo de configuracao',
                'contrato para abrir arquivos de configuracao',
            ],
            [
                'src/shared/imageFile.ts',
                'arquivo de imagem',
                'contrato para salvar a imagem do Gantt',
            ],
        ],
    },
    {
        out: 'src/main.ts',
        title: 'Processo principal do Electron.',
        summary: 'Janela, dialogos de arquivo e validacao de quem chama o IPC.',
        sections: [
            [
                'src/main/trustedSender.ts',
                'remetente confiavel',
                'aceita IPC so da janela do app',
            ],
            [
                'src/main/configFile.ts',
                'abrir configuracao',
                'dialogo e leitura do arquivo de configuracao',
            ],
            [
                'src/main/imageFile.ts',
                'salvar imagem',
                'dialogo e gravacao da imagem do Gantt',
            ],
            [
                'src/main/main.ts',
                'main',
                'cria a janela e registra os handlers',
            ],
        ],
        last: 'src/main/main.ts',
    },
    {
        out: 'src/preload.ts',
        title: 'Preload: unica ponte entre a interface e o Electron.',
        summary:
            'Expoe ao renderer so as APIs de arquivo definidas em shared.ts.',
        sections: [
            [
                'src/preload/configFileApi.ts',
                'api de configuracao',
                'abre arquivos de configuracao via IPC',
            ],
            [
                'src/preload/imageFileApi.ts',
                'api de imagem',
                'salva a imagem do Gantt via IPC',
            ],
            ['src/preload/preload.ts', 'preload', 'publica as APIs em window'],
        ],
        last: 'src/preload/preload.ts',
    },
    {
        out: 'src/gantt.ts',
        title: 'Interface: modelo e desenho do grafico de Gantt.',
        summary:
            'Consultas ao snapshot, modelo comum do Gantt e exportacao em SVG. Nao importa app.ts.',
        sections: [
            [
                'src/renderer/snapshotQueries.ts',
                'consultas ao snapshot',
                'leituras derivadas usadas por varias telas',
            ],
            [
                'src/renderer/features/gantt/colors.ts',
                'cores',
                'cores das tarefas e do texto sobre elas',
            ],
            [
                'src/renderer/features/gantt/geometry.ts',
                'geometria',
                'medidas comuns do desenho',
            ],
            [
                'src/renderer/features/gantt/ganttModel.ts',
                'modelo do Gantt',
                'linhas, barras e marcadores a partir do snapshot',
            ],
            [
                'src/renderer/features/gantt/markerShapes.ts',
                'marcadores',
                'formas dos marcadores de evento',
            ],
            [
                'src/renderer/features/export/ganttSvg.ts',
                'exportar SVG',
                'gera a imagem do Gantt para salvar',
            ],
        ],
    },
    {
        out: 'src/app.ts',
        title: 'Interface: logica do app Vue e ponto de entrada.',
        summary:
            'Erros, icones, estado do simulador, rascunho de configuracao, edicao e inspecao. O fim do arquivo monta o app.',
        sections: [
            [
                'src/renderer/errors.ts',
                'erros',
                'banner global de erros e classificacao do resultado de comandos',
            ],
            [
                'src/renderer/components/icons.ts',
                'icones',
                'SVGs embutidos como data URLs (antes eram arquivos .svg)',
            ],
            [
                'src/renderer/composables/useSimulation.ts',
                'useSimulation',
                'mantem o simulador privado e publica snapshots imutaveis',
            ],
            [
                'src/renderer/features/configuration/numberInput.ts',
                'entrada numerica',
                'leitura de campos numericos',
            ],
            [
                'src/renderer/features/configuration/draft.ts',
                'rascunho',
                'configuracao em edicao antes de iniciar',
            ],
            [
                'src/renderer/features/editing/forms.ts',
                'formularios de edicao',
                'estado dos formularios do dialogo de edicao',
            ],
            [
                'src/renderer/features/editing/buildEdit.ts',
                'montar edicao',
                'converte formularios em comandos de edicao',
            ],
            [
                'src/renderer/features/inspection/inspection.ts',
                'inspecao',
                'dados das tarefas e jobs para inspecao',
            ],
            [
                'src/renderer/features/system/system.ts',
                'estado do sistema',
                'dados das CPUs e do sistema',
            ],
            [
                'src/renderer/composables/useWorkspace.ts',
                'useWorkspace',
                'estado da tela: carga, preparacao e simulacao',
            ],
            [
                'src/renderer/components/workspaceActions.ts',
                'acoes',
                'acoes da barra de ferramentas',
            ],
            ['src/renderer/renderer.ts', 'entrada', 'cria e monta o app Vue'],
        ],
        last: 'src/renderer/renderer.ts',
    },
];

/** Funcoes locais (nao exportadas) renomeadas na fusao para nao colidir. */
const RENAMES = {
    'src/main/imageFile.ts': {
        failed: 'imageFailed',
        systemReason: 'imageSystemReason',
    },
};

/** Grupos de componentes dentro de `src/components.vue.pack`, na ordem. */
const VUE_GROUPS = [
    [
        'estrutura',
        'raiz, layout e areas da tela',
        [
            'src/renderer/Root.vue',
            'src/renderer/App.vue',
            'src/renderer/components/WorkspaceLayout.vue',
            'src/renderer/components/EmptyWorkspace.vue',
            'src/renderer/components/PreparedWorkspace.vue',
            'src/renderer/components/ErrorBanner.vue',
        ],
    ],
    [
        'interface basica',
        'componentes reutilizaveis',
        [
            'src/renderer/components/UiAlert.vue',
            'src/renderer/components/UiButton.vue',
            'src/renderer/components/UiDialog.vue',
            'src/renderer/components/UiField.vue',
            'src/renderer/components/UiIcon.vue',
            'src/renderer/components/UiIconButton.vue',
        ],
    ],
    [
        'simulacao',
        'barra de comandos, tarefas e Gantt',
        [
            'src/renderer/components/SimulationToolbar.vue',
            'src/renderer/components/TaskPanel.vue',
            'src/renderer/components/GanttPanel.vue',
            'src/renderer/features/gantt/GanttChart.vue',
            'src/renderer/features/gantt/GanttMarkerGlyph.vue',
        ],
    ],
    [
        'configuracao',
        'dialogos de sistema e tarefa antes de iniciar',
        [
            'src/renderer/features/configuration/SystemDialog.vue',
            'src/renderer/features/configuration/TaskDialog.vue',
            'src/renderer/features/configuration/ConfirmDialog.vue',
        ],
    ],
    [
        'edicao',
        'dialogo de edicao durante a simulacao',
        ['src/renderer/features/editing/EditDialog.vue'],
    ],
    [
        'inspecao',
        'detalhes de tarefas, jobs e CPUs',
        [
            'src/renderer/features/inspection/InspectionPanel.vue',
            'src/renderer/features/inspection/TaskList.vue',
            'src/renderer/features/inspection/TaskDetails.vue',
            'src/renderer/features/inspection/JobTable.vue',
            'src/renderer/features/system/SystemInspector.vue',
        ],
    ],
];

const CSS_OUT = 'src/styles.css';
const CSS_DESCRIPTIONS = {
    'src/renderer/styles/tokens.css': [
        'tokens',
        'valores visuais (cores, espacamentos, fontes)',
    ],
    'src/renderer/styles/base.css': ['base', 'padroes globais de elementos'],
};

/** Pontos de entrada usados para detectar arquivos novos ligados ao app. */
const ENTRIES = [
    'src/main/main.ts',
    'src/preload/preload.ts',
    'src/renderer/renderer.ts',
];

/** Camadas (para reescrever as regras de importacao do .oxlintrc.json). */
const LAYERS = {
    core: [
        'src/model.ts',
        'src/config.ts',
        'src/scheduling.ts',
        'src/simulator.ts',
    ],
    shared: ['src/shared.ts'],
    main: ['src/main.ts'],
    preload: ['src/preload.ts'],
    renderer: ['src/app.ts', 'src/gantt.ts'],
};

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
    const base = path.posix.join(
        path.posix.dirname(fromRel),
        spec.replace(/\?.*$/, ''),
    );
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
        const file = path.join(ROOT, candidate);
        if (existsSync(file) && statSync(file).isFile()) {
            return candidate;
        }
    }
    return fail(`import ${spec} em ${fromRel} nao resolve para um arquivo.`);
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
const VUE_SOURCES = VUE_GROUPS.flatMap(([, , files]) => files);
for (const source of VUE_SOURCES) {
    outputOf.set(source, `src/${path.posix.basename(source)}`);
}
const inlined = new Set(); // SVGs embutidos: nao viram arquivo.

/** Especificador relativo de `fromOut` para o arquivo de saida `toOut`. */
function relativeSpec(fromOut, toOut, keepExtension) {
    let spec = path.posix.relative(path.posix.dirname(fromOut), toOut);
    if (!keepExtension) {
        spec = spec.replace(/\.ts$/, '');
    }
    return spec.startsWith('.') ? spec : `./${spec}`;
}

function targetOf(sourceRel, spec) {
    const target = resolveImport(sourceRel, spec);
    const targetOut = outputOf.get(target);
    if (targetOut === undefined) {
        fail(`${sourceRel} importa ${target}, que nao esta no manifesto.`);
    }
    return { target, targetOut };
}

/** Reescreve imports relativos de um arquivo copiado (sem fundir imports). */
function rewriteImports(sourceRel, outRel, text) {
    const rewrite = (match, spec) => {
        if (!spec.startsWith('.')) {
            return match;
        }
        const { targetOut } = targetOf(sourceRel, spec);
        const query = spec.match(/\?.*$/)?.[0] ?? '';
        const keepExtension = /\.(vue|css)$/.test(targetOut);
        return match.replace(
            spec,
            relativeSpec(outRel, targetOut, keepExtension) + query,
        );
    };
    return text
        .replace(/from\s+'([^']+)'/g, rewrite)
        .replace(/^import\s+'([^']+)'/gm, rewrite)
        .replace(/import\('([^']+)'\)/g, rewrite);
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
            const bare = isType ? part.slice(5).trim() : part;
            const [name, alias] = bare.split(/\s+as\s+/);
            return { name, alias: alias ?? null, text: bare, isType };
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

/** Ordena as secoes para que cada uma venha depois das que ela importa. */
function orderSections({ sections, last }) {
    const own = new Set(sections.map(([source]) => source));
    const deps = new Map();
    for (const [source] of sections) {
        const text = read(source);
        const set = new Set();
        for (const m of text.matchAll(/from\s+'(\.[^']+)'/g)) {
            if (m[1].endsWith('.svg') || m[1].endsWith('.vue')) {
                continue;
            }
            const target = resolveImport(source, m[1]);
            if (own.has(target) && target !== source) {
                set.add(target);
            }
        }
        deps.set(source, set);
    }
    const ordered = [];
    const state = new Map();
    const visit = (source) => {
        if (state.get(source) === 'done') {
            return;
        }
        if (state.get(source) === 'visiting') {
            return; // ciclo: so tipos ou funcoes; mantem a ordem do manifesto
        }
        state.set(source, 'visiting');
        for (const dep of deps.get(source)) {
            visit(dep);
        }
        state.set(source, 'done');
        ordered.push(source);
    };
    for (const [source] of sections) {
        if (source !== last) {
            visit(source);
        }
    }
    if (last) {
        visit(last);
    }
    const bySource = new Map(sections.map((s) => [s[0], s]));
    return ordered.map((source) => bySource.get(source));
}

function buildMerged(merged) {
    const { out, title, summary } = merged;
    const sections = orderSections(merged);
    const imports = new Map(); // especificador -> { def, values, types }
    const sideEffects = new Set();
    const declared = new Map(); // nome -> secao que o declarou
    const typeLines = new Map(); // nome -> linha `type X = ...;` ja emitida
    const bodies = [];

    for (const [source, name, description] of sections) {
        let text = read(source);
        const aliases = [];

        text = text.replace(SVG_RE, (_, ident, spec) => {
            const svgRel = resolveImport(source, spec);
            const svg = read(svgRel).trim();
            inlined.add(svgRel);
            return `const ${ident} = 'data:image/svg+xml,${encodeURIComponent(svg)}';\n`;
        });

        text = text.replace(SIDE_EFFECT_RE, (_, spec) => {
            if (!spec.endsWith('.css')) {
                fail(
                    `${source} tem import sem nomes de ${spec}; nao sei fundi-lo.`,
                );
            }
            sideEffects.add(
                relativeSpec(out, targetOf(source, spec).targetOut, true),
            );
            return '';
        });

        text = text.replace(IMPORT_RE, (_, typeKw, def, named, spec) => {
            let target = spec;
            if (spec.startsWith('.')) {
                const { targetOut } = targetOf(source, spec);
                if (targetOut === out) {
                    if (def) {
                        fail(
                            `${source} usa import default de um modulo do mesmo arquivo.`,
                        );
                    }
                    for (const n of parseNames(named)) {
                        if (n.alias) {
                            aliases.push(
                                typeKw || n.isType
                                    ? `type ${n.alias} = ${n.name};`
                                    : `const ${n.alias} = ${n.name};`,
                            );
                        }
                    }
                    return '';
                }
                target = relativeSpec(out, targetOut, /\.vue$/.test(targetOut));
            }
            const entry = imports.get(target) ?? {
                def: null,
                values: new Set(),
                types: new Set(),
            };
            if (def) {
                entry.def = def;
            }
            for (const n of parseNames(named)) {
                (typeKw || n.isType ? entry.types : entry.values).add(n.text);
            }
            imports.set(target, entry);
            return '';
        });

        // Reexportacoes de outros arquivos de saida.
        text = text.replace(
            /^(export\s+(?:type\s+)?\{[^}]*\}\s+from\s+)'(\.[^']+)'/gm,
            (_, head, spec) => {
                const { targetOut } = targetOf(source, spec);
                if (targetOut === out) {
                    fail(`${source} reexporta um modulo do mesmo arquivo.`);
                }
                return `${head}'${relativeSpec(out, targetOut, false)}'`;
            },
        );

        const renames = RENAMES[source] ?? {};
        for (const [from, to] of Object.entries(renames)) {
            text = replaceOnce(
                text,
                new RegExp(`\\b${from}\\(`, 'g'),
                `${to}(`,
                `${from} em ${source}`,
            );
        }

        text = text.replace(/^\n+/, '').trimEnd();
        for (const [from, to] of Object.entries(renames)) {
            text = `// na fusao, a funcao local ${from} virou ${to} (o mesmo nome existe em outra secao)\n${text}`;
        }
        if (aliases.length > 0) {
            text = `// apelidos que antes eram feitos no import\n${aliases.join('\n')}\n\n${text}`;
        }

        // Apelidos de tipo identicos em mais de um modulo ficam so na primeira secao.
        text = text.replace(/^type ([\w$]+) = [^\n]+;$/gm, (line, ident) => {
            if (typeLines.get(ident) === line) {
                return `// ${line} (ja declarado acima, igual)`;
            }
            typeLines.set(ident, line);
            return line;
        });

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

    const importLines = [
        ...[...imports]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([spec, entry]) => formatImport(spec, entry)),
        ...[...sideEffects].map((spec) => `import '${spec}';`),
    ];

    const content = [header, importLines.join('\n'), bodies.join('\n\n\n')]
        .filter(Boolean)
        .join('\n\n');
    write(out, `${content}\n`);
    return sections;
}

// ---------------------------------------------------------------------------
// Componentes Vue e CSS
// ---------------------------------------------------------------------------

function buildVuePack() {
    const names = new Set();
    const parts = [
        '<!--',
        '  Componentes Vue da interface, um apos o outro, sem alteracao alem dos',
        '  caminhos de import. Cada componente comeca com a linha',
        '  "<!-- @componente Nome.vue | origem: caminho original -->"; o plugin',
        '  vuePack de vite.config.mts usa essa linha para separar os componentes',
        '  na hora do build, como se cada um fosse um arquivo .vue.',
        '-->',
        '',
    ];
    for (const [group, description, files] of VUE_GROUPS) {
        parts.push(
            `<!-- ================================================================ -->`,
            `<!-- ${group}: ${description} -->`,
            `<!-- ================================================================ -->`,
            '',
        );
        for (const source of files) {
            const name = path.posix.basename(source);
            if (names.has(name)) {
                fail(`dois componentes chamados ${name}.`);
            }
            names.add(name);
            const text = rewriteImports(
                source,
                outputOf.get(source),
                read(source),
            );
            parts.push(
                `<!-- @componente ${name} | origem: ${source} -->`,
                text.trimEnd(),
                '',
            );
        }
    }
    write('src/components.vue.pack', `${parts.join('\n').trimEnd()}\n`);
}

function buildCss() {
    outputOf.set('src/renderer/index.css', CSS_OUT);
    const sources = ['src/renderer/index.css'];
    const text = read('src/renderer/index.css').replace(
        /^@import '(\.[^']+)';[ \t]*\n?/gm,
        (_, spec) => {
            const rel = resolveImport('src/renderer/index.css', spec);
            const [name, description] =
                CSS_DESCRIPTIONS[rel] ??
                fail(`${rel} sem descricao em CSS_DESCRIPTIONS.`);
            sources.push(rel);
            outputOf.set(rel, CSS_OUT);
            return `\n/* ================= ${name} ================= */\n/* ${description} */\n/* origem: ${rel} */\n\n${read(rel).trimEnd()}\n\n`;
        },
    );
    write(CSS_OUT, `${text.trimEnd()}\n`);
    return sources;
}

// ---------------------------------------------------------------------------
// Arquivos de configuracao derivados
// ---------------------------------------------------------------------------

const VITE_CONFIG = `import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

// Usado nos tres builds do Electron Forge (main, preload e renderer).
// https://vitejs.dev/config

const ROOT = path.dirname(fileURLToPath(import.meta.url)).replaceAll('\\\\', '/');
const PACK = 'src/components.vue.pack';

/**
 * Os componentes Vue ficam todos em src/components.vue.pack (para caber no
 * limite de arquivos da entrega). Este plugin separa o pacote pela linha
 * "<!-- @componente Nome.vue | ... -->" e entrega cada trecho ao Vite como se
 * fosse o arquivo src/Nome.vue; o @vitejs/plugin-vue compila normalmente.
 */
function vuePack(): Plugin {
    const sections = new Map<string, string>();
    const text = readFileSync(path.join(ROOT, PACK), 'utf8').replaceAll('\\r\\n', '\\n');
    const parts = text.split(/^<!-- @componente (\\S+\\.vue) \\|.*-->\\n/m);
    for (let i = 1; i < parts.length; i += 2) {
        sections.set(\`\${ROOT}/src/\${parts[i]}\`, parts[i + 1]);
    }
    return {
        name: 'vue-pack',
        enforce: 'pre',
        resolveId(source, importer) {
            if (!importer || !source.startsWith('.') || !source.endsWith('.vue')) {
                return null;
            }
            const dir = path.posix.dirname(importer.replaceAll('\\\\', '/'));
            const id = path.posix.join(dir, source);
            return sections.has(id) ? id : null;
        },
        load(id) {
            return sections.get(id) ?? null;
        },
    };
}

export default defineConfig({
    plugins: [vuePack(), vue()],
});
`;

function buildDeclarations() {
    const env = read('src/renderer/env.d.ts')
        .replace(/^\/\/\/ <reference types="vite\/client" \/>\n/m, '')
        .replace(
            /import\('\.\.\/shared\/(configFile|imageFile)'\)/g,
            "import('./shared')",
        );
    const text = [
        '/// <reference types="vite/client" />',
        read('src/declarations.d.ts').trimEnd(),
        '',
        '// Os componentes ficam em components.vue.pack (ver vite.config.mts); para o',
        '// TypeScript, cada import de .vue e um componente Vue.',
        "declare module '*.vue' {",
        "    import type { DefineComponent } from 'vue';",
        '    const component: DefineComponent;',
        '    export default component;',
        '}',
        '',
        '// origem: src/renderer/env.d.ts',
        env.trim(),
        '',
    ].join('\n');
    write('src/declarations.d.ts', text);
}

function buildForge() {
    let text = read('forge.config.mts');
    text = text.replace(/^import \{ Maker\w+ \} from '[^']+';\n/gm, '');
    text = replaceOnce(
        text,
        /    publishers: \[[\s\S]*?\n    \],\n/,
        '',
        'publishers',
    );
    text = replaceOnce(
        text,
        /    makers: \[[\s\S]*?\n    \],\n/,
        '    makers: [],\n',
        'makers',
    );
    text = replaceOnce(
        text,
        "'src/main/main.ts'",
        "'src/main.ts'",
        'entrada main',
    );
    text = replaceOnce(
        text,
        "'src/preload/preload.ts'",
        "'src/preload.ts'",
        'entrada preload',
    );
    text = text.replace(
        /vite\.(main|preload|renderer)\.config\.mts/g,
        'vite.config.mts',
    );
    const header = [
        '/**',
        ' * Configuracao do Electron Forge: como o app e compilado e empacotado.',
        ' *',
        ' * O Forge compila tres partes com o Vite, todas com vite.config.mts:',
        ' *  - main (src/main.ts): processo principal, que cria a janela e acessa arquivos;',
        ' *  - preload (src/preload.ts): ponte que expoe so as APIs de arquivo a interface;',
        ' *  - renderer (index.html -> src/app.ts): a interface Vue.',
        ' * `npm run package` gera o executavel em out/. Nao ha instaladores (makers),',
        ' * porque a entrega pede um executavel que rode sem instalar nada. Os fuses',
        ' * desligam recursos do Electron que o app nao usa, por seguranca.',
        ' */',
        '',
    ].join('\n');
    write('forge.config.mts', header + text);
}

function buildPackageJson() {
    const pkg = JSON.parse(read('package.json'));
    // JSON puro nao aceita comentarios; a descricao fica no campo proprio.
    pkg.description =
        'Simulador de SO multitarefa de tempo compartilhado: escalonamento RM e EDF (Projeto A). Veja README.md.';
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
        delete pkg.devDependencies[name];
        delete pkg.dependencies?.[name];
    }
    write('package.json', `${JSON.stringify(pkg, null, 4)}\n`);
}

/** As regras de camada passam de pastas para os arquivos planos. */
function buildOxlint() {
    const cfg = JSON.parse(read('.oxlintrc.json'));
    // A entrega nao tem .gitignore (os arquivos vao soltos); sem ele o oxlint
    // varreria as dependencias e as saidas de build.
    cfg.ignorePatterns = ['node_modules/**', 'out/**', '.vite/**'];
    const filesFor = (glob) => {
        const layer = glob.match(/^src\/(\w+)\/\*\*$/)?.[1];
        return (
            LAYERS[layer] ??
            fail(`camada desconhecida em .oxlintrc.json: ${glob}`)
        );
    };
    const groupFor = (glob) => {
        const layer = glob.match(/^\*\*\/(\w+)\/\*\*$/)?.[1];
        if (!layer) {
            return [glob];
        }
        return LAYERS[layer].map(
            (file) => `./${path.posix.basename(file, '.ts')}`,
        );
    };
    for (const override of cfg.overrides) {
        override.files = override.files.flatMap(filesFor);
        for (const rule of Object.values(override.rules)) {
            for (const option of rule.slice(1)) {
                for (const pattern of option.patterns ?? []) {
                    pattern.group = pattern.group.flatMap(groupFor);
                }
            }
        }
    }
    const header = [
        '// Regras do oxlint (`npm run lint`). Alem dos erros comuns (categoria',
        '// "correctness"), garante a separacao em camadas pedida na arquitetura:',
        '//  - o nucleo (model, config, scheduling, simulator) e TypeScript puro: nao',
        '//    importa Vue, Electron, Node nem outras camadas, para poder ser testado e',
        '//    reutilizado sem a interface;',
        '//  - shared.ts so tem contratos e nao importa nenhuma camada;',
        '//  - a interface (app, gantt) nao acessa Electron nem Node; tudo que e',
        '//    privilegiado passa pelo preload;',
        '//  - main e preload nao importam a interface.',
        '// O arquivo aceita comentarios (JSONC).',
    ].join('\n');
    write('.oxlintrc.json', `${header}\n${JSON.stringify(cfg, null, 4)}\n`);
}

function buildReadme(mergedSections, cssSources) {
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
        'npm run typecheck  # confere os tipos dos arquivos .ts',
        'npm run lint       # confere as regras de importacao entre camadas',
        'npm run package    # gera o executavel em out/',
        '```',
        '',
        '## Organizacao',
        '',
        'Esta versao e gerada por `scripts/build-submission.mjs` a partir do projeto completo. Os modulos foram fundidos em poucos arquivos dentro de `src/`; cada secao tem um banner `// ===== nome =====` com uma descricao e o caminho original.',
        '',
        '| Arquivo | Conteudo |',
        '| --- | --- |',
        ...MERGED.map((m) => `| \`${m.out}\` | ${m.title} ${m.summary} |`),
        '| `src/components.vue.pack` | Os componentes Vue, separados no build pelo plugin `vuePack` de `vite.config.mts`. |',
        `| \`${CSS_OUT}\` | Estilos globais. |`,
        '| `src/declarations.d.ts` | Tipos globais (APIs do preload, imports de CSS e de .vue). |',
        '',
        'Dependencias entre os arquivos do nucleo: `model` <- `config`, `scheduling` <- `simulator`. O nucleo nao importa Vue, Electron nem Node.',
        '',
        '## Secoes de cada arquivo',
        '',
    ];
    for (const merged of MERGED) {
        lines.push(`### \`${merged.out}\``, '');
        for (const [source, name, description] of mergedSections.get(
            merged.out,
        )) {
            lines.push(`- **${name}** (\`${source}\`): ${description}`);
        }
        lines.push('');
    }
    lines.push('### `src/components.vue.pack`', '');
    for (const [group, description, files] of VUE_GROUPS) {
        lines.push(
            `- **${group}** (${description}): ${files.map((f) => path.posix.basename(f)).join(', ')}`,
        );
    }
    lines.push('', `### \`${CSS_OUT}\``, '');
    lines.push(...cssSources.map((s) => `- \`${s}\``), '');
    lines.push(
        '### Regras de importacao (`.oxlintrc.json`)',
        '',
        '- O nucleo (`model`, `config`, `scheduling`, `simulator`) nao importa Vue, Electron, Node nem outras camadas.',
        '- A interface (`app`, `gantt`) nao importa Electron, Node, `main` nem `preload`.',
        '- `main` e `preload` nao importam a interface.',
        '',
    );
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
            `arquivos novos em src/core fora do manifesto: ${missing.join(', ')}.`,
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
        (rel) => !outputOf.has(rel) && !inlined.has(rel),
    );
    if (missing.length > 0) {
        fail(
            `o app agora usa arquivos fora do manifesto: ${missing.join(', ')}.`,
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

const cssSources = buildCss();
const mergedSections = new Map();
for (const merged of MERGED) {
    mergedSections.set(merged.out, buildMerged(merged));
}
buildVuePack();
checkCoreCovered();
checkReachableCovered();

let indexHtml = replaceOnce(
    read('index.html'),
    '/src/renderer/renderer.ts',
    '/src/app.ts',
    'o script de index.html',
);
indexHtml = replaceOnce(
    indexHtml,
    '<!doctype html>\n',
    [
        '<!doctype html>',
        '<!--',
        '  Pagina da janela do app. O Vite usa este arquivo como entrada da interface:',
        '  carrega src/app.ts, que monta o app Vue dentro de #app. Nao ha mais nada',
        '  aqui porque toda a tela e desenhada pelos componentes Vue.',
        '-->',
        '',
    ].join('\n'),
    'o doctype de index.html',
);
write('index.html', indexHtml);
write(
    'tsconfig.json',
    [
        '// Configuracao do TypeScript para todo o projeto (usada por `npm run typecheck`',
        '// e pelo editor). `strict` liga todas as verificacoes de tipo; `module:',
        '// preserve` e `moduleResolution: bundler` deixam a resolucao de imports para o',
        '// Vite, que e quem compila de verdade. O arquivo aceita comentarios (JSONC).',
        read('tsconfig.json'),
    ].join('\n'),
);
write('vite.config.mts', VITE_CONFIG);
buildDeclarations();
buildForge();
buildPackageJson();
buildOxlint();
buildReadme(mergedSections, cssSources);
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
