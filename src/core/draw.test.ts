import { describe, expect, it } from 'vitest';
import type { JobRef } from './domain';
import { DRAW_SEED, drawWinners, nextRandom } from './draw';
import { key } from './helpers/key';

const ref = (taskId: number): JobRef => ({ taskId, index: 0 });

describe('nextRandom', () => {
    it('produces the mulberry32 sequence from the fixed seed', () => {
        const first = nextRandom(DRAW_SEED);
        expect(first).toEqual({ value: 0.7589809624478221, state: 3424164379 });
        const second = nextRandom(first.state);
        expect(second).toEqual({
            value: 0.24490448157303035,
            state: 960762896,
        });
    });

    it('keeps every value in [0, 1)', () => {
        let state = DRAW_SEED;
        for (let i = 0; i < 10_000; i++) {
            const next = nextRandom(state);
            expect(next.value).toBeGreaterThanOrEqual(0);
            expect(next.value).toBeLessThan(1);
            state = next.state;
        }
    });
});

describe('drawWinners', () => {
    it('draws `slots` distinct members of the tied group', () => {
        const tied = [ref(1), ref(2), ref(3)];
        const { winners } = drawWinners(tied, 2, DRAW_SEED);
        expect(winners).toHaveLength(2);
        expect(new Set(winners.map(key)).size).toBe(2);
        winners.forEach((w) => expect(tied.map(key)).toContain(key(w)));
    });

    it('ignores input order', () => {
        expect(drawWinners([ref(1), ref(2), ref(3)], 1, DRAW_SEED)).toEqual(
            drawWinners([ref(3), ref(1), ref(2)], 1, DRAW_SEED),
        );
    });

    it('returns the group sorted by task ID, apart from the input', () => {
        const tied = [ref(3), ref(1), ref(2)];
        const { group } = drawWinners(tied, 1, DRAW_SEED);
        expect(group).toEqual([ref(1), ref(2), ref(3)]);
        expect(tied.map(key)).toEqual(['3.0', '1.0', '2.0']);
    });

    it('advances the state once per winner', () => {
        const one = nextRandom(DRAW_SEED).state;
        const two = nextRandom(one).state;
        expect(drawWinners([ref(1), ref(2), ref(3)], 2, DRAW_SEED).state).toBe(
            two,
        );
    });

    it.each([0, 3, 4, 1.5])(
        'rejects %s slots for 3 tied jobs (DEC-26)',
        (slots) => {
            expect(() =>
                drawWinners([ref(1), ref(2), ref(3)], slots, DRAW_SEED),
            ).toThrow(RangeError);
        },
    );

    it('returns plain copies, not the tied objects', () => {
        const tied = [{ taskId: 1, index: 0, extra: true }, ref(2)];
        const { winners } = drawWinners(tied, 1, DRAW_SEED);
        expect(Object.keys(winners[0]).sort()).toEqual(['index', 'taskId']);
    });
});
