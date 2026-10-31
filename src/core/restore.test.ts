import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import {
    DEFAULT_CONFIG,
    type SimulationEvent,
    type SimulationSnapshot,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { rmPolicy } from './policies';
import type { SchedulingPolicy } from './policy';
import { Simulator } from './simulator';

/** Aperiodic tasks that tie on every criterion, so the draw decides (DEC-27). */
const tied = (id: number, color: string): TaskDefinition => ({
    id,
    color,
    arrival: 0,
    duration: 2,
    period: 0,
    deadline: 10,
    rawEvents: '',
});

const periodic: TaskDefinition = {
    id: 4,
    color: '112233',
    arrival: 1,
    duration: 1,
    period: 3,
    deadline: 3,
    rawEvents: '',
};

const tieConfig: SystemConfig = {
    ...DEFAULT_CONFIG,
    cpuCount: 1,
    tasks: [tied(1, 'F0E0D0'), tied(2, 'AABBCC'), tied(3, '445566'), periodic],
};

/** Runs `ticks` steps and returns every snapshot, from snapshot 0 onwards. */
function simulate(ticks: number, policy = rmPolicy): Simulator {
    const sim = new Simulator(tieConfig, policy);
    for (let step = 0; step < ticks; step++) {
        sim.tick();
    }
    return sim;
}

function snapshotsOf(sim: Simulator): SimulationSnapshot[] {
    return Array.from({ length: sim.snapshotCount }, (_, k) =>
        sim.getSnapshot(k),
    );
}

describe('Simulator history and restore (#23)', () => {
    it('restores the whole state of any earlier step (REQ-04, DEC-35)', () => {
        const sim = simulate(8);
        const expected = snapshotsOf(sim);
        expect(expected).toHaveLength(9);

        for (let k = 0; k < expected.length; k++) {
            sim.restore(k);

            expect(sim.cursor).toBe(k);
            expect(sim.getLatestSnapshot()).toEqual(expected[k]);
            expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
        }
    });

    it('restores the draw state, so re-running from a step repeats the same draws (DEC-27)', () => {
        const sim = simulate(8);
        const original = snapshotsOf(sim);
        const draws = original
            .at(-1)!
            .events.filter(
                (
                    event,
                ): event is Extract<SimulationEvent, { kind: 'tie-break' }> =>
                    event.kind === 'tie-break',
            );
        expect(draws.length).toBeGreaterThan(1);

        for (let k = 0; k < original.length - 1; k++) {
            sim.restore(k);
            for (let step = k + 1; step < original.length; step++) {
                sim.tick();
                expect(sim.getLatestSnapshot()).toEqual(original[step]);
            }
        }
    });

    it('moves the cursor back on restore and drops the later steps on the next tick', () => {
        const sim = simulate(6);
        const before = snapshotsOf(sim);

        sim.restore(2);
        expect(sim.cursor).toBe(2);
        expect(sim.snapshotCount).toBe(before.length);

        sim.tick();
        expect(sim.cursor).toBe(3);
        expect(sim.snapshotCount).toBe(4);
        expect(sim.getLatestSnapshot()).toEqual(before[3]);
    });

    it('keeps the cursor and the later steps when the step fails (DEC-14)', () => {
        let failing = false;
        const flaky: SchedulingPolicy = {
            select: (view) => {
                if (failing) {
                    throw new Error('policy failed');
                }
                return rmPolicy.select(view);
            },
        };
        const sim = simulate(6, flaky);
        const before = snapshotsOf(sim);

        sim.restore(2);
        failing = true;
        expect(() => sim.tick()).toThrow('policy failed');

        expect(sim.cursor).toBe(2);
        expect(sim.snapshotCount).toBe(before.length);
        expect(sim.getLatestSnapshot()).toBe(before[2]);
        for (let k = 0; k < before.length; k++) {
            expect(sim.getSnapshot(k)).toBe(before[k]);
        }
    });

    it('keeps history and live state apart: re-running never changes a recorded step', () => {
        const sim = simulate(6);
        const recorded = JSON.stringify(sim.getSnapshot(2));
        const kept = sim.getSnapshot(2);

        sim.restore(2);
        for (let step = 0; step < 4; step++) {
            sim.tick();
        }

        expect(JSON.stringify(kept)).toBe(recorded);
        expect(Object.isFrozen(kept.tasks)).toBe(true);
        expect(Object.isFrozen(kept.events)).toBe(true);
        expect(() =>
            (kept.events as SimulationEvent[]).push(kept.events[0]),
        ).toThrow(TypeError);
    });

    it('rejects a missing step with a RangeError and keeps the live state', () => {
        const sim = simulate(3);
        const before = sim.getLatestSnapshot();

        expect(() => sim.restore(4)).toThrow(RangeError);
        expect(() => sim.restore(-1)).toThrow(RangeError);
        expect(sim.cursor).toBe(3);
        expect(sim.getLatestSnapshot()).toBe(before);
    });
});
