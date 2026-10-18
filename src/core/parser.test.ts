import { describe, expect, it } from 'vitest';
import { parseConfig } from './parser';

const standardFile = ['RM;5;2', '1;abcdef;0;2;5;7;ML1:3;MU1:4'].join('\n');

function parsedConfig(text: string) {
    const result = parseConfig(text);
    expect(result.ok).toBe(true);
    if (!result.ok)
        throw new Error(result.issues.map((issue) => issue.message).join('\n'));
    return result.config;
}

describe('parseConfig', () => {
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
        ).toEqual([
            { line: 3, field: 'prazo', value: null },
            { line: 3, field: 'lista_eventos', value: null },
        ]);
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
            { line: 2, field: 'prazo' },
            { line: 2, field: 'lista_eventos' },
            { line: 2, field: 'id' },
            { line: 2, field: 'ingresso' },
        ]);
    });

    it('validates an unterminated final task field while reporting missing events', () => {
        const result = parseConfig('RM;5;1\n1;FFFFFF;0;2;5;bad');

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.issues.map(({ line, field }) => ({ line, field })),
        ).toEqual([
            { line: 2, field: 'lista_eventos' },
            { line: 2, field: 'prazo' },
        ]);
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
