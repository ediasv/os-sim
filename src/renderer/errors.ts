import { shallowRef, type App } from 'vue';

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
