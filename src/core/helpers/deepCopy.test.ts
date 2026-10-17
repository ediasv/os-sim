import { describe, expect, it } from 'vitest';
import { deepCopy } from './deepCopy';

describe('deepCopy', () => {
    it('copies nested plain data without freezing or sharing it', () => {
        const input = { a: 1, nested: { list: [1, { b: 2 }] } };

        const result = deepCopy(input);

        expect(result).toEqual(input);
        expect(result).not.toBe(input);
        expect(result.nested).not.toBe(input.nested);
        expect(result.nested.list).not.toBe(input.nested.list);
        expect(result.nested.list[1]).not.toBe(input.nested.list[1]);
        expect(Object.isFrozen(result)).toBe(false);
    });

    it('shares frozen subtrees as they are', () => {
        const input = { frozen: Object.freeze({ a: 1 }), list: [1] };

        const result = deepCopy(input);

        expect(result.frozen).toBe(input.frozen);
        expect(result.list).not.toBe(input.list);
    });
});
