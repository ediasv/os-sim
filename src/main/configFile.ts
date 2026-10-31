/**
 * Reads the configuration file chosen by the user and turns every outcome
 * into a `ConfigFileResult` for the renderer (#33). It never throws: a read
 * failure becomes a message with path and reason, never a content error
 * (DEC-19, item 4). The content must be valid UTF-8 (DEC-32).
 *
 * It does not import Electron: `main.ts` passes the dialog in, so this
 * module runs under the Node test runner.
 */
import { readFile } from 'node:fs/promises';
import type { ConfigFileFailure, ConfigFileResult } from '../shared/configFile';

export type ReadBytes = (filePath: string) => Promise<Uint8Array>;
export type ShowOpenDialog = () => Promise<{
    canceled: boolean;
    filePaths: string[];
}>;

const OPEN_FAILURES: Readonly<
    Record<string, { reason: ConfigFileFailure; detail: string }>
> = {
    ENOENT: { reason: 'not-found', detail: 'o arquivo não foi encontrado' },
    EACCES: { reason: 'permission-denied', detail: 'permissão negada' },
    EPERM: { reason: 'permission-denied', detail: 'permissão negada' },
    EISDIR: {
        reason: 'is-directory',
        detail: 'o caminho é um diretório, não um arquivo',
    },
};

// The default `ignoreBOM: false` drops a leading BOM, which DEC-20 accepts.
const utf8 = new TextDecoder('utf-8', { fatal: true });

function failed(
    path: string,
    reason: ConfigFileFailure,
    message: string,
): ConfigFileResult {
    return { status: 'failed', path, reason, message };
}

function systemReason(err: unknown): string {
    const message = err instanceof Error ? err.message.trim() : '';
    return message.replace(/\.+$/, '') || 'erro desconhecido';
}

export async function readConfigFile(
    filePath: string,
    read: ReadBytes = readFile,
): Promise<ConfigFileResult> {
    let bytes: Uint8Array;
    try {
        bytes = await read(filePath);
    } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        const known =
            typeof code === 'string' ? OPEN_FAILURES[code] : undefined;
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
        return { status: 'loaded', path: filePath, text: utf8.decode(bytes) };
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
