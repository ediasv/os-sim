/**
 * End to end for REQ-06 (#34): a file on disk goes through `readConfigFile`
 * and `loadConfig` and ends as a configuration or a diagnostic. A read
 * failure is never confused with a content error (DEC-19, item 4).
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemConfig } from '../core/domain';
import { loadConfig, type ConfigLoadResult } from '../core/loadConfig';
import type { ConfigFileResult } from '../shared/configFile';
import { MAX_CONFIG_BYTES, openConfigFile, readConfigFile } from './configFile';

const CANONICAL = 'EDF;3;2\n1;ABCDEF;0;2;5;7\n2;00FF00;1;1;4;4;ML1:3;MU1:4\n';

const EXPECTED: SystemConfig = {
    algorithm: 'EDF',
    quantum: 3,
    cpuCount: 2,
    tasks: [
        {
            id: 1,
            color: 'ABCDEF',
            arrival: 0,
            duration: 2,
            period: 5,
            deadline: 7,
            rawEvents: '',
        },
        {
            id: 2,
            color: '00FF00',
            arrival: 1,
            duration: 1,
            period: 4,
            deadline: 4,
            rawEvents: 'ML1:3;MU1:4',
        },
    ],
};

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'os-sim-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

/** Writes `content` under the per-test directory, creating parent folders. */
async function fileWith(name: string, content: string | Uint8Array) {
    const path = join(dir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    return path;
}

/**
 * Reads the file and, only when it was read, loads its text. This mirrors
 * what the renderer will do in #36.
 */
async function loadFromDisk(
    path: string,
): Promise<{ read: ConfigFileResult; load: ConfigLoadResult | null }> {
    const read = await readConfigFile(path);
    const load = read.status === 'loaded' ? loadConfig(read.text) : null;
    return { read, load };
}

const bom = Buffer.from([0xef, 0xbb, 0xbf]);

describe('valid files from disk', () => {
    it.each<[string, string | Uint8Array]>([
        ['canonical', CANONICAL],
        [
            'lowercase and mixed case',
            'edf;3;2\n1;abcdef;0;2;5;7\n2;00fF00;1;1;4;4;ML1:3;MU1:4',
        ],
        [
            'spaces and tabs around fields',
            '\t EdF ; 3 ;\t2 \n 1 ; abcdef ;0; 2;5 ;7\n2;00FF00 ;1;1;4;4; ML1:3;MU1:4 ',
        ],
        [
            'blank lines before, between and after',
            '\n\n  \nEDF;3;2\n\n1;ABCDEF;0;2;5;7\n \n2;00FF00;1;1;4;4;ML1:3;MU1:4\n\n',
        ],
        [
            'final semicolon on every line',
            'EDF;3;2;\n1;ABCDEF;0;2;5;7;\n2;00FF00;1;1;4;4;ML1:3;MU1:4;',
        ],
        [
            'empty event list with ;;',
            CANONICAL.replace('1;ABCDEF;0;2;5;7', '1;ABCDEF;0;2;5;7;;'),
        ],
        ['CRLF', CANONICAL.replaceAll('\n', '\r\n')],
        ['CR only', CANONICAL.replaceAll('\n', '\r')],
        ['UTF-8 BOM', Buffer.concat([bom, Buffer.from(CANONICAL)])],
    ])('loads %s as the same configuration', async (_label, content) => {
        const path = await fileWith('config.txt', content);

        const { read, load } = await loadFromDisk(path);

        expect(read.status).toBe('loaded');
        expect(load?.ok).toBe(true);
        if (!load?.ok) return;
        expect(load.config).toEqual(EXPECTED);
        expect(load.warnings).toEqual([]);
    });

    it('loads a task without period as the default period, with a warning', async () => {
        const path = await fileWith(
            'config.txt',
            CANONICAL.replace('1;ABCDEF;0;2;5;7', '1;ABCDEF;0;2;;7'),
        );

        const { load } = await loadFromDisk(path);

        expect(load?.ok).toBe(true);
        if (!load?.ok) return;
        expect(load.config.tasks[0].period).toBe(15);
        expect(load.warnings).toHaveLength(1);
        expect(load.warnings[0]).toMatchObject({
            line: 2,
            field: 'periodo',
            value: null,
            origin: 'default-period',
            taskId: 1,
            message:
                'Linha 2, campo periodo: toda tarefa precisa de período maior que zero; a tarefa 1 usará o período padrão de 15 ticks.',
        });
    });

    it('keeps an event list with content exactly as written', async () => {
        const path = await fileWith(
            'config.txt',
            CANONICAL.replace('ML1:3;MU1:4', 'ML1:3 ; MU1:4;E:  x'),
        );

        const { load } = await loadFromDisk(path);

        expect(load?.ok).toBe(true);
        if (!load?.ok) return;
        expect(load.config.tasks[1].rawEvents).toBe('ML1:3 ; MU1:4;E:  x');
    });
});

describe('invalid files from disk', () => {
    const COUNT_HEADER =
        'esperados 3 campos (formato: algoritmo_escalonamento;quantum;qtde_cpus)';
    const COUNT_TASK =
        'esperados 6 campos antes da lista_eventos opcional (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos)';
    const BLANKS = '\n\n';

    type Expected = {
        line: number;
        field: string;
        value: string | null;
        origin: 'syntax' | 'core';
    };

    it.each<[string, string, Expected, string]>([
        // Syntax (DEC-19 / #29). Two blank lines shift every line number.
        [
            'header missing',
            `${BLANKS}1;FFFFFF;0;1;0;1`,
            { line: 1, field: 'cabecalho', value: null, origin: 'syntax' },
            'Linha 1, campo cabecalho, valor ausente: cabeçalho ausente (formato: algoritmo_escalonamento;quantum;qtde_cpus).',
        ],
        [
            'header extra field',
            `${BLANKS}RM;5;1;x\n1;FFFFFF;0;1;0;1`,
            {
                line: 3,
                field: 'cabecalho',
                value: 'RM;5;1;x',
                origin: 'syntax',
            },
            'Linha 3, campo cabecalho, valor "RM;5;1;x": esperados 3 campos no cabeçalho (formato: algoritmo_escalonamento;quantum;qtde_cpus) e recebidos 4.',
        ],
        [
            'header short',
            `${BLANKS}RM;5\n1;FFFFFF;0;1;0;1`,
            { line: 3, field: 'qtde_cpus', value: null, origin: 'syntax' },
            `Linha 3, campo qtde_cpus, valor ausente: campo obrigatório ausente; ${COUNT_HEADER} e recebidos 2.`,
        ],
        [
            'task short',
            `${BLANKS}RM;5;1\n1;FFFFFF;0;1;0`,
            { line: 4, field: 'prazo', value: null, origin: 'syntax' },
            `Linha 4, campo prazo, valor ausente: campo obrigatório ausente; ${COUNT_TASK} e recebidos 5.`,
        ],
        [
            'required field empty',
            `${BLANKS}RM;5;1\n1;FFFFFF;0;;0;1`,
            { line: 4, field: 'duracao', value: null, origin: 'syntax' },
            'Linha 4, campo duracao, valor ausente: campo obrigatório ausente.',
        ],
        [
            'not a number',
            `${BLANKS}RM;5;1\n1;FFFFFF;x;1;0;1`,
            { line: 4, field: 'ingresso', value: 'x', origin: 'syntax' },
            'Linha 4, campo ingresso, valor "x": esperado um número.',
        ],
        [
            'non-decimal numeral',
            `${BLANKS}RM;5;1\n1;FFFFFF;0x10;1;0;1`,
            { line: 4, field: 'ingresso', value: '0x10', origin: 'syntax' },
            'Linha 4, campo ingresso, valor "0x10": esperado um número.',
        ],
        [
            'no task line',
            `${BLANKS}RM;5;1`,
            { line: 4, field: 'tarefa', value: null, origin: 'syntax' },
            'Linha 4, campo tarefa, valor ausente: nenhuma linha de tarefa encontrada; esperada pelo menos uma (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos).',
        ],
        [
            'CR-only line endings with blank lines before the error',
            'RM;5;1\r\r1;FFFFFF;x;1;0;1',
            { line: 3, field: 'ingresso', value: 'x', origin: 'syntax' },
            'Linha 3, campo ingresso, valor "x": esperado um número.',
        ],
        // Core (DEC-10), one per rule.
        [
            'unknown algorithm',
            'XX;5;1\n1;FFFFFF;0;1;0;1',
            {
                line: 1,
                field: 'algoritmo_escalonamento',
                value: 'XX',
                origin: 'core',
            },
            'Linha 1, campo algoritmo_escalonamento (valor XX): O campo algoritmo_escalonamento deve ser RM ou EDF; valor recebido: "XX".',
        ],
        [
            'quantum below the minimum',
            'RM;0;1\n1;FFFFFF;0;1;0;1',
            { line: 1, field: 'quantum', value: '0', origin: 'core' },
            'Linha 1, campo quantum (valor 0): O campo quantum deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
        ],
        [
            'non-integer value written with decimals',
            'RM;5;1\n1;FFFFFF;0;2.50;0;1',
            { line: 2, field: 'duracao', value: '2.50', origin: 'core' },
            'Linha 2, campo duracao (valor 2.50): O campo duracao deve ser um número inteiro maior ou igual a 1; valor recebido: 2.5.',
        ],
        [
            'duplicate id',
            'RM;5;1\n1;FFFFFF;0;1;0;1\n\n1;000000;0;1;0;1',
            { line: 4, field: 'id', value: '1', origin: 'core' },
            'Linha 4, campo id (valor 1): O id 1 já foi usado pela 1ª tarefa; cada tarefa precisa de um id único.',
        ],
        [
            'color format',
            'RM;5;1\n1;#FFFFFF;0;1;0;1',
            { line: 2, field: 'cor', value: '#FFFFFF', origin: 'core' },
            'Linha 2, campo cor (valor #FFFFFF): O campo cor deve ter 6 dígitos hexadecimais RGB, sem "#" (por exemplo F0E0D0); valor recebido: "#FFFFFF".',
        ],
        [
            'duplicate color across case',
            'RM;5;1\n1;abcdef;0;1;0;1\n2;ABCDEF;0;1;0;1',
            { line: 3, field: 'cor', value: 'ABCDEF', origin: 'core' },
            'Linha 3, campo cor (valor ABCDEF): A cor ABCDEF já foi usada pela 1ª tarefa; cada tarefa precisa de uma cor diferente.',
        ],
        [
            'last deadline beyond the exact range',
            'RM;5;1\n1;FFFFFF;9007199254740990;1;0;5',
            { line: 2, field: 'prazo', value: null, origin: 'core' },
            'Linha 2, campo prazo: O prazo da última ativação (ingresso + 9 × periodo + prazo) ultrapassa o maior inteiro exato suportado (9007199254740991).',
        ],
    ])('reports %s', async (_label, text, expected, message) => {
        const path = await fileWith('config.txt', text);

        const { read, load } = await loadFromDisk(path);

        expect(read.status).toBe('loaded');
        expect(load?.ok).toBe(false);
        if (!load || load.ok) return;
        expect(load.issues).toHaveLength(1);
        expect(load.issues[0]).toMatchObject(expected);
        expect(load.issues[0].message).toBe(message);
    });

    it('reports every error of a file at once, in file order', async () => {
        const path = await fileWith(
            'config.txt',
            'RM;5;1\n1;FFFFFF;x;1;0;1\n2;000000;0;1;0;1\n3;111111;0;1;0;1\n4;222222;0;y;0;1\n',
        );

        const { load } = await loadFromDisk(path);

        expect(load?.ok).toBe(false);
        if (!load || load.ok) return;
        expect(
            load.issues.map(({ line, field, value }) => ({
                line,
                field,
                value,
            })),
        ).toEqual([
            { line: 2, field: 'ingresso', value: 'x' },
            { line: 5, field: 'duracao', value: 'y' },
        ]);
    });
});

describe('read failures and cancel', () => {
    it('reports a missing file as not-found, without a content diagnostic', async () => {
        const { read, load } = await loadFromDisk(join(dir, 'nao-existe.txt'));

        expect(read).toMatchObject({ status: 'failed', reason: 'not-found' });
        expect(load).toBeNull();
    });

    it('reports a directory as is-directory, without a content diagnostic', async () => {
        const { read, load } = await loadFromDisk(dir);

        expect(read).toMatchObject({
            status: 'failed',
            reason: 'is-directory',
        });
        expect(load).toBeNull();
    });

    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
        'reports a file without read permission as permission-denied',
        async () => {
            const path = await fileWith('sem-permissao.txt', CANONICAL);
            await chmod(path, 0o000);
            try {
                const { read, load } = await loadFromDisk(path);

                expect(read).toEqual({
                    status: 'failed',
                    path,
                    reason: 'permission-denied',
                    message: `Não foi possível abrir o arquivo "${path}": permissão negada.`,
                });
                expect(load).toBeNull();
            } finally {
                await chmod(path, 0o600);
            }
        },
    );

    it.each<[string, Uint8Array]>([
        [
            'Latin-1 text',
            Buffer.from('EDF;3;2\n1;ABCDEF;0;2;5;7;a\xe7\n', 'latin1'),
        ],
        ['binary bytes', Uint8Array.from([0x52, 0x4d, 0x00, 0xff])],
        // Valid UTF-8 byte by byte, so only the NUL check rejects it.
        ['UTF-16 text without a BOM', Buffer.from(CANONICAL, 'utf16le')],
    ])('reports %s as not-utf8', async (_label, bytes) => {
        const path = await fileWith('ilegivel.txt', bytes);

        const { read, load } = await loadFromDisk(path);

        expect(read).toMatchObject({ status: 'failed', reason: 'not-utf8' });
        expect(load).toBeNull();
    });

    it('reports a file above the size limit as too-large', async () => {
        const path = await fileWith(
            'grande.txt',
            Buffer.alloc(MAX_CONFIG_BYTES + 1, 'a'),
        );

        const { read, load } = await loadFromDisk(path);

        expect(read).toMatchObject({ status: 'failed', reason: 'too-large' });
        expect(load).toBeNull();
    });

    it.each(['', '  \n\n'])(
        'treats an empty file (%j) as a content error, not a read error',
        async (content) => {
            const path = await fileWith('vazio.txt', content);

            const { read, load } = await loadFromDisk(path);

            expect(read.status).toBe('loaded');
            expect(load?.ok).toBe(false);
            if (!load || load.ok) return;
            expect(load.issues.map((issue) => issue.field)).toEqual([
                'cabecalho',
                'tarefa',
            ]);
        },
    );

    it('returns canceled without reading, so there is no diagnostic of either kind', async () => {
        const read = vi.fn();

        const result = await openConfigFile(
            () => Promise.resolve({ canceled: true, filePaths: [] }),
            read,
        );

        expect(result).toEqual({ status: 'canceled' });
        expect(read).not.toHaveBeenCalled();
    });
});
