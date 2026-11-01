import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveImageFile, withSvgExtension, writeImageFile } from './imageFile';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'os-sim-img-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

const rejectWith =
    (code: string, message = 'x') =>
    () =>
        Promise.reject(Object.assign(new Error(message), { code }));

describe('writeImageFile', () => {
    it('writes the whole text as UTF-8 and reports the path', async () => {
        const path = join(dir, 'gantt ç.svg');
        const content = '<svg>' + 'á'.repeat(2_000_000) + '</svg>';

        const result = await writeImageFile(path, content);

        expect(result).toEqual({ status: 'saved', path });
        expect(await readFile(path, 'utf8')).toBe(content);
    });

    it.each([
        ['ENOENT', 'not-found', 'a pasta de destino não existe'],
        ['EACCES', 'permission-denied', 'permissão negada'],
        ['EPERM', 'permission-denied', 'permissão negada'],
        ['EISDIR', 'is-directory', 'diretório'],
        ['ENOSPC', 'no-space', 'espaço'],
        ['EROFS', 'read-only', 'somente leitura'],
    ])('explains %s as %s', async (code, reason, detail) => {
        const result = await writeImageFile(
            '/x/a.svg',
            '<svg/>',
            rejectWith(code),
        );

        expect(result).toMatchObject({
            status: 'failed',
            path: '/x/a.svg',
            reason,
        });
        if (result.status !== 'failed') throw new Error('unreachable');
        expect(result.message).toContain('"/x/a.svg"');
        expect(result.message).toContain(detail);
    });

    it('reports an unknown error with its system message, without the path suffix', async () => {
        const result = await writeImageFile(
            '/x/a.svg',
            '<svg/>',
            rejectWith('EBUSY', "resource busy, open '/x/a.svg'"),
        );

        expect(result).toMatchObject({ status: 'failed', reason: 'unknown' });
        if (result.status !== 'failed') throw new Error('unreachable');
        expect(result.message).toBe(
            'Não foi possível salvar o arquivo "/x/a.svg": resource busy.',
        );
    });

    it('fails for real when the folder does not exist', async () => {
        const result = await writeImageFile(
            join(dir, 'nope', 'a.svg'),
            '<svg/>',
        );

        expect(result).toMatchObject({ status: 'failed', reason: 'not-found' });
    });

    it('fails for real when the target is a directory', async () => {
        const target = join(dir, 'pasta');
        await mkdir(target);

        const result = await writeImageFile(target, '<svg/>');

        expect(result.status).toBe('failed');
    });

    it('leaves an existing file untouched when the write is refused', async () => {
        const path = join(dir, 'a.svg');
        await writeFile(path, 'old');

        const result = await writeImageFile(
            path,
            'new',
            vi.fn(rejectWith('EACCES')),
        );

        expect(result).toMatchObject({ reason: 'permission-denied' });
        expect(await readFile(path, 'utf8')).toBe('old');
    });
});

describe('saveImageFile', () => {
    it('writes to the path the dialog returns', async () => {
        const write = vi.fn().mockResolvedValue(undefined);

        const result = await saveImageFile(
            () => Promise.resolve({ canceled: false, filePath: '/o/g.svg' }),
            '<svg/>',
            write,
        );

        expect(result).toEqual({ status: 'saved', path: '/o/g.svg' });
        expect(write).toHaveBeenCalledExactlyOnceWith('/o/g.svg', '<svg/>');
    });

    it.each([
        { canceled: true, filePath: '/o/g.svg' },
        { canceled: false, filePath: '' },
    ])('treats %o as cancel and writes nothing', async (dialog) => {
        const write = vi.fn();

        const result = await saveImageFile(
            () => Promise.resolve(dialog),
            '<svg/>',
            write,
        );

        expect(result).toEqual({ status: 'canceled' });
        expect(write).not.toHaveBeenCalled();
    });
});

describe('withSvgExtension', () => {
    it.each([
        ['/o/gantt', '/o/gantt.svg'],
        ['/pasta.x/gantt', '/pasta.x/gantt.svg'],
        ['/o/gantt.svg', '/o/gantt.svg'],
        ['/o/gantt.png', '/o/gantt.png'],
    ])('%s -> %s', (typed, saved) => {
        expect(withSvgExtension(typed)).toBe(saved);
    });

    it('saveImageFile writes to the path with the extension', async () => {
        const write = vi.fn().mockResolvedValue(undefined);

        const result = await saveImageFile(
            () => Promise.resolve({ canceled: false, filePath: '/o/gantt' }),
            '<svg/>',
            write,
        );

        expect(result).toEqual({ status: 'saved', path: '/o/gantt.svg' });
        expect(write).toHaveBeenCalledWith('/o/gantt.svg', '<svg/>');
    });
});
