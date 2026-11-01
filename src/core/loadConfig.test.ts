import { describe, expect, it } from 'vitest';
import { validateConfig } from './config';
import { createSimulator } from './createSimulator';
import { loadConfig } from './loadConfig';
import { parseConfig } from './parser';

function issuesOf(text: string) {
    const result = loadConfig(text);
    if (result.ok) throw new Error('expected diagnostics');
    return result.issues;
}

const where = ({
    line,
    field,
    value,
}: ReturnType<typeof issuesOf>[number]) => ({
    line,
    field,
    value,
});

describe('loadConfig', () => {
    it('returns the validated, normalized configuration and the line map', () => {
        const result = loadConfig('RM;5;2\n\n1;abcdef;0;2;5;7;ML1:3;MU1:4\n');

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.config.tasks[0].color).toBe('ABCDEF');
        expect(Object.isFrozen(result.config)).toBe(true);
        expect(result.lines).toEqual({ header: 1, tasks: [3] });
    });

    it.each([
        [
            'an unknown algorithm',
            'XX;5;1\n1;FFFFFF;0;1;0;1',
            { line: 1, field: 'algoritmo_escalonamento', value: 'XX' },
            'O campo algoritmo_escalonamento deve ser RM ou EDF; valor recebido: "XX".',
        ],
        [
            'a quantum below 1',
            'RM;0;1\n1;FFFFFF;0;1;0;1',
            { line: 1, field: 'quantum', value: '0' },
            'O campo quantum deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
        ],
        [
            'a fractional CPU count',
            'RM;5;1.5\n1;FFFFFF;0;1;0;1',
            { line: 1, field: 'qtde_cpus', value: '1.5' },
            'O campo qtde_cpus deve ser um número inteiro maior ou igual a 1; valor recebido: 1.5.',
        ],
        [
            'an id below 1',
            'RM;5;1\n0;FFFFFF;0;1;0;1',
            { line: 2, field: 'id', value: '0' },
            'O campo id deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
        ],
        [
            'a repeated id',
            'RM;5;1\n1;FFFFFF;0;1;0;1\n\n1;000000;0;1;0;1',
            { line: 4, field: 'id', value: '1' },
            'O id 1 já foi usado pela 1ª tarefa; cada tarefa precisa de um id único.',
        ],
        [
            'a color that is not six hex digits',
            'RM;5;1\n1;#FFFFFF;0;1;0;1',
            { line: 2, field: 'cor', value: '#FFFFFF' },
            'O campo cor deve ter 6 dígitos hexadecimais RGB, sem "#" (por exemplo F0E0D0); valor recebido: "#FFFFFF".',
        ],
        [
            'a color repeated with another case',
            'RM;5;1\n1;abcdef;0;1;0;1\n2;ABCDEF;0;1;0;1',
            { line: 3, field: 'cor', value: 'ABCDEF' },
            'A cor ABCDEF já foi usada pela 1ª tarefa; cada tarefa precisa de uma cor diferente.',
        ],
        [
            'a lowercase color that is not six hex digits',
            'RM;5;1\n1;#ffffff;0;1;0;1',
            { line: 2, field: 'cor', value: '#ffffff' },
            'O campo cor deve ter 6 dígitos hexadecimais RGB, sem "#" (por exemplo F0E0D0); valor recebido: "#ffffff".',
        ],
        [
            'a lowercase color repeating an uppercase one',
            'RM;5;1\n1;ABCDEF;0;1;0;1\n2;abcdef;0;1;0;1',
            { line: 3, field: 'cor', value: 'abcdef' },
            'A cor ABCDEF já foi usada pela 1ª tarefa; cada tarefa precisa de uma cor diferente.',
        ],
        [
            'a negative arrival',
            'RM;5;1\n1;FFFFFF;-1;1;0;1',
            { line: 2, field: 'ingresso', value: '-1' },
            'O campo ingresso deve ser um número inteiro maior ou igual a 0; valor recebido: -1.',
        ],
        [
            'a duration below 1',
            'RM;5;1\n1;FFFFFF;0;0;0;1',
            { line: 2, field: 'duracao', value: '0' },
            'O campo duracao deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
        ],
        [
            'a negative period',
            'RM;5;1\n1;FFFFFF;0;1;-2;1',
            { line: 2, field: 'periodo', value: '-2' },
            'O campo periodo deve ser um número inteiro maior ou igual a 0; valor recebido: -2.',
        ],
        [
            'a deadline below 1',
            'RM;5;1\n1;FFFFFF;0;1;0;0',
            { line: 2, field: 'prazo', value: '0' },
            'O campo prazo deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
        ],
        [
            'a non-integer value written with decimals',
            'RM;5;1\n1;FFFFFF;0;2.50;0;1',
            { line: 2, field: 'duracao', value: '2.50' },
            'O campo duracao deve ser um número inteiro maior ou igual a 1; valor recebido: 2.5.',
        ],
    ])('reports %s', (_name, text, expected, coreMessage) => {
        const issues = issuesOf(text);

        expect(issues.map(where)).toEqual([expected]);
        expect(issues[0].message).toBe(
            `Linha ${expected.line}, campo ${expected.field} (valor ${expected.value}): ${coreMessage}`,
        );
    });

    it('reports only the syntax issue when the algorithm is also invalid', () => {
        expect(issuesOf('XX;5;1\n1;FFFFFF;x;1;0;1').map(where)).toEqual([
            { line: 2, field: 'ingresso', value: 'x' },
        ]);
    });

    it.each([
        [
            'a periodic',
            'RM;5;1\n1;FFFFFF;0;1;2000000000000000;1',
            'ingresso + 9 × periodo + prazo',
        ],
        [
            'a default-period',
            'RM;5;1\n1;FFFFFF;9007199254740990;1;0;5',
            'ingresso + 9 × periodo + prazo',
        ],
    ])(
        'shows no single received value for %s last deadline beyond the exact range',
        (_name, text, formula) => {
            const issues = issuesOf(text);

            expect(issues.map(where)).toEqual([
                { line: 2, field: 'prazo', value: null },
            ]);
            expect(issues[0].message).toBe(
                `Linha 2, campo prazo: O prazo da última ativação (${formula}) ultrapassa o maior inteiro exato suportado (9007199254740991).`,
            );
        },
    );

    it('distinguishes missing syntax values from combined core values', () => {
        const missing = issuesOf('RM;5;1\n1;FFFFFF;0;1;;');
        const combined = issuesOf('RM;5;1\n1;FFFFFF;9007199254740990;1;0;5');

        expect(missing[0]).toMatchObject({
            value: null,
            valueKind: 'missing',
            origin: 'syntax',
        });
        expect(combined[0]).toMatchObject({
            value: null,
            valueKind: 'combined',
            origin: 'core',
        });
    });

    it('reports every problem of several lines, in file order', () => {
        const issues = issuesOf(
            [
                'RM;0;1',
                '',
                '1;FFFFFF;0;0;0;1',
                '2;FFFFFF;-1;1;0;1',
                '1;000000;0;1;0;0',
            ].join('\n'),
        );

        expect(issues.map(where)).toEqual([
            { line: 1, field: 'quantum', value: '0' },
            { line: 3, field: 'duracao', value: '0' },
            { line: 4, field: 'ingresso', value: '-1' },
            { line: 4, field: 'cor', value: 'FFFFFF' },
            { line: 5, field: 'prazo', value: '0' },
            { line: 5, field: 'id', value: '1' },
        ]);
        expect(issues[5].message).toBe(
            'Linha 5, campo id (valor 1): O id 1 já foi usado pela 1ª tarefa; cada tarefa precisa de um id único.',
        );
    });

    it('reports only the missing task line for a file with a header alone', () => {
        const issues = issuesOf('RM;5;1');

        expect(issues.map(where)).toEqual([
            { line: 2, field: 'tarefa', value: null },
        ]);
        expect(issues[0].message).toBe(
            'Linha 2, campo tarefa, valor ausente: nenhuma linha de tarefa encontrada; esperada pelo menos uma (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos).',
        );
    });

    it('reports only syntax errors while a task line is broken', () => {
        const issues = issuesOf(
            [
                'RM;5;1',
                '1;FFFFFF;x;1;0;1',
                '2;FFFFFF;0;1;0;1',
                '3;FFFFFF;0;1;0;1',
                '4;GGG;0;1;0;1',
            ].join('\n'),
        );

        expect(issues.map(where)).toEqual([
            { line: 2, field: 'ingresso', value: 'x' },
        ]);
        expect(issues[0].message).toBe(
            'Linha 2, campo ingresso, valor "x": esperado um número.',
        );
    });

    it('reports core problems with file ordinals once the syntax is fixed', () => {
        const issues = issuesOf(
            [
                'RM;5;1',
                '1;FFFFFF;0;1;0;1',
                '2;FFFFFF;0;1;0;1',
                '3;FFFFFF;0;1;0;1',
                '4;GGG;0;1;0;1',
            ].join('\n'),
        );

        expect(issues.map(where)).toEqual([
            { line: 3, field: 'cor', value: 'FFFFFF' },
            { line: 4, field: 'cor', value: 'FFFFFF' },
            { line: 5, field: 'cor', value: 'GGG' },
        ]);
        expect(issues[0].message).toMatch(
            /já foi usada pela 1ª tarefa; cada tarefa precisa de uma cor diferente\.$/,
        );
    });

    it('reports a conflict with a previously broken line only after it is fixed', () => {
        const broken = issuesOf('RM;5;1\n1;FFFFFF;x;1;0;1\n1;FFFFFF;0;1;0;1');
        expect(broken.map(where)).toEqual([
            { line: 2, field: 'ingresso', value: 'x' },
        ]);

        const fixed = issuesOf('RM;5;1\n1;FFFFFF;0;1;0;1\n1;FFFFFF;0;1;0;1');
        expect(fixed.map(where)).toEqual([
            { line: 3, field: 'id', value: '1' },
            { line: 3, field: 'cor', value: 'FFFFFF' },
        ]);
        for (const { message } of fixed) {
            expect(message).toContain('pela 1ª tarefa');
        }
    });

    it('does not invent semantic diagnostics when the header cannot be formed', () => {
        expect(issuesOf('RM;bad;1\n0;FFFFFF;0;1;0;1').map(where)).toEqual([
            { line: 1, field: 'quantum', value: 'bad' },
        ]);
        expect(issuesOf('0;FFFFFF;0;1;0;1').map(where)).toEqual([
            { line: 1, field: 'cabecalho', value: null },
        ]);
    });

    it('adds no diagnostics of its own to the core messages', () => {
        const text = 'RM;0;1\n0;abcdef;-1;0;-2;0\n0;ABCDEF;0;1;0;1';
        const parsed = parseConfig(text);
        if (!parsed.ok) throw new Error('expected a parsed file');
        const core = validateConfig(parsed.config);
        if (core.ok) throw new Error('expected core issues');

        const issues = issuesOf(text);

        expect(issues).toHaveLength(core.issues.length);
        issues.forEach(({ message }, index) => {
            expect(message.endsWith(`: ${core.issues[index].message}`)).toBe(
                true,
            );
        });
    });

    it('loads every case variant of a file as the same configuration', () => {
        const standardFile = 'RM;5;2\n1;abcdef;0;2;5;7;ML1:3;MU1:4';
        const variant = [
            '  rM ; 5 ; 2 ; ',
            '',
            ' 1 ; AbCdEf ; 0 ; 2 ; 5 ; 7 ; ML1:3;MU1:4 ; ',
            ' ',
        ].join('\r\n');

        const loaded = loadConfig(variant);
        const standard = loadConfig(standardFile);

        expect(loaded.ok && standard.ok).toBe(true);
        if (!loaded.ok || !standard.ok) return;
        expect(loaded.config).toEqual(standard.config);
        expect(loaded.config.tasks[0].color).toBe('ABCDEF');
    });

    it('returns the configuration the core validated for a valid file', () => {
        const text = 'edf;3;4\n1;00000a;0;2;6;3;\n2;000002;1;1;4;2;A;B';
        const parsed = parseConfig(text);
        const core = parsed.ok ? validateConfig(parsed.config) : null;
        const loaded = loadConfig(text);

        expect(core?.ok && loaded.ok).toBe(true);
        if (!core?.ok || !loaded.ok) return;
        expect(loaded.config).toEqual(core.config);
    });

    it('loads an empty period as the same configuration as an explicit zero', () => {
        const empty = loadConfig('RM;5;1\n1;F0E0D0;0;5;;10');
        const zero = loadConfig('RM;5;1\n1;F0E0D0;0;5;0;10');

        expect(empty.ok && zero.ok).toBe(true);
        if (!empty.ok || !zero.ok) return;
        expect(empty.config).toEqual(zero.config);
        expect(empty.config.tasks[0].period).toBe(15);
    });

    it('keeps a long event list exactly as written', () => {
        const rawEvents = Array.from(
            { length: 5000 },
            (_, i) => `ML${i}:${i} ; mu${i}:1`,
        ).join(';');
        const loaded = loadConfig(`RM;5;1\n1;F0E0D0;0;5;10;10;${rawEvents}`);

        expect(loaded.ok && loaded.config.tasks[0].rawEvents).toBe(rawEvents);
    });

    it('simulates the same schedule with and without event lists', () => {
        // Everything the engine produced; the configuration itself differs
        // only in rawEvents, which the core never reads (A.3.3.5).
        const run = (text: string) => {
            const loaded = loadConfig(text);
            if (!loaded.ok) throw new Error('expected a valid file');
            const sim = createSimulator(loaded.config);
            for (let step = 0; step < 30; step++) sim.tick();
            const { clock, cpus, executions, events, drawState, tasks } =
                sim.getLatestSnapshot();
            return {
                clock,
                cpus,
                executions,
                events,
                drawState,
                jobs: tasks.map((task) => task.jobs),
            };
        };
        const tasks = (events: string) =>
            [
                'RM;2;2',
                '1;F00000;0;3;6;6',
                `2;00F000;1;2;4;4${events}`,
                '3;0000F0;0;2;;5',
            ].join('\n');

        expect(run(tasks(';ML1:3;MU1:4'))).toEqual(run(tasks('')));
    });
});

