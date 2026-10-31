/**
 * Contract between main, preload and renderer for loading the configuration
 * file chosen by the user (#33). Types and constants only: this folder has
 * no runtime dependency, so every process can import it.
 */

/** IPC channel; it carries no arguments, so main reads only the chosen file. */
export const CONFIG_FILE_CHANNEL = 'config-file:open';

export type ConfigFileFailure =
    | 'not-found'
    | 'permission-denied'
    | 'is-directory'
    | 'not-utf8'
    | 'unknown';

/**
 * Outcome of one load. `canceled` is not an error (DEC-19, item 5); `failed`
 * is a read error, never a content error: path and reason, no line or field
 * (DEC-19, item 4; DEC-32).
 */
export type ConfigFileResult =
    | {
          readonly status: 'loaded';
          readonly path: string;
          readonly text: string;
      }
    | { readonly status: 'canceled' }
    | {
          readonly status: 'failed';
          readonly path: string;
          readonly reason: ConfigFileFailure;
          /** Full sentence ready for display (DEC-19, item 4; DEC-32). */
          readonly message: string;
      };

export interface ConfigFileApi {
    /** Opens the native dialog; takes no path, so it reaches only the chosen file. */
    openConfigFile(): Promise<ConfigFileResult>;
}
