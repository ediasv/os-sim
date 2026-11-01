import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    MAX_CONFIG_BYTES,
    openConfigFile,
    readConfigFile,
    shareInFlight,
} from './configFile';

const VALID = 'RM;2;1\n1;ff0000;0;2;5;5\n';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'os-sim-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

async function fileWith(name: string, content: string | Uint8Array) {
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
}

const rejectWith =
    (code: string, message = 'x') =>
    () =>
        Promise.reject(Object.assign(new Error(message), { code }));

describe('readConfigFile', () => {
    it('loads UTF-8 text from a path with spaces and accents', async () => {
        await mkdir(join(dir, 'pasta ç'));
        const path = await fileWith(
            'pasta ç/config com espaço ação.txt',
            VALID,
        );

        expect(await readConfigFile(path)).toEqual({
            status: 'loaded',
            path,
            text: VALID,
        });
    });

    it('loads a file with a leading BOM, without the BOM', async () => {
        const bom = Buffer.from([0xef, 0xbb, 0xbf]);
        const path = await fileWith(
            'bom.txt',
            Buffer.concat([bom, Buffer.from(VALID)]),
        );

        expect(await readConfigFile(path)).toEqual({
            status: 'loaded',
            path,
            text: VALID,
        });
    });

    it('loads an empty file as empty text', async () => {
        const path = await fileWith('vazio.txt', '');

        expect(await readConfigFile(path)).toEqual({
            status: 'loaded',
            path,
            text: '',
        });
    });

    it('reports a missing file', async () => {
        const path = join(dir, 'nao-existe.txt');

        expect(await readConfigFile(path)).toEqual({
            status: 'failed',
            path,
            reason: 'not-found',
            message: `Não foi possível abrir o arquivo "${path}": o arquivo não foi encontrado.`,
        });
    });

    it('reports a directory', async () => {
        expect(await readConfigFile(dir)).toEqual({
            status: 'failed',
            path: dir,
            reason: 'is-directory',
            message: `Não foi possível abrir o arquivo "${dir}": o caminho é um diretório, não um arquivo.`,
        });
    });

    it.each(['EACCES', 'EPERM'])(
        'reports permission denied (%s)',
        async (code) => {
            const path = '/algum/arquivo.txt';

            expect(await readConfigFile(path, rejectWith(code))).toEqual({
                status: 'failed',
                path,
                reason: 'permission-denied',
                message: `Não foi possível abrir o arquivo "${path}": permissão negada.`,
            });
        },
    );

    it('rejects Latin-1 content as not UTF-8', async () => {
        const path = await fileWith(
            'latin1.txt',
            Buffer.from('RM;2;1\n1;ff0000;0;2;5;5;a\xe7\n', 'latin1'),
        );

        expect(await readConfigFile(path)).toEqual({
            status: 'failed',
            path,
            reason: 'not-utf8',
            message: `Não foi possível ler o arquivo "${path}": o conteúdo não está em UTF-8. Salve o arquivo como UTF-8 e tente novamente.`,
        });
    });

    it.each([
        ['with a BOM', '﻿RM;2;1\n'],
        ['without a BOM', 'RM;2;1\n'],
    ])('rejects UTF-16 content %s as not UTF-8', async (_, text) => {
        const path = await fileWith('utf16.txt', Buffer.from(text, 'utf16le'));

        expect(await readConfigFile(path)).toMatchObject({
            status: 'failed',
            reason: 'not-utf8',
        });
    });

    it('loads a file of exactly the size limit', async () => {
        const path = await fileWith(
            'limite.txt',
            Buffer.alloc(MAX_CONFIG_BYTES, 'a'),
        );

        expect(await readConfigFile(path)).toMatchObject({
            status: 'loaded',
        });
    });

    it('rejects a file above the size limit', async () => {
        const path = await fileWith(
            'grande.bin',
            Buffer.alloc(MAX_CONFIG_BYTES + 1, 'a'),
        );

        expect(await readConfigFile(path)).toEqual({
            status: 'failed',
            path,
            reason: 'too-large',
            message: `Não foi possível abrir o arquivo "${path}": o arquivo tem mais de 1 MiB e não parece ser uma configuração.`,
        });
    });

    it.each(['constructor', 'toString', '__proto__'])(
        'treats the inherited key %s as an unknown code',
        async (code) => {
            const path = '/algum/arquivo.txt';

            expect(
                await readConfigFile(path, rejectWith(code, 'falhou')),
            ).toEqual({
                status: 'failed',
                path,
                reason: 'unknown',
                message: `Não foi possível ler o arquivo "${path}": falhou.`,
            });
        },
    );

    it('drops the path that Node appends to the system reason', async () => {
        const path = '/algum/arquivo.txt';
        const read = rejectWith(
            'ELOOP',
            `ELOOP: too many symbolic links encountered, open '${path}'`,
        );

        expect(await readConfigFile(path, read)).toMatchObject({
            reason: 'unknown',
            message: `Não foi possível ler o arquivo "${path}": ELOOP: too many symbolic links encountered.`,
        });
    });

    it('reports other errors with the system reason', async () => {
        const path = '/algum/arquivo.txt';
        const read = rejectWith('EIO', 'EIO: i/o error, read.');

        expect(await readConfigFile(path, read)).toEqual({
            status: 'failed',
            path,
            reason: 'unknown',
            message: `Não foi possível ler o arquivo "${path}": EIO: i/o error, read.`,
        });
    });

    it('reports an error without message or code as unknown', async () => {
        const path = '/algum/arquivo.txt';

        expect(
            await readConfigFile(path, () => Promise.reject(new Error(''))),
        ).toEqual({
            status: 'failed',
            path,
            reason: 'unknown',
            message: `Não foi possível ler o arquivo "${path}": erro desconhecido.`,
        });
    });

    it('reports a thrown non-error as unknown', async () => {
        const path = '/algum/arquivo.txt';

        expect(await readConfigFile(path, () => Promise.reject(42))).toEqual({
            status: 'failed',
            path,
            reason: 'unknown',
            message: `Não foi possível ler o arquivo "${path}": erro desconhecido.`,
        });
    });
});

