import { describe, expect, it } from 'vitest';
import { analyzeConfig, parseConfig } from './parser';

const standardFile = ['RM;5;2', '1;abcdef;0;2;5;7;ML1:3;MU1:4'].join('\n');

function parsedConfig(text: string) {
    const result = parseConfig(text);
    expect(result.ok).toBe(true);
    if (!result.ok)
        throw new Error(result.issues.map((issue) => issue.message).join('\n'));
    return result.config;
}

function issuesOf(text: string) {
    const result = parseConfig(text);
    if (result.ok) throw new Error('expected parse issues');
    return result.issues.map(({ line, field, value }) => ({
        line,
        field,
        value,
    }));
}

describe('parseConfig', () => {
    it.each([
        ['without a final semicolon', '1;FFFFFF;0;2;5;7'],
        ['with a final semicolon', '1;FFFFFF;0;2;5;7;'],
        [
            'with an empty event list and a final semicolon',
            '1;FFFFFF;0;2;5;7;;',
        ],
        ['with tabs and spaces', '\t1 ;\tFFFFFF ; 0;2 ;5; 7\t'],
    ])('accepts a task line %s as having no events', (_name, task) => {
        expect(parsedConfig(`RM;5;1\n${task}`).tasks[0]).toEqual({
            id: '1',
            color: 'FFFFFF',
            arrival: 0,
            duration: 2,
            period: 5,
            deadline: 7,
            rawEvents: '',
        });
    });

    it.each([
        ['ML1:3;MU1:4', 'ML1:3;MU1:4'],
        ['ML1:3;MU1:4;', 'ML1:3;MU1:4'],
        [' ML1:3 ; MU1:4 ; ', 'ML1:3 ; MU1:4'],
        ['ML1:3;;', 'ML1:3;'],
    ])('keeps the event list %j as %j', (events, rawEvents) => {
        expect(
            parsedConfig(`RM;5;1\n1;FFFFFF;0;2;5;7;${events}`).tasks[0]
                .rawEvents,
        ).toBe(rawEvents);
    });

    it.each([
        ['an empty', '1;F0E0D0;0;5;;10'],
        ['a blank', '1;F0E0D0;0;5; \t ;10'],
        ['an empty, before events,', '1;F0E0D0;0;5;;10;ML1:3'],
    ])('reads %s period as an explicit zero', (_name, task) => {
        const zero = parsedConfig('RM;5;1\n1;F0E0D0;0;5;0;10').tasks[0];
        const parsed = parsedConfig(`RM;5;1\n${task}`).tasks[0];
        expect({ ...parsed, rawEvents: '' }).toEqual(zero);
    });

    it('keeps the events after an empty period', () => {
        expect(
            parsedConfig('RM;5;1\n1;F0E0D0;0;5;;10;ML1:3').tasks[0].rawEvents,
        ).toBe('ML1:3');
    });

    it('accepts a byte order mark and CRLF endings', () => {
        expect(parsedConfig('﻿edf;5;1\r\n1;FFFFFF;0;1;0;1\r\n').algorithm).toBe(
            'edf',
        );
    });

    it('keeps the algorithm as written; the core decides if it is valid', () => {
        expect(parsedConfig('XX;5;1\n1;FFFFFF;0;1;0;1').algorithm).toBe('XX');
    });

    it('treats a doubled final semicolon in the header as an extra field', () => {
        expect(issuesOf('RM;5;1;;\n1;FFFFFF;0;1;0;1')).toEqual([
            { line: 1, field: 'cabecalho', value: 'RM;5;1;;' },
        ]);
    });

    it('normalizes whitespace, blank lines, and optional final semicolons', () => {
        const variant = [
            '  RM ; 5 ; 2 ; ',
            '',
            ' 1 ; abcdef ; 0 ; 2 ; 5 ; 7 ; ML1:3;MU1:4 ; ',
            ' ',
        ].join('\r\n');

        expect(parsedConfig(variant)).toEqual(parsedConfig(standardFile));
        expect(parsedConfig(standardFile)).toEqual({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 2,
            tasks: [
                {
                    id: '1',
                    color: 'abcdef',
                    arrival: 0,
                    duration: 2,
                    period: 5,
                    deadline: 7,
                    rawEvents: 'ML1:3;MU1:4',
                },
            ],
        });
    });

    it('keeps the color as written, for the core to compare and uppercase (DEC-19)', () => {
        expect(parsedConfig('RM;5;1\n1;AbCdEf;0;1;0;1').tasks[0].color).toBe(
            'AbCdEf',
        );
    });

    it.each([
        ['only a header', 'RM;5;1', 2, 'tarefa'],
        ['no header', '1;FFFFFF;0;1;0;1;', 1, 'cabecalho'],
        [
            'no header after blank lines',
            '\n\n1;FFFFFF;0;1;0;1;',
            1,
            'cabecalho',
        ],
        ['a missing header field', 'RM;5;', 1, 'qtde_cpus'],
        ['a missing algorithm field', ';5;1', 1, 'algoritmo_escalonamento'],
    ])(
        'rejects %s with a line and field diagnostic',
        (_name, text, line, field) => {
            const result = parseConfig(text);

            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.issues[0]).toMatchObject({ line, field });
            expect(result.issues[0].message).toContain(`Linha ${line}`);
        },
    );

    it('reports missing task fields and retains original line numbers', () => {
        const result = parseConfig('RM;5;1\n\n1;FFFFFF;0;2;5;');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field, value }) => ({
                line,
                field,
                value,
            })),
        ).toEqual([{ line: 3, field: 'prazo', value: null }]);
    });

    it('collects recoverable syntax errors across the file', () => {
        const result = parseConfig(
            'RM;bad;1\n1;FFFFFF;bad;2;5;7;\n2;000000;0;bad;5;7;',
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field, value }) => ({
                line,
                field,
                value,
            })),
        ).toEqual([
            { line: 1, field: 'quantum', value: 'bad' },
            { line: 2, field: 'ingresso', value: 'bad' },
            { line: 3, field: 'duracao', value: 'bad' },
        ]);
        expect(result.issues[0].message).toContain('valor "bad"');
    });

    it('continues parsing task rows when the header is missing', () => {
        const result = parseConfig('1;FFFFFF;bad;2;5;7;\n2;000000;0;bad;5;7;');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field }) => ({ line, field })),
        ).toEqual([
            { line: 1, field: 'cabecalho' },
            { line: 1, field: 'ingresso' },
            { line: 2, field: 'duracao' },
        ]);
    });

    it('validates recognizable header fields after an extra-field error', () => {
        const result = parseConfig('RM;bad;1;extra\n1;FFFFFF;0;1;0;1;');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field }) => ({ line, field })),
        ).toEqual([
            { line: 1, field: 'cabecalho' },
            { line: 1, field: 'quantum' },
        ]);
    });

    it('validates available task fields in truncated rows', () => {
        const result = parseConfig('RM;5;1\nx;FFFFFF;bad;2;5;');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field }) => ({ line, field })),
        ).toEqual([
            { line: 2, field: 'ingresso' },
            { line: 2, field: 'prazo' },
        ]);
    });

    it('validates the deadline when the line has no event list', () => {
        const result = parseConfig('RM;5;1\n1;FFFFFF;0;2;5;bad');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field }) => ({ line, field })),
        ).toEqual([{ line: 2, field: 'prazo' }]);
    });

    it.each(['0x10', '1e1', '0b11', '.5', 'Infinity', '1_000'])(
        'rejects the non-decimal number %s',
        (value) => {
            expect(issuesOf(`RM;5;1\n1;FFFFFF;${value};1;0;1`)).toEqual([
                { line: 2, field: 'ingresso', value },
            ]);
        },
    );

    it('leaves integer and range rules to the core for decimal numerals', () => {
        expect(
            parsedConfig('RM;5;1\n-3;FFFFFF;1.5;99999999999999999999;+2;007')
                .tasks[0],
        ).toMatchObject({
            id: '-3',
            arrival: 1.5,
            duration: 1e20,
            period: 2,
            deadline: 7,
        });
    });

    describe('free-text ids (DEC-48)', () => {
        it.each([
            'A',
            'tarefa-1',
            'tarefa 1',
            '01',
            '-3',
            '2.5',
            '0x10',
            'ação',
        ])('keeps the id %j as written', (id) => {
            expect(
                parsedConfig(`RM;5;1\n${id};FFFFFF;0;1;0;1`).tasks[0].id,
            ).toBe(id);
        });

        it('trims spaces around the id', () => {
            expect(
                parsedConfig('RM;5;1\n  tarefa 1  ;FFFFFF;0;1;0;1').tasks[0].id,
            ).toBe('tarefa 1');
        });

        it('reports an empty id as a missing field', () => {
            expect(issuesOf('RM;5;1\n;FFFFFF;0;1;0;1')).toEqual([
                { line: 2, field: 'id', value: null },
            ]);
        });

        it.each([
            ['a numeric id', '1;FFFFFF;0;1;0;1;'],
            ['a text id', 'A;FFFFFF;0;1;0;1;'],
            ['a text id with a hyphen', 'tarefa-1;00FF00;0;2;5;5'],
        ])('detects a missing header before %s', (_name, task) => {
            const result = parseConfig(task);
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.issues[0]).toMatchObject({
                line: 1,
                field: 'cabecalho',
            });
            expect(result.issues[0].message).toContain('cabeçalho ausente');
        });

        it('still reads a header whose quantum has six digits', () => {
            expect(parsedConfig('RM;123456;1\n1;FFFFFF;0;1;0;1').quantum).toBe(
                123456,
            );
        });
    });

    it('reports a missing header and a missing task for an empty file', () => {
        expect(issuesOf('')).toEqual([
            { line: 1, field: 'cabecalho', value: null },
            { line: 1, field: 'tarefa', value: null },
        ]);
        expect(issuesOf('  \n \n')).toEqual([
            { line: 1, field: 'cabecalho', value: null },
            { line: 3, field: 'tarefa', value: null },
        ]);
    });

    it.each([
        [
            ';5;1\n1;FFFFFF;0;1;0;1',
            'Linha 1, campo algoritmo_escalonamento, valor ausente: campo obrigatório ausente.',
        ],
        [
            'RM;5\n1;FFFFFF;0;1;0;1',
            'Linha 1, campo qtde_cpus, valor ausente: campo obrigatório ausente; esperados 3 campos (formato: algoritmo_escalonamento;quantum;qtde_cpus) e recebidos 2.',
        ],
        [
            'RM;5;1;x\n1;FFFFFF;0;1;0;1',
            'Linha 1, campo cabecalho, valor "RM;5;1;x": esperados 3 campos no cabeçalho (formato: algoritmo_escalonamento;quantum;qtde_cpus) e recebidos 4.',
        ],
        [
            'RM;5;1\n1;FFFFFF;0;1;0',
            'Linha 2, campo prazo, valor ausente: campo obrigatório ausente; esperados 6 campos antes da lista_eventos opcional (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos) e recebidos 5.',
        ],
        [
            'RM;5;1\n1;FFFFFF;0;;0;1',
            'Linha 2, campo duracao, valor ausente: campo obrigatório ausente.',
        ],
        [
            'RM;5;1\n1;FFFFFF;x;1;0;1',
            'Linha 2, campo ingresso, valor "x": esperado um número.',
        ],
        [
            '1;FFFFFF;0;1;0;1',
            'Linha 1, campo cabecalho, valor ausente: cabeçalho ausente (formato: algoritmo_escalonamento;quantum;qtde_cpus).',
        ],
        [
            'RM;5;1',
            'Linha 2, campo tarefa, valor ausente: nenhuma linha de tarefa encontrada; esperada pelo menos uma (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos).',
        ],
    ])('explains %j', (text, message) => {
        const result = parseConfig(text);
        if (result.ok) throw new Error('expected parse issues');
        expect(result.issues[0].message).toBe(message);
    });

    it('maps each task to its original line', () => {
        const result = parseConfig(
            '\n RM;5;1\n\n1;FFFFFF;0;1;0;1;\r\n2;000000;0;1;0;1\r3;0000FF;0;1;0;1',
        );

        expect(result.ok && result.lines).toEqual({
            header: 2,
            tasks: [4, 5, 6],
        });
    });

    it('loads an unbounded number of task rows', () => {
        const tasks = Array.from(
            { length: 500 },
            (_, index) =>
                `${index + 1};${index.toString(16).padStart(6, '0')};0;1;0;1;`,
        );

        expect(
            parsedConfig(['RM;1;1', ...tasks].join('\n')).tasks,
        ).toHaveLength(tasks.length);
    });
});

