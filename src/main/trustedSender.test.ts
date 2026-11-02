import { describe, expect, it } from 'vitest';
import { isAppUrl } from './trustedSender';

describe('isAppUrl', () => {
    const dev = 'http://localhost:5173';
    const packaged = 'file:///app/renderer/main_window/index.html';

    it.each([
        ['the dev server root', 'http://localhost:5173/', dev],
        ['a dev server route with hash', 'http://localhost:5173/x#y', dev],
        ['the packaged page', packaged, packaged],
        ['the packaged page with hash', `${packaged}#y`, packaged],
    ])('trusts %s', (_, sender, app) => {
        expect(isAppUrl(sender, app)).toBe(true);
    });

    it.each([
        ['another dev port', 'http://localhost:5174/', dev],
        ['another host', 'https://example.com/', dev],
        ['a file page on the dev server', packaged, dev],
        ['another local file', 'file:///tmp/evil.html', packaged],
        ['a remote page when packaged', 'https://example.com/', packaged],
        ['an empty URL', '', packaged],
        ['about:blank', 'about:blank', dev],
    ])('rejects %s', (_, sender, app) => {
        expect(isAppUrl(sender, app)).toBe(false);
    });
});
