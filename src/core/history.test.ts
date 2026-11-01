import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type SimulationSnapshot } from './domain';
import type { Edit } from './edit';
import { SnapshotHistory } from './history';
import { createInitialState, takeSnapshot } from './snapshot';

const EDIT: Edit = [{ kind: 'quantum', quantum: 2 }];

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

    it('records an empty edit list with each appended step', () => {
        const { history } = historyOf(3);
        for (let step = 0; step < 3; step++) {
            expect(history.editsAt(step)).toEqual([]);
        }
        expect(() => history.editsAt(3)).toThrow(RangeError);
    });

    it('rewrite replaces the step, drops later steps and their edits, and moves the cursor', () => {
        const { history, snapshots } = historyOf(5);
        history.moveTo(1);
        const replacement = snapshotAt(2);
        history.rewrite(2, replacement, [EDIT]);
        expect(history.latestStep).toBe(2);
        expect(history.cursor).toBe(2);
        expect(history.at(2)).toBe(replacement);
        expect(history.at(0)).toBe(snapshots[0]);
        expect(history.at(1)).toBe(snapshots[1]);
        expect(history.editsAt(2)).toEqual([EDIT]);
        expect(history.has(3)).toBe(false);
        expect(() => history.editsAt(3)).toThrow(RangeError);
    });

    it('rewrite at the latest step keeps earlier steps', () => {
        const { history, snapshots } = historyOf(3);
        history.rewrite(2, snapshotAt(2), [EDIT]);
        expect(history.latestStep).toBe(2);
        expect(history.at(0)).toBe(snapshots[0]);
        expect(history.at(1)).toBe(snapshots[1]);
        expect(history.editsAt(1)).toEqual([]);
    });

    it('rewrite refuses an unrecorded step or a mismatched clock without changing anything', () => {
        const { history, snapshots } = historyOf(3);
        history.moveTo(1);
        expect(() => history.rewrite(7, snapshotAt(7), [])).toThrow(RangeError);
        expect(() => history.rewrite(1, snapshotAt(2), [])).toThrow(
            'Cannot record a snapshot of clock 2 as step 1.',
        );
        expect(history.latestStep).toBe(2);
        expect(history.cursor).toBe(1);
        snapshots.forEach((snapshot, step) => {
            expect(history.at(step)).toBe(snapshot);
            expect(history.editsAt(step)).toEqual([]);
        });
    });

    it('stores a frozen copy of the edits', () => {
        const { history } = historyOf(2);
        const item = { kind: 'quantum' as const, quantum: 2 };
        const edits: Edit[] = [[item]];
        history.rewrite(1, snapshotAt(1), edits);
        item.quantum = 9;
        edits.push([]);
        expect(history.editsAt(1)).toEqual([EDIT]);
        expect(Object.isFrozen(history.editsAt(1))).toBe(true);
        expect(Object.isFrozen(history.editsAt(1)[0])).toBe(true);
    });
});
