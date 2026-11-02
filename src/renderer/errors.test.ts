import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { ConfigValidationError } from '../core/config';
import { EditRefusal, SimulationRefusal } from '../core/refusal';
import {
    commandFailure,
    currentError,
    describeError,
    dismissError,
    installErrorHandlers,
    reportError,
} from './errors';

beforeEach(() => {
    dismissError();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('describeError', () => {
    it('uses the message of an Error', () => {
        expect(describeError(new Error('boom'))).toBe('boom');
    });

    it('falls back to the error name when the message is empty', () => {
        expect(describeError(new TypeError(''))).toBe('TypeError');
    });

    it('stringifies thrown strings', () => {
        expect(describeError('boom')).toBe('boom');
    });

    it('stringifies thrown plain objects as JSON, not [object Object]', () => {
        expect(describeError({ code: 1 })).toBe('{"code":1}');
    });

    it('handles undefined and null', () => {
        expect(describeError(undefined)).toBe('Unknown error');
        expect(describeError(null)).toBe('Unknown error');
    });

    it('never returns undefined when toJSON returns undefined', () => {
        expect(describeError({ toJSON: () => undefined })).toBe(
            'Unknown error',
        );
    });

    it('never returns an empty string for an Error with no message or name', () => {
        const err = Object.assign(new Error(''), { name: '' });
        expect(describeError(err)).toBe('Unknown error');
    });

    it('does not throw on circular objects', () => {
        const a: Record<string, unknown> = {};
        a.self = a;
        expect(describeError(a)).toBe('Unknown error');
    });
});

describe('reportError / dismissError', () => {
    it('stores the described message', () => {
        reportError(new Error('boom'));
        expect(currentError.value).toBe('boom');
    });

    it('keeps the first error until dismissed, but logs every one', () => {
        reportError(new Error('first'));
        reportError(new Error('second'));
        expect(currentError.value).toBe('first');
        expect(console.error).toHaveBeenCalledTimes(2);
    });

    it('does not hide the banner for an unprintable error', () => {
        reportError({ toJSON: () => undefined });
        expect(currentError.value).toBe('Unknown error');
    });

    it('clears on dismiss and shows again on the next error', () => {
        reportError(new Error('first'));
        dismissError();
        expect(currentError.value).toBeNull();
        reportError(new Error('second'));
        expect(currentError.value).toBe('second');
    });

    it('still logs the original error to the console', () => {
        const err = new Error('boom');
        reportError(err);
        expect(console.error).toHaveBeenCalledWith(err);
    });
});

describe('installErrorHandlers', () => {
    function setup() {
        const app = createApp({});
        const listeners = new Map<string, (event: never) => void>();
        const target = {
            addEventListener: (
                type: string,
                listener: (event: never) => void,
            ) => {
                listeners.set(type, listener);
            },
        } as Pick<Window, 'addEventListener'>;
        installErrorHandlers(app, target);
        return { app, listeners };
    }

    it('routes Vue component errors to the banner', () => {
        const { app } = setup();
        app.config.errorHandler!(
            new Error('setup failed'),
            null,
            'setup function',
        );
        expect(currentError.value).toBe('setup failed');
    });

    it('routes unhandled promise rejections to the banner', () => {
        const { listeners } = setup();
        const onRejection = listeners.get('unhandledrejection')!;
        onRejection({ reason: new Error('async boom') } as never);
        expect(currentError.value).toBe('async boom');
    });

    it('handles a non-Error rejection reason', () => {
        const { listeners } = setup();
        listeners.get('unhandledrejection')!({ reason: 42 } as never);
        expect(currentError.value).toBe('42');
    });

    it('routes uncaught errors outside Vue to the banner', () => {
        const { listeners } = setup();
        listeners.get('error')!({
            error: new Error('timer boom'),
            message: 'Uncaught Error: timer boom',
        } as never);
        expect(currentError.value).toBe('timer boom');
    });
});

describe('commandFailure', () => {
    it('returns config errors with their issues and keeps them off the banner', () => {
        const issues = [{ field: 'cpuCount', message: 'bad cpus' }] as const;
        const result = commandFailure(new ConfigValidationError(issues));
        expect(result).toEqual({
            ok: false,
            error: { kind: 'config', message: 'bad cpus', issues },
        });
        expect(currentError.value).toBeNull();
    });

    it('leaves the banner untouched for config errors', () => {
        reportError(new Error('earlier'));
        commandFailure(
            new ConfigValidationError([{ field: 'quantum', message: 'q' }]),
        );
        expect(currentError.value).toBe('earlier');
    });

    it('returns refusals as refused and keeps them off the banner', () => {
        const result = commandFailure(new SimulationRefusal('no earlier step'));
        expect(result).toEqual({
            ok: false,
            error: { kind: 'refused', message: 'no earlier step' },
        });
        expect(currentError.value).toBeNull();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('keeps the refused items of an edit so the form can show each reason', () => {
        const items = [
            { index: 1, kind: 'taskPeriod', reason: 'Período deve ser ≥ 1.' },
        ];
        const result = commandFailure(new EditRefusal(items));
        expect(result).toEqual({
            ok: false,
            error: {
                kind: 'refused',
                message: 'Item 2 (taskPeriod): Período deve ser ≥ 1.',
                items,
            },
        });
        expect(currentError.value).toBeNull();
    });

    it('returns other errors as unexpected and shows them on the banner', () => {
        const err = new Error('policy failed');
        expect(commandFailure(err)).toEqual({
            ok: false,
            error: { kind: 'unexpected', message: 'policy failed' },
        });
        expect(currentError.value).toBe('policy failed');
        expect(console.error).toHaveBeenCalledWith(err);
    });

    it('describes a thrown plain object as JSON, not [object Object]', () => {
        expect(commandFailure({ code: 1 })).toEqual({
            ok: false,
            error: { kind: 'unexpected', message: '{"code":1}' },
        });
    });

    it('classifies a thrown string as unexpected', () => {
        expect(commandFailure('boom')).toEqual({
            ok: false,
            error: { kind: 'unexpected', message: 'boom' },
        });
    });
});