describe('openConfigFile', () => {
    it('returns canceled, without reading, when the dialog is canceled', async () => {
        const read = vi.fn();
        const dialog = () => Promise.resolve({ canceled: true, filePaths: [] });

        expect(await openConfigFile(dialog, read)).toEqual({
            status: 'canceled',
        });
        expect(read).not.toHaveBeenCalled();
    });

    it('returns canceled when the dialog returns no path', async () => {
        const dialog = () =>
            Promise.resolve({ canceled: false, filePaths: [] });

        expect(await openConfigFile(dialog)).toEqual({ status: 'canceled' });
    });

    it('reads the chosen path', async () => {
        const path = await fileWith('escolhido.txt', VALID);
        const dialog = () =>
            Promise.resolve({ canceled: false, filePaths: [path] });

        expect(await openConfigFile(dialog)).toEqual({
            status: 'loaded',
            path,
            text: VALID,
        });
    });

    it('reports a file removed after it was chosen', async () => {
        const path = join(dir, 'removido.txt');
        const dialog = () =>
            Promise.resolve({ canceled: false, filePaths: [path] });

        expect(await openConfigFile(dialog)).toMatchObject({
            status: 'failed',
            path,
            reason: 'not-found',
        });
    });
});

describe('shareInFlight', () => {
    it('shares the pending call and starts a new one after it settles', async () => {
        let resolve!: (value: number) => void;
        const task = vi.fn(
            () =>
                new Promise<number>((r) => {
                    resolve = r;
                }),
        );
        const shared = shareInFlight(task);

        const first = shared();
        const second = shared();
        expect(second).toBe(first);
        expect(task).toHaveBeenCalledTimes(1);

        resolve(1);
        expect(await first).toBe(1);

        const third = shared();
        expect(task).toHaveBeenCalledTimes(2);
        resolve(2);
        expect(await third).toBe(2);
    });

    it('starts a new call after the pending one rejects', async () => {
        const task = vi
            .fn<() => Promise<number>>()
            .mockRejectedValueOnce(new Error('falhou'))
            .mockResolvedValueOnce(3);
        const shared = shareInFlight(task);

        await expect(shared()).rejects.toThrow('falhou');
        expect(await shared()).toBe(3);
    });
});
