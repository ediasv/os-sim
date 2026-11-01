import { describe, expect, it } from 'vitest';
import {
    MAX_TASK_ID_LENGTH,
    compareTaskIds,
    suggestTaskId,
    taskIdKey,
    validateTaskId,
} from './taskId';

describe('validateTaskId (DEC-48)', () => {
    it.each(['1', 'A', 'tarefa-1', 'tarefa 1', '-3', '2.5', 'ação', '01'])(
        'accepts %j',
        (text) => {
            expect(validateTaskId(text)).toEqual({ ok: true, id: text });
        },
    );

    it('trims the ends and keeps inner spaces', () => {
        expect(validateTaskId('  tarefa 1 ')).toEqual({
            ok: true,
            id: 'tarefa 1',
        });
    });

    it.each(['', '   ', '\t'])('refuses empty text %j', (text) => {
        const result = validateTaskId(text);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/vazio/);
    });

    it.each(['a;b', ';', 'a\nb', 'a\rb'])('refuses %j', (text) => {
        const result = validateTaskId(text);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/;|quebra de linha/);
    });

    it('accepts exactly the maximum length and refuses one more', () => {
        expect(validateTaskId('a'.repeat(MAX_TASK_ID_LENGTH)).ok).toBe(true);
        const result = validateTaskId('a'.repeat(MAX_TASK_ID_LENGTH + 1));
        expect(result.ok).toBe(false);
        if (!result.ok)
            expect(result.reason).toContain(`${MAX_TASK_ID_LENGTH}`);
    });

    it('measures the length after trimming', () => {
        expect(validateTaskId(` ${'a'.repeat(MAX_TASK_ID_LENGTH)} `).ok).toBe(
            true,
        );
    });

    it.each(['__proto__', '__PROTO__'])(
        'refuses %j, which breaks objects keyed by ID',
        (text) => {
            const result = validateTaskId(text);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.reason).toMatch(/reservado/);
        },
    );
});

describe('taskIdKey', () => {
    it('ignores case and surrounding spaces', () => {
        expect(taskIdKey('A')).toBe(taskIdKey('a'));
        expect(taskIdKey(' Tarefa-1 ')).toBe(taskIdKey('tarefa-1'));
        expect(taskIdKey('A')).not.toBe(taskIdKey('B'));
    });
});

describe('compareTaskIds (natural order)', () => {
    const sorted = (ids: string[]) => [...ids].sort(compareTaskIds);

    it('compares digit-only IDs by value', () => {
        expect(sorted(['10', '2', '1', '100'])).toEqual([
            '1',
            '2',
            '10',
            '100',
        ]);
    });

    it('puts numbers before text and orders text alphabetically without case', () => {
        expect(sorted(['b', 'A', '10', 'a1', '2'])).toEqual([
            '2',
            '10',
            'A',
            'a1',
            'b',
        ]);
    });

    it('is total: equal numbers and equal text fall back to the exact text', () => {
        expect(sorted(['01', '1'])).toEqual(['01', '1']);
        expect(sorted(['1', '01'])).toEqual(['01', '1']);
        expect(compareTaskIds('a', 'A')).not.toBe(0);
        expect(compareTaskIds('x', 'x')).toBe(0);
    });

    it('does not lose precision on huge numbers', () => {
        const big = '9007199254740993';
        const bigger = '9007199254740994';
        expect(compareTaskIds(big, bigger)).toBeLessThan(0);
    });

    it('treats signed and decimal text as text', () => {
        expect(sorted(['-3', '5', '2.5'])).toEqual(['5', '-3', '2.5']);
    });
});

describe('suggestTaskId', () => {
    it('starts at 1 when nothing was used', () => {
        expect(suggestTaskId([])).toBe('1');
    });

    it('is the highest used number plus one, ignoring gaps and text', () => {
        expect(suggestTaskId(['1', '2', '7', 'A', 'b'])).toBe('8');
    });

    it('starts at 1 when only text was used', () => {
        expect(suggestTaskId(['A', 'b'])).toBe('1');
    });

    it('counts every used ID, so a removed highest ID is not reused', () => {
        expect(suggestTaskId(['1', '2', '3'])).toBe('4');
    });

    it('works on numbers beyond the safe integer range', () => {
        expect(suggestTaskId(['9007199254740993'])).toBe('9007199254740994');
        expect(suggestTaskId(['99'])).toBe('100');
    });

    it('ignores leading zeros when picking the highest', () => {
        expect(suggestTaskId(['007', '5'])).toBe('8');
    });
});
