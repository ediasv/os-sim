import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SimulationSnapshot,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { SchedulingPolicy } from './policy';
import { rmPolicy } from './policies';
import { Simulator } from './simulator';
import { restoreState } from './snapshot';

// Residual ties recur, so the draw state changes many times along the run.
const tied = (id: number, color: string): TaskDefinition => ({
    id,
    color,
    arrival: 0,
    duration: 1,
    period: 4,
    deadline: 4,
    rawEvents: '',
});
const config: SystemConfig = {
    ...DEFAULT_CONFIG,
    cpuCount: 1,
    tasks: [tied(1, 'F0E0D0'), tied(2, 'AABBCC'), tied(3, '112233')],
};
const STEPS = 12;

/** Runs STEPS ticks and returns the snapshots 0..STEPS as recorded. */
function recordRun(sim: Simulator): SimulationSnapshot[] {
    const recorded = [sim.getLatestSnapshot()];
    for (let i = 0; i < STEPS; i++) {
        sim.tick();
        recorded.push(sim.getLatestSnapshot());
    }
    return recorded;
}

/**
 * Proof seam for the restoration criterion (agreed on 2026-10-31): copies the
 * live state restored in `source` into a fresh simulator whose history ends at
 * the source's cursor, so ticking it recomputes the next step from the
 * restored state. Reaches private fields on purpose; nothing in #23 exposes
 * recomputation publicly (#24 reuses, #26 discards the future).
 */
function continueFrom(
    source: Simulator,
    cfg: SystemConfig,
    policy: SchedulingPolicy,
): Simulator {
    const fresh = new Simulator(cfg, policy);
    const cursor = source.getCursor();
    fresh['state'] = restoreState(source.getCurrentSnapshot());
    fresh['snapshotHistory'] = source['snapshotHistory'].slice(0, cursor + 1);
    fresh['cursor'] = cursor;
    return fresh;
}

describe('Simulator history cursor', () => {
    it('starts with the cursor at snapshot 0', () => {
        const sim = new Simulator(config, rmPolicy);
        expect(sim.getCursor()).toBe(0);
        expect(sim.getCurrentSnapshot()).toBe(sim.getLatestSnapshot());
    });

    it('moves the cursor with each tick', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        expect(sim.getCursor()).toBe(STEPS);
        expect(sim.getCurrentSnapshot()).toBe(recorded[STEPS]);
    });

    it('restores any recorded step as the current snapshot', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        for (let k = 0; k <= STEPS; k++) {
            sim.restore(k);
            expect(sim.getCursor()).toBe(k);
            expect(sim.getCurrentSnapshot()).toBe(recorded[k]);
            expect(sim.getLatestSnapshot()).toBe(recorded[STEPS]);
        }
    });

    it('answers eligibility from the restored step', () => {
        const sim = new Simulator(config, rmPolicy);
        const latest = (recordRun(sim), sim.getEligibleJobs());
        let differed = false;
        for (let k = 0; k <= STEPS; k++) {
            const reference = new Simulator(config, rmPolicy);
            for (let i = 0; i < k; i++) reference.tick();
            sim.restore(k);
            expect(sim.getEligibleJobs()).toEqual(reference.getEligibleJobs());
            differed ||=
                JSON.stringify(sim.getEligibleJobs()) !==
                JSON.stringify(latest);
        }
        expect(differed).toBe(true);
    });

    it('refuses an unrecorded step without changing anything', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        sim.restore(3);
        const eligible = sim.getEligibleJobs();
        for (const step of [-1, STEPS + 1, 1.5, NaN]) {
            expect(() => sim.restore(step)).toThrow(RangeError);
            expect(() => sim.restore(step)).toThrow(
                `Cannot restore step ${step}: recorded steps are 0 to ${STEPS}.`,
            );
            expect(sim.getCursor()).toBe(3);
            expect(sim.getCurrentSnapshot()).toBe(recorded[3]);
            expect(sim.getEligibleJobs()).toEqual(eligible);
        }
    });

    it('keeps every recorded snapshot identical and frozen after restoring', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        const copies = JSON.parse(JSON.stringify(recorded));
        for (const k of [7, 0, STEPS, 3, 3, 9, 1]) sim.restore(k);
        recorded.forEach((snapshot, i) => {
            expect(snapshot).toEqual(copies[i]);
            expect(Object.isFrozen(snapshot)).toBe(true);
            expect(Object.isFrozen(snapshot.events)).toBe(true);
        });
    });

    it('recomputes the recorded next step from every restored step (REQ-04)', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        const ties = recorded.flatMap((s) =>
            s.events.filter((e) => e.kind === 'tie-break'),
        );
        expect(ties.length).toBeGreaterThan(1);
        expect(new Set(recorded.map((s) => s.drawState)).size).toBeGreaterThan(
            1,
        );
        for (let k = 0; k < STEPS; k++) {
            sim.restore(k);
            const fresh = continueFrom(sim, config, rmPolicy);
            fresh.tick();
            const next = fresh.getLatestSnapshot();
            expect(next).toEqual(recorded[k + 1]);
            expect(next.events).toEqual(recorded[k + 1].events);
            expect(next.drawState).toEqual(recorded[k + 1].drawState);
        }
    });

    it('keeps earlier snapshots identical and frozen after restoring and recomputing', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        const copies = JSON.parse(JSON.stringify(recorded));
        for (let k = 0; k < STEPS; k++) {
            sim.restore(k);
            continueFrom(sim, config, rmPolicy).tick();
        }
        recorded.forEach((snapshot, i) => {
            expect(snapshot).toEqual(copies[i]);
            expect(Object.isFrozen(snapshot)).toBe(true);
            expect(Object.isFrozen(snapshot.events)).toBe(true);
            sim.restore(i);
            expect(sim.getCurrentSnapshot()).toBe(snapshot);
        });
    });

    it('refuses tick behind the cursor without changing anything', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        sim.restore(5);
        expect(() => sim.tick()).toThrow(
            'Step 6 is already computed; use snapshot navigation instead of tick().',
        );
        expect(sim.getCursor()).toBe(5);
        expect(sim.getCurrentSnapshot()).toBe(recorded[5]);
        expect(sim.getLatestSnapshot()).toBe(recorded[STEPS]);
    });

    it('computes a new step after restoring the latest one', () => {
        const a = new Simulator(config, rmPolicy);
        recordRun(a);
        a.restore(3);
        a.restore(STEPS);
        a.tick();
        const b = new Simulator(config, rmPolicy);
        for (let i = 0; i < STEPS + 1; i++) b.tick();
        expect(a.getLatestSnapshot()).toEqual(b.getLatestSnapshot());
        expect(a.getCursor()).toBe(STEPS + 1);
    });

    it('keeps cursor and history when a policy throws after restoring the latest step (DEC-14)', () => {
        const failing: SchedulingPolicy = {
            select: (view) => {
                if (view.clock > STEPS) throw new Error('policy failure');
                return rmPolicy.select(view);
            },
        };
        const sim = new Simulator(config, failing);
        const recorded = recordRun(sim);
        sim.restore(2);
        sim.restore(STEPS);
        expect(() => sim.tick()).toThrow();
        expect(sim.getCursor()).toBe(STEPS);
        expect(sim.getLatestSnapshot()).toBe(recorded[STEPS]);
        expect(sim.getCurrentSnapshot()).toBe(recorded[STEPS]);
    });
});
