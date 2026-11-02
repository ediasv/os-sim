/**
 * Builds the only file API the renderer receives (#33). It invokes the
 * channel without arguments: the renderer cannot name a path, so it reaches
 * only the file the user picks in main's dialog. Kept apart from
 * `preload.ts` so it runs without Electron.
 */
import {
    CONFIG_FILE_CHANNEL,
    type ConfigFileApi,
    type ConfigFileResult,
} from '../shared/configFile';

export function createConfigFileApi(
    invoke: (channel: string) => Promise<unknown>,
): ConfigFileApi {
    return {
        openConfigFile: () =>
            invoke(CONFIG_FILE_CHANNEL) as Promise<ConfigFileResult>,
    };
}