describe('analyzeConfig', () => {
    it('returns the lines and received texts of a structurally valid file', () => {
        const analysis = analyzeConfig('rm; 5;1\n\n2; abcdef ;0;1;0;1;E1');

        expect(analysis.ok).toBe(true);
        if (!analysis.ok) return;
        expect(analysis.draft.lines).toEqual({ header: 1, tasks: [3] });
        expect(analysis.draft.headerTexts).toMatchObject({
            algorithm: 'rm',
            quantum: '5',
        });
        expect(analysis.draft.taskTexts).toEqual([
            {
                id: '2',
                color: 'abcdef',
                arrival: '0',
                duration: '1',
                period: '0',
                deadline: '1',
            },
        ]);
    });

    it.each([
        'rm; 5;1\n\n1;abc;x;1;0;1\n2;abcdef;0;1;0;1',
        'RM;bad;1\n1;FFFFFF;0;1;0;1',
        '1;FFFFFF;0;1;0;1',
    ])(
        'returns only the syntax issues, the same as parseConfig, for %j',
        (text) => {
            const analysis = analyzeConfig(text);
            const parsed = parseConfig(text);

            expect(analysis.ok).toBe(false);
            expect(analysis).not.toHaveProperty('draft');
            expect(parsed.ok).toBe(false);
            if (analysis.ok || parsed.ok) return;
            expect(analysis.issues).toEqual(parsed.issues);
        },
    );

    it('agrees with parseConfig on a valid file', () => {
        const analysis = analyzeConfig(standardFile);
        const parsed = parseConfig(standardFile);

        expect(analysis.ok && parsed.ok).toBe(true);
        if (!analysis.ok || !parsed.ok) return;
        expect(parsed.config).toEqual(analysis.draft.config);
        expect(parsed.lines).toEqual(analysis.draft.lines);
    });
});
