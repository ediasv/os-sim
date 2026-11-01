/**
 * Reads the configuration file chosen by the user and turns every outcome
 * into a `ConfigFileResult` for the renderer (#33). It never throws: a read
 * failure becomes a message with path and reason, never a content error
 * (DEC-19, item 4). The content must be valid UTF-8 (DEC-32).
 *
 * It imports only Electron types: `main.ts` passes the dialog in, so this
 * module runs under the Node test runner.
 */
import type { OpenDialogReturnValue } from 'electron';
import { open } from 'node:fs/promises';
import type { ConfigFileFailure, ConfigFileResult } from '../shared/configFile';

export type ReadBytes = (filePath: string) => Promise<Uint8Array>;
export type ShowOpenDialog = () => Promise<OpenDialogReturnValue>;

/**
 * A realistic configuration has a few dozen short lines; the limit only
 * stops an accidental pick of a large file (a video, an image) from being
 * read whole into main and sent over IPC (DEC-33, item 4).
 */
export const MAX_CONFIG_BYTES = 1024 * 1024;

const OPEN_FAILURES = new Map<
    string,
    { reason: ConfigFileFailure; detail: string }
>(
    Object.entries({
        ENOENT: { reason: 'not-found', detail: 'o arquivo não foi encontrado' },
        EACCES: { reason: 'permission-denied', detail: 'permissão negada' },
        EPERM: { reason: 'permission-denied', detail: 'permissão negada' },
        EISDIR: {
            reason: 'is-directory',
            detail: 'o caminho é um diretório, não um arquivo',
        },
        EFBIG: {
            reason: 'too-large',
            detail: `o arquivo tem mais de ${MAX_CONFIG_BYTES / 1024 / 1024} MiB e não parece ser uma configuração`,
        },
    }),
);

// The default `ignoreBOM: false` drops a leading BOM, which DEC-20 accepts.
const utf8 = new TextDecoder('utf-8', { fatal: true });

function failed(
    path: string,
    reason: ConfigFileFailure,
    message: string,
): ConfigFileResult {
    return { status: 'failed', path, reason, message };
}

/**
 * Node messages end in `, <syscall> '<path>'`; the path is already in the
 * sentence, so the suffix is dropped to avoid repeating it.
 */
function systemReason(err: unknown): string {
    const message = err instanceof Error ? err.message.trim() : '';
    return (
        message.replace(/, \w+ '.*'$/, '').replace(/\.+$/, '') ||
        'erro desconhecido'
    );
}

/** Reads the whole file, refusing (`EFBIG`) one above `MAX_CONFIG_BYTES`. */
async function readLimited(filePath: string): Promise<Uint8Array> {
    const handle = await open(filePath, 'r');
    try {
        const stats = await handle.stat();
        if (stats.isFile() && stats.size > MAX_CONFIG_BYTES) {
            throw Object.assign(new Error('file too large'), {
                code: 'EFBIG',
            });
        }
        return await handle.readFile();
    } finally {
        await handle.close();
    }
}

/**
 * UTF-16 text without a BOM (`R\0M\0...`) is valid UTF-8 byte by byte;
 * a NUL never appears in a configuration, so it marks the file as not
 * UTF-8 text (DEC-32, item 2).
 */
function decodeUtf8(bytes: Uint8Array): string {
    if (bytes.includes(0)) {
        throw new TypeError('NUL byte');
    }
    return utf8.decode(bytes);
}

export async function readConfigFile(
    filePath: string,
    read: ReadBytes = readLimited,
): Promise<ConfigFileResult> {
    let bytes: Uint8Array;
    try {
        bytes = await read(filePath);
    } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        const known =
            typeof code === 'string' ? OPEN_FAILURES.get(code) : undefined;
        if (known) {
            return failed(
                filePath,
                known.reason,
                `Não foi possível abrir o arquivo "${filePath}": ${known.detail}.`,
            );
        }
        return failed(
            filePath,
            'unknown',
            `Não foi possível ler o arquivo "${filePath}": ${systemReason(err)}.`,
        );
    }
    try {
        return { status: 'loaded', path: filePath, text: decodeUtf8(bytes) };
    } catch {
        return failed(
            filePath,
            'not-utf8',
            `Não foi possível ler o arquivo "${filePath}": o conteúdo não está em UTF-8. Salve o arquivo como UTF-8 e tente novamente.`,
        );
    }
}

/** Cancelling, or a dialog that returns no path, is not an error (DEC-19, item 5). */
export async function openConfigFile(
    showDialog: ShowOpenDialog,
    read?: ReadBytes,
): Promise<ConfigFileResult> {
    const { canceled, filePaths } = await showDialog();
    const [filePath] = filePaths;
    if (canceled || filePath === undefined) {
        return { status: 'canceled' };
    }
    return readConfigFile(filePath, read);
}

/**
 * Shares the pending call instead of starting another: a second request
 * while the dialog is open gets the same result, so two dialogs never race
 * and an older answer never overrides the file picked last.
 */
export function shareInFlight<T>(task: () => Promise<T>): () => Promise<T> {
    let pending: Promise<T> | undefined;
    return () => {
        pending ??= task().finally(() => {
            pending = undefined;
        });
        return pending;
    };
}
