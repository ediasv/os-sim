/**
 * Writes the exported Gantt image to the file the user chose and turns every
 * outcome into an `ImageFileResult` for the renderer (#39). It never throws:
 * a write failure becomes a message with path and reason (REQ-10), and
 * cancelling the dialog is not an error (FE-18). Mirrors `configFile.ts`.
 *
 * No size limit: the image comes from the whole history and has no ceiling
 * (A.2.4, FE-18). It imports only Electron types: `main.ts` passes the dialog
 * in, so this module runs under the Node test runner.
 */
import type { SaveDialogReturnValue } from 'electron';
import { writeFile } from 'node:fs/promises';
import {
    type ImageFileFailure,
    type ImageFileResult,
} from '../shared/imageFile';

export type WriteText = (filePath: string, text: string) => Promise<void>;
export type ShowSaveDialog = () => Promise<SaveDialogReturnValue>;

const WRITE_FAILURES = new Map<
    string,
    { reason: ImageFileFailure; detail: string }
>(
    Object.entries({
        ENOENT: {
            reason: 'not-found',
            detail: 'a pasta de destino não existe',
        },
        EACCES: { reason: 'permission-denied', detail: 'permissão negada' },
        EPERM: { reason: 'permission-denied', detail: 'permissão negada' },
        EISDIR: {
            reason: 'is-directory',
            detail: 'o caminho é um diretório, não um arquivo',
        },
        ENOSPC: { reason: 'no-space', detail: 'não há espaço livre no disco' },
        EROFS: {
            reason: 'read-only',
            detail: 'o destino é somente leitura',
        },
    }),
);

function failed(
    path: string,
    reason: ImageFileFailure,
    message: string,
): ImageFileResult {
    return { status: 'failed', path, reason, message };
}

/** Same trimming as `configFile.ts`: the path is already in the sentence. */
function systemReason(err: unknown): string {
    const message = err instanceof Error ? err.message.trim() : '';
    return (
        message.replace(/, \w+ '.*'$/, '').replace(/\.+$/, '') ||
        'erro desconhecido'
    );
}

const writeUtf8: WriteText = (filePath, text) =>
    writeFile(filePath, text, 'utf8');

export async function writeImageFile(
    filePath: string,
    content: string,
    write: WriteText = writeUtf8,
): Promise<ImageFileResult> {
    try {
        await write(filePath, content);
        return { status: 'saved', path: filePath };
    } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        const known =
            typeof code === 'string' ? WRITE_FAILURES.get(code) : undefined;
        if (known) {
            return failed(
                filePath,
                known.reason,
                `Não foi possível salvar o arquivo "${filePath}": ${known.detail}.`,
            );
        }
        return failed(
            filePath,
            'unknown',
            `Não foi possível salvar o arquivo "${filePath}": ${systemReason(err)}.`,
        );
    }
}

/** Cancelling, or a dialog that returns no path, is not an error. */
export async function saveImageFile(
    showDialog: ShowSaveDialog,
    content: string,
    write?: WriteText,
): Promise<ImageFileResult> {
    const { canceled, filePath } = await showDialog();
    if (canceled || filePath === undefined || filePath === '') {
        return { status: 'canceled' };
    }
    return writeImageFile(filePath, content, write);
}
