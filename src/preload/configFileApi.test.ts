import { describe, expect, it, vi } from 'vitest';
import { CONFIG_FILE_CHANNEL } from '../shared/configFile';
import { createConfigFileApi } from './configFileApi';

describe('createConfigFileApi', () => {
    it('invokes the config file channel with no arguments', async () => {
        const invoke = vi.fn().mockResolvedValue({ status: 'canceled' });

        await createConfigFileApi(invoke).openConfigFile();

        expect(invoke).toHaveBeenCalledExactlyOnceWith(CONFIG_FILE_CHANNEL);
    });

    it('ignores arguments passed by the renderer', async () => {
        const invoke = vi.fn().mockResolvedValue({ status: 'canceled' });
        const api = createConfigFileApi(invoke);

        await (api.openConfigFile as (...args: unknown[]) => unknown)(
            '/etc/passwd',
        );

        expect(invoke).toHaveBeenCalledExactlyOnceWith(CONFIG_FILE_CHANNEL);
    });

    it('exposes only openConfigFile', () => {
        const api = createConfigFileApi(vi.fn());

        expect(Object.keys(api)).toEqual(['openConfigFile']);
    });

    it("returns main's result unchanged", async () => {
        const loaded = { status: 'loaded', path: '/a b.txt', text: 'RM;2;1\n' };
        const api = createConfigFileApi(vi.fn().mockResolvedValue(loaded));

        expect(await api.openConfigFile()).toEqual(loaded);
    });
});