describe('loadConfig: integer rule in every numeric field (DEC-10)', () => {
    // Each builder puts `v` in that field of an otherwise valid file.
    const at = {
        quantum: (v: string) => `RM;${v};1\n1;FFFFFF;0;1;0;1`,
        qtde_cpus: (v: string) => `RM;5;${v}\n1;FFFFFF;0;1;0;1`,
        id: (v: string) => `RM;5;1\n${v};FFFFFF;0;1;0;1`,
        ingresso: (v: string) => `RM;5;1\n1;FFFFFF;${v};1;0;1`,
        duracao: (v: string) => `RM;5;1\n1;FFFFFF;0;${v};0;1`,
        periodo: (v: string) => `RM;5;1\n1;FFFFFF;0;1;${v};1`,
        prazo: (v: string) => `RM;5;1\n1;FFFFFF;0;1;0;${v}`,
    } as const;
    const minimum = {
        quantum: 1,
        qtde_cpus: 1,
        id: 1,
        ingresso: 0,
        duracao: 1,
        periodo: 0,
        prazo: 1,
    } as const;
    const fields = Object.keys(at) as (keyof typeof at)[];
    const lineOf = (field: keyof typeof at) =>
        field === 'quantum' || field === 'qtde_cpus' ? 1 : 2;

    function expectRejected(
        field: keyof typeof at,
        value: string,
        shown: string,
    ) {
        const issues = issuesOf(at[field](value));
        const line = lineOf(field);
        expect(issues).toHaveLength(1);
        expect(where(issues[0])).toEqual({ line, field, value });
        expect(issues[0].origin).toBe('core');
        expect(issues[0].message).toBe(
            `Linha ${line}, campo ${field} (valor ${value}): O campo ${field} deve ser um número inteiro maior ou igual a ${minimum[field]}; valor recebido: ${shown}.`,
        );
    }

    it.each(fields)('rejects a fractional %s', (field) => {
        expectRejected(field, '1.5', '1.5');
    });

    it.each(fields)('rejects %s beyond the exact-integer range', (field) => {
        expectRejected(field, '99999999999999999999', '100000000000000000000');
    });

    it('rejects zero CPUs', () => {
        expectRejected('qtde_cpus', '0', '0');
    });
});

