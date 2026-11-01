import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type SimulationSnapshot } from './domain';
import { SnapshotHistory } from './history';
import { createInitialState, takeSnapshot } from './snapshot';

function snapshotAt(clock: number): SimulationSnapshot {
    return takeSnapshot({ ...createInitialState(DEFAULT_CONFIG), clock });
}

function historyOf(steps: number): {
    history: SnapshotHistory;
    snapshots: SimulationSnapshot[];
} {
    const history = new SnapshotHistory();
    const snapshots: SimulationSnapshot[] = [];
    for (let step = 0; step < steps; step++) {
        snapshots.push(snapshotAt(step));
        history.append(snapshots[step]);
    }
    return { history, snapshots };
}

describe('SnapshotHistory', () => {
    it('is empty before the first append', () => {
        const history = new SnapshotHistory();
        expect(history.cursor).toBe(-1);
        expect(history.latestStep).toBe(-1);
        expect(history.has(0)).toBe(false);
        expect(() => history.current()).toThrow(RangeError);
        expect(() => history.latest()).toThrow(RangeError);
    });

    it('stores step k at index k and keeps the cursor on the newest step', () => {
        const { history, snapshots } = historyOf(4);
        expect(history.latestStep).toBe(3);
        expect(history.cursor).toBe(3);
        expect(history.isBehind).toBe(false);
        snapshots.forEach((snapshot, step) => {
            expect(history.at(step)).toBe(snapshot);
        });
        expect(history.current()).toBe(snapshots[3]);
        expect(history.latest()).toBe(snapshots[3]);
    });

    it('moves the cursor without changing any step', () => {
        const { history, snapshots } = historyOf(4);
        history.moveTo(1);
        expect(history.cursor).toBe(1);
        expect(history.isBehind).toBe(true);
        expect(history.current()).toBe(snapshots[1]);
        expect(history.latest()).toBe(snapshots[3]);
        history.moveTo(3);
        expect(history.isBehind).toBe(false);
    });

    it('rejects unrecorded steps without moving the cursor', () => {
        const { history } = historyOf(3);
        history.moveTo(1);
        for (const step of [-1, 3, 1.5, NaN]) {
            expect(history.has(step)).toBe(false);
            expect(() => history.at(step)).toThrow(
                `Step ${step} is not recorded: recorded steps are 0 to 2.`,
            );
            expect(() => history.moveTo(step)).toThrow(RangeError);
            expect(history.cursor).toBe(1);
        }
    });

    it('refuses to append while the cursor is behind, keeping every step', () => {
        const { history, snapshots } = historyOf(3);
        history.moveTo(0);
        expect(() => history.append(snapshotAt(1))).toThrow(
            'Cannot record a step while the cursor (0) is behind the latest step (2).',
        );
        expect(history.cursor).toBe(0);
        expect(history.latestStep).toBe(2);
        snapshots.forEach((snapshot, step) => {
            expect(history.at(step)).toBe(snapshot);
        });
    });
});
