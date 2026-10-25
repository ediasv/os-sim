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
            id: 1,
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

    it('accepts a byte order mark, CRLF endings and a lowercase algorithm', () => {
        expect(parsedConfig('﻿edf;5;1\r\n1;FFFFFF;0;1;0;1\r\n').algorithm).toBe(
            'EDF',
        );
    });

    it('treats a doubled final semicolon in the header as an extra field', () => {
        expect(issuesOf('RM;5;1;;\n1;FFFFFF;0;1;0;1')).toEqual([
            { line: 1, field: 'cabecalho', value: 'RM;5;1;;' },
        ]);
    });

    it('normalizes whitespace, blank lines, case, and optional final semicolons', () => {
        const variant = [
            '  rM ; 5 ; 2 ; ',
            '',
            ' 1 ; AbCdEf ; 0 ; 2 ; 5 ; 7 ; ML1:3;MU1:4 ; ',
            ' ',
        ].join('\r\n');

        expect(parsedConfig(variant)).toEqual(parsedConfig(standardFile));
        expect(parsedConfig(standardFile)).toEqual({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 2,
            tasks: [
                {
                    id: 1,
                    color: 'ABCDEF',
                    arrival: 0,
                    duration: 2,
                    period: 5,
                    deadline: 7,
                    rawEvents: 'ML1:3;MU1:4',
                },
            ],
        });
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
            { line: 2, field: 'id' },
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
            expect(issuesOf(`RM;5;1\n${value};FFFFFF;0;1;0;1`)).toEqual([
                { line: 2, field: 'id', value },
            ]);
        },
    );

    it('leaves integer and range rules to the core for decimal numerals', () => {
        expect(
            parsedConfig('RM;5;1\n-3;FFFFFF;1.5;99999999999999999999;+2;007')
                .tasks[0],
        ).toMatchObject({
            id: -3,
            arrival: 1.5,
            duration: 1e20,
            period: 2,
            deadline: 7,
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
            'XX;5;1\n1;FFFFFF;0;1;0;1',
            'Linha 1, campo algoritmo_escalonamento, valor "XX": esperado RM ou EDF.',
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
    it('keeps the tasks that parsed, with their lines and received texts, next to the syntax issues', () => {
        const { issues, draft } = analyzeConfig(
            'rm; 5;1\n\n1;abc;x;1;0;1\n2; abcdef ;0;1;0;1;E1',
        );

        expect(issues.map(({ line, field }) => ({ line, field }))).toEqual([
            { line: 3, field: 'ingresso' },
        ]);
        expect(draft?.config.tasks.map((task) => task.id)).toEqual([2]);
        expect(draft?.lines).toEqual({ header: 1, tasks: [4] });
        expect(draft?.headerTexts).toMatchObject({
            algorithm: 'rm',
            quantum: '5',
        });
        expect(draft?.taskTexts).toEqual([
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

    it('has no draft when the header cannot be formed', () => {
        expect(analyzeConfig('RM;bad;1\n1;FFFFFF;0;1;0;1').draft).toBeNull();
        expect(analyzeConfig('1;FFFFFF;0;1;0;1').draft).toBeNull();
    });

    it('agrees with parseConfig on a valid file', () => {
        const analysis = analyzeConfig(standardFile);
        const parsed = parseConfig(standardFile);

        expect(analysis.issues).toEqual([]);
        expect(parsed.ok && parsed.config).toEqual(analysis.draft?.config);
    });
});
