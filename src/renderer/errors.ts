import { shallowRef, type App } from 'vue';
import { ConfigValidationError, type ConfigIssue } from '../core/config';
import { SimulationRefusal } from '../core/refusal';

/** Latest uncaught error, as display text. `null` when nothing to show. */
export const currentError = shallowRef<string | null>(null);

export function describeError(err: unknown): string {
    if (err instanceof Error) {
        return err.message || err.name || 'Unknown error';
    }
    if (typeof err === 'string') {
        return err || 'Unknown error';
    }
    if (err !== null && typeof err === 'object') {
        try {
            // toJSON() can make stringify return undefined despite its type.
            return JSON.stringify(err) ?? 'Unknown error';
        } catch {
            return 'Unknown error';
        }
    }
    if (err === undefined || err === null) {
        return 'Unknown error';
    }
    return String(err);
}

export function reportError(err: unknown): void {
    // Vue skips its own console logging once a custom errorHandler is set.
    console.error(err);
    // Keep the first error: later ones are often fallout from it, e.g. a
    // render error after setup() threw. The console has all of them.
    if (currentError.value === null) {
        currentError.value = describeError(err);
    }
}

export function dismissError(): void {
    currentError.value = null;
}

/**
 * Why a command failed (DEC-24). `config` is correctable by the user and
 * keeps the issues for display next to the fields; `refused` is a request
 * the current step cannot honour, such as going back from step 0, shown
 * where the user acted (DEC-36); `unexpected` is a bug.
 */
export type AppError =
    | {
          readonly kind: 'config';
          readonly message: string;
          readonly issues: readonly ConfigIssue[];
      }
    | { readonly kind: 'refused'; readonly message: string }
    | { readonly kind: 'unexpected'; readonly message: string };

/** Outcome of an adapter command; a failure leaves the state unchanged (DEC-24). */
export type CommandResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly error: AppError };

/**
 * Turns an error caught by a command into its result (DEC-24). Correctable
 * errors go only to the caller, which shows them where the user acted;
 * unexpected ones also reach the banner, which stays reserved for bugs.
 */
export function commandFailure(err: unknown): CommandResult {
    if (err instanceof ConfigValidationError) {
        return {
            ok: false,
            error: { kind: 'config', message: err.message, issues: err.issues },
        };
    }
    if (err instanceof SimulationRefusal) {
        return { ok: false, error: { kind: 'refused', message: err.message } };
    }
    reportError(err);
    return {
        ok: false,
        error: { kind: 'unexpected', message: describeError(err) },
    };
}

export function installErrorHandlers(
    app: Pick<App, 'config'>,
    target: Pick<Window, 'addEventListener'>,
): void {
    app.config.errorHandler = (err) => reportError(err);
    target.addEventListener('unhandledrejection', (event) =>
        reportError(event.reason),
    );
    target.addEventListener('error', (event) =>
        reportError(event.error ?? event.message),
    );
}
