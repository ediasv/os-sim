import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentError,
  describeError,
  dismissError,
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
