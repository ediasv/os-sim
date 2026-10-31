/**
 * Decides whether an IPC message comes from the app's own page (Electron
 * security checklist: validate the sender of every IPC message). A frame
 * that navigated elsewhere, or an embedded third-party page, must not open
 * the dialog and receive file contents (DEC-33, item 1).
 */

/**
 * `appUrl` is the dev server URL, or the `file:` URL of the packaged
 * `index.html`. A dev server is trusted by origin, a packaged page only by
 * its exact file; query and hash are ignored in both cases.
 */
export function isAppUrl(senderUrl: string, appUrl: string): boolean {
    let sender: URL;
    let app: URL;
    try {
        sender = new URL(senderUrl);
        app = new URL(appUrl);
    } catch {
        return false;
    }
    if (app.protocol === 'file:') {
        return sender.protocol === 'file:' && sender.pathname === app.pathname;
    }
    return sender.origin === app.origin;
}
