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
            'an aperiodic',
            'RM;5;1\n1;FFFFFF;9007199254740990;1;0;5',
            'ingresso + prazo',
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
        const text = 'edf;3;4\n1;00000a;0;2;0;3;\n2;000002;1;1;4;2;A;B';
        const parsed = parseConfig(text);
        const core = parsed.ok ? validateConfig(parsed.config) : null;
        const loaded = loadConfig(text);

        expect(core?.ok && loaded.ok).toBe(true);
        if (!core?.ok || !loaded.ok) return;
        expect(loaded.config).toEqual(core.config);
    });
});
