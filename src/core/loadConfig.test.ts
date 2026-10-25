import { describe, expect, it } from 'vitest';
import { validateConfig } from './config';
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
        [
            'a last deadline beyond the exact integer range',
            'RM;5;1\n1;FFFFFF;0;1;2000000000000000;1',
            { line: 2, field: 'prazo', value: '1' },
            'O prazo da última ativação (ingresso + 9 × periodo + prazo) ultrapassa o maior inteiro exato suportado (9007199254740991).',
        ],
    ])('reports %s', (_name, text, expected, coreMessage) => {
        const issues = issuesOf(text);

        expect(issues.map(where)).toEqual([expected]);
        expect(issues[0].message).toBe(
            `Linha ${expected.line}, campo ${expected.field} (valor ${expected.value}): ${coreMessage}`,
        );
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
    });

    it('reports syntax errors together with core problems of the other lines', () => {
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
            { line: 4, field: 'cor', value: 'FFFFFF' },
            { line: 5, field: 'cor', value: 'GGG' },
        ]);
        expect(issues[0].message).toBe(
            'Linha 2, campo ingresso, valor "x": esperado um número.',
        );
    });

    it('keeps each core problem on its own line when another task was skipped', () => {
        const issues = issuesOf(
            [
                'RM;5;1',
                '1;FFFFFF;x;1;0;1',
                '2;000000;0;1;0;1',
                '3;111111;0;0;0;1',
            ].join('\n'),
        );

        expect(issues.map(where)).toEqual([
            { line: 2, field: 'ingresso', value: 'x' },
            { line: 4, field: 'duracao', value: '0' },
        ]);
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

        // The context ends at the first "): "; what follows is the core text.
        const messages = issuesOf(text).map(({ message }) =>
            message.slice(message.indexOf('): ') + 3),
        );

        expect(messages).toEqual(core.issues.map(({ message }) => message));
    });

    it('returns the configuration the core validated for a valid file', () => {
        const text = 'edf;3;4\n1;00000a;0;2;0;3;\n2;000002;1;1;4;2;A;B';
        const parsed = parseConfig(text);
        const core = parsed.ok ? validateConfig(parsed.config) : null;
        const loaded = loadConfig(text);

        expect(core?.ok && loaded.ok).toBe(true);
        if (!core?.ok || !loaded.ok) return;
        expect(loaded.config).toEqual(core.config);
    });
});
