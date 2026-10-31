import { describe, expect, it } from 'vitest';
import { freezeCopy } from './freezeCopy';
import { thawCopy } from './thawCopy';

describe('thawCopy (#23)', () => {
    it('copies a frozen tree into values that can be mutated', () => {
        const frozen = freezeCopy({
            clock: 3,
            tasks: [{ jobs: [{ executed: 1 }] }],
            events: [],
        });

        const thawed = thawCopy(frozen);

        expect(thawed).toEqual(frozen);
        expect(Object.isFrozen(thawed)).toBe(false);
        expect(Object.isFrozen(thawed.tasks)).toBe(false);
        expect(Object.isFrozen(thawed.tasks[0].jobs[0])).toBe(false);
        expect(Object.isFrozen(thawed.events)).toBe(false);
    });

    it('shares no object with the source, so mutating the copy leaves the source intact', () => {
        const frozen = freezeCopy({ tasks: [{ jobs: [{ executed: 1 }] }] });

        const thawed = thawCopy(frozen);
        thawed.tasks[0].jobs[0].executed = 99;
        thawed.tasks.push({ jobs: [] });

        expect(frozen.tasks).toHaveLength(1);
        expect(frozen.tasks[0].jobs[0].executed).toBe(1);
    });

    it('returns primitives and null unchanged', () => {
        expect(thawCopy(null)).toBeNull();
        expect(thawCopy(7)).toBe(7);
        expect(thawCopy('RM')).toBe('RM');
    });
});
