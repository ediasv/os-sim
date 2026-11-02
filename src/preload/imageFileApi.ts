/**
 * Builds the only image-saving API the renderer receives (#39). The request
 * carries the SVG text but no path: the renderer reaches only the file the
 * user picks in main's save dialog. Kept apart from `preload.ts` so it runs
 * without Electron.
 */
import {
    IMAGE_FILE_CHANNEL,
    type ImageFileApi,
    type ImageFileResult,
} from '../shared/imageFile';

export function createImageFileApi(
    invoke: (channel: string, request: unknown) => Promise<unknown>,
): ImageFileApi {
    return {
        saveImageFile: (request) =>
            invoke(IMAGE_FILE_CHANNEL, {
                content: request.content,
            }) as Promise<ImageFileResult>,
    };
}
