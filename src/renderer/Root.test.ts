// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick, type App } from 'vue';
import { dismissError, reportError } from './errors';
import Root from './Root.vue';

vi.mock('./App.vue', () => ({
    default: defineComponent({
        setup() {
            throw new Error('Workspace setup failed');
        },
    }),
}));

let app: App | undefined;

beforeEach(() => {
    dismissError();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    app?.unmount();
    app = undefined;
    dismissError();
    vi.restoreAllMocks();
});

describe('Root', () => {
    // createApp as in renderer.ts: @vue/test-utils rethrows errors from mount.
    it('shows and dismisses the banner when App throws in setup()', async () => {
        const el = document.createElement('div');
        app = createApp(Root);
        app.config.errorHandler = (err) => reportError(err);
        app.mount(el);
        await nextTick();

        expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            'Workspace setup failed',
        );

        el.querySelector<HTMLButtonElement>(
            'button[aria-label="Fechar mensagem de erro"]',
        )?.click();
        await nextTick();

        expect(el.querySelector('[role="alert"]')).toBeNull();
    });
});
