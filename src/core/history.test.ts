import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type SimulationSnapshot } from './domain';
import { SimulationHistory } from './history';
import { createInitialState, takeSnapshot } from './snapshot';

/** Frozen snapshot whose clock is `clock`, for telling entries apart. */
function snapshotAt(clock: number): SimulationSnapshot {
    return takeSnapshot({ ...createInitialState(DEFAULT_CONFIG), clock });
}

function clocks(history: SimulationHistory): number[] {
    return Array.from(
        { length: history.snapshotCount },
        (_, k) => history.at(k).clock,
    );
}

describe('SimulationHistory (#23)', () => {
    it('keeps every appended snapshot and points the cursor at the newest one', () => {
        const history = new SimulationHistory();
        history.append(snapshotAt(0));
        history.append(snapshotAt(1));
        history.append(snapshotAt(2));

        expect(history.snapshotCount).toBe(3);
        expect(history.cursor).toBe(2);
        expect(clocks(history)).toEqual([0, 1, 2]);
        expect(history.current()).toBe(history.at(2));
    });

    it('moves the cursor without changing the recorded snapshots', () => {
        const history = new SimulationHistory();
        history.append(snapshotAt(0));
        history.append(snapshotAt(1));
        const first = history.at(0);

        history.moveTo(0);

        expect(history.cursor).toBe(0);
        expect(history.current()).toBe(first);
        expect(clocks(history)).toEqual([0, 1]);
    });

    it('drops the steps after the cursor when a new step is appended (DEC-06)', () => {
        const history = new SimulationHistory();
        history.append(snapshotAt(0));
        history.append(snapshotAt(1));
        history.append(snapshotAt(2));
        history.moveTo(1);

        history.append(snapshotAt(2));

        expect(clocks(history)).toEqual([0, 1, 2]);
        expect(history.cursor).toBe(2);
    });

    it.each([
        ['a negative index', -1],
        ['an index past the newest snapshot', 3],
        ['a fractional index', 1.5],
        ['NaN', Number.NaN],
    ])('rejects %s with a RangeError and keeps the cursor', (_, index) => {
        const history = new SimulationHistory();
        history.append(snapshotAt(0));
        history.append(snapshotAt(1));
        history.append(snapshotAt(2));
        history.moveTo(1);

        expect(() => history.at(index)).toThrow(RangeError);
        expect(() => history.moveTo(index)).toThrow(RangeError);
        expect(history.cursor).toBe(1);
        expect(clocks(history)).toEqual([0, 1, 2]);
    });
});