describe('loadConfig: only the period may be missing (DEC-10, DEC-31)', () => {
    it.each([
        ['algoritmo_escalonamento', ';5;1\n1;FFFFFF;0;1;0;1', 1],
        ['quantum', 'RM;;1\n1;FFFFFF;0;1;0;1', 1],
        // `RM;5;` would lose its final `;` (DEC-20) and report a count.
        ['qtde_cpus', 'RM;5; ;\n1;FFFFFF;0;1;0;1', 1],
        ['id', 'RM;5;1\n;FFFFFF;0;1;0;1', 2],
        ['cor', 'RM;5;1\n1;;0;1;0;1', 2],
        ['ingresso', 'RM;5;1\n1;FFFFFF;;1;0;1', 2],
        ['duracao', 'RM;5;1\n1;FFFFFF;0;;0;1', 2],
        ['prazo', 'RM;5;1\n1;FFFFFF;0;1;0;;', 2],
    ])('rejects an empty %s', (field, text, line) => {
        const issues = issuesOf(text);
        expect(issues).toHaveLength(1);
        expect(where(issues[0])).toEqual({ line, field, value: null });
        expect(issues[0].origin).toBe('syntax');
        expect(issues[0].message).toBe(
            `Linha ${line}, campo ${field}, valor ausente: campo obrigatório ausente.`,
        );
    });
});

