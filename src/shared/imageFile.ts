/**
 * Contract between main, preload and renderer for saving the exported Gantt
 * image (#39). Types and constants only: this folder has no runtime
 * dependency, so every process can import it.
 */

/** IPC channel; the payload is an `ImageFileRequest`. */
export const IMAGE_FILE_CHANNEL = 'image-file:save';

/** Name the save dialog suggests; the user may change it. */
export const DEFAULT_IMAGE_FILE_NAME = 'gantt.svg';

export interface ImageFileRequest {
    /** Complete SVG text; main writes it as UTF-8 and never inspects it. */
    readonly content: string;
}

export type ImageFileFailure =
    | 'not-found'
    | 'permission-denied'
    | 'is-directory'
    | 'no-space'
    | 'read-only'
    | 'unknown';

/**
 * Outcome of one save. `canceled` is not an error (FE-18); `failed` carries
 * the path and the reason (REQ-10).
 */
export type ImageFileResult =
    | { readonly status: 'saved'; readonly path: string }
    | { readonly status: 'canceled' }
    | {
          readonly status: 'failed';
          readonly path: string;
          readonly reason: ImageFileFailure;
          /** Full sentence ready for display (REQ-10). */
          readonly message: string;
      };

export interface ImageFileApi {
    /** Opens the native save dialog; the renderer never names the path. */
    saveImageFile(request: ImageFileRequest): Promise<ImageFileResult>;
}