describe('loadConfig: many tasks', () => {
    it('loads many tasks through the whole pipeline', () => {
        const count = 300;
        const rows = Array.from(
            { length: count },
            (_, i) =>
                `${i + 1};${(i + 1).toString(16).padStart(6, '0')};${i % 7};1;${10 + i};${10 + i}`,
        );
        const result = loadConfig(['RM;1;4', ...rows].join('\n'));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.config.tasks).toHaveLength(count);
        expect(result.warnings).toEqual([]);
        expect(result.lines.tasks).toEqual(
            Array.from({ length: count }, (_, i) => i + 2),
        );
        for (const task of result.config.tasks) {
            expect(task.color).toBe(task.color.toUpperCase());
        }
    });
});

describe('default period (DEC-29)', () => {
    function loaded(text: string) {
        const result = loadConfig(text);
        if (!result.ok) throw new Error('expected a valid file');
        return result;
    }

    it('loads a missing and a zero period as the default period, with one warning each', () => {
        const result = loaded('RM;5;1\n1;F0E0D0;0;5;;10\n\n2;0A0B0C;0;2;0;8');

        expect(result.config.tasks.map((task) => task.period)).toEqual([
            15, 15,
        ]);
        expect(result.warnings).toEqual([
            {
                line: 2,
                field: 'periodo',
                value: null,
                valueKind: 'missing',
                origin: 'default-period',
                taskId: 1,
                message:
                    'Linha 2, campo periodo: toda tarefa precisa de período maior que zero; a tarefa 1 usará o período padrão de 15 ticks.',
            },
            {
                line: 4,
                field: 'periodo',
                value: '0',
                valueKind: 'received',
                origin: 'default-period',
                taskId: 2,
                message:
                    'Linha 4, campo periodo (valor 0): toda tarefa precisa de período maior que zero; a tarefa 2 usará o período padrão de 15 ticks.',
            },
        ]);
    });

    it('returns no warnings when every period is positive', () => {
        const result = loaded('RM;5;1\n1;F0E0D0;0;5;10;10');

        expect(result.warnings).toEqual([]);
        expect(result.config.tasks[0].period).toBe(10);
    });

    it('simulates a converted task as a task of period 15', () => {
        const jobsOf = (text: string) => {
            const sim = createSimulator(loaded(text).config);
            for (let step = 0; step < 150; step++) sim.tick();
            return sim.getLatestSnapshot().tasks[0].jobs;
        };
        const converted = jobsOf('RM;5;1\n1;F0E0D0;0;2;0;3');

        expect(converted).toEqual(jobsOf('RM;5;1\n1;F0E0D0;0;2;15;3'));
        expect(converted.map((job) => job.activation)).toEqual(
            Array.from({ length: 10 }, (_, i) => i * 15),
        );
    });

    it('still reports another invalid field of a converted task, without warnings', () => {
        const result = loadConfig('RM;5;1\n1;F0E0D0;0;0;0;10');

        expect(result.ok).toBe(false);
        expect(result).toHaveProperty('warnings');
        if (!result.ok) {
            expect(result.warnings[0]).toMatchObject({
                value: '0',
                valueKind: 'received',
                origin: 'default-period',
            });
        }
        expect(issuesOf('RM;5;1\n1;F0E0D0;0;0;0;10').map(where)).toEqual([
            { line: 2, field: 'duracao', value: '0' },
        ]);
    });

    it('validates the derived deadline with the default period', () => {
        const arrival = Number.MAX_SAFE_INTEGER - 100;
        const unconverted = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [
                {
                    id: 1,
                    color: 'F0E0D0',
                    arrival,
                    duration: 1,
                    period: 0,
                    deadline: 10,
                    rawEvents: '',
                },
            ],
        };
        // Control: with period 0 the same task fits the integer limit.
        expect(validateConfig(unconverted).ok).toBe(true);

        const issues = issuesOf(`RM;5;1\n1;F0E0D0;${arrival};1;0;10`);

        expect(issues.map(where)).toEqual([
            { line: 2, field: 'prazo', value: null },
        ]);
        expect(issues[0].message).toContain('ingresso + 9 × periodo + prazo');
    });

    it.each(['-0', '+0', '0.0'])('converts a period written as %s', (text) => {
        const result = loaded(`RM;5;1\n1;F0E0D0;0;5;${text};10`);

        expect(result.config.tasks[0].period).toBe(15);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].value).toBe(text);
        expect(result.warnings[0].message).toContain(`(valor ${text})`);
    });
});
