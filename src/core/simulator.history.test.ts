import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SimulationSnapshot,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { SchedulingPolicy } from './policy';
import { rmPolicy } from './policies';
import { SnapshotHistory } from './history';
import { Simulator } from './simulator';
import { deepCopy } from './helpers/deepCopy';

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

// Partial progress: slices and executions are mid-way at many boundaries,
// with preemption, quantum expiry and deadline misses; the tie scenario
// above keeps sliceElapsed and incomplete executed at 0.
const job = (
    id: number,
    color: string,
    arrival: number,
    duration: number,
    period: number,
): TaskDefinition => ({
    id,
    color,
    arrival,
    duration,
    period,
    deadline: period,
    rawEvents: '',
});
const partialConfig: SystemConfig = {
    ...DEFAULT_CONFIG,
    quantum: 2,
    cpuCount: 2,
    tasks: [
        job(1, 'F0E0D0', 0, 3, 5),
        job(2, 'AABBCC', 0, 4, 6),
        job(3, '112233', 1, 2, 4),
        job(4, '445566', 0, 5, 6),
    ],
};
const PARTIAL_STEPS = 20;

/** Runs `steps` ticks and returns the snapshots 0..steps as recorded. */
function recordRun(sim: Simulator, steps = STEPS): SimulationSnapshot[] {
    const recorded = [sim.getLatestSnapshot()];
    for (let i = 0; i < steps; i++) {
        sim.tick();
        recorded.push(sim.getLatestSnapshot());
    }
    return recorded;
}

/**
 * Proof seam for the restoration criterion (agreed on 2026-10-31): copies the
 * live state that `source.restore()` installed into a fresh simulator whose
 * history ends at the source's cursor, so ticking it recomputes the next step
 * from exactly that state. Copying the live state (not re-deriving it from the
 * snapshot) keeps the proof sensitive to anything `restore()` does. Reaches
 * private fields on purpose; nothing in #23 exposes recomputation publicly
 * (#24 reuses, #26 discards the future).
 */
function continueFrom(
    source: Simulator,
    cfg: SystemConfig,
    policy: SchedulingPolicy,
): Simulator {
    const fresh = new Simulator(cfg, policy);
    const history = new SnapshotHistory();
    for (let step = 0; step <= source.getCursor(); step++) {
        history.append(source['history'].at(step));
    }
    fresh['state'] = deepCopy(source['state']);
    // `history` is readonly in Simulator; only this seam replaces it.
    (fresh as unknown as { history: SnapshotHistory }).history = history;
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
        recordRun(sim);
        const latest = sim.getEligibleJobs();
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
                `Step ${step} is not recorded: recorded steps are 0 to ${STEPS}.`,
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

    it('recomputes the recorded next step with slices and progress mid-way (REQ-04)', () => {
        const sim = new Simulator(partialConfig, rmPolicy);
        const recorded = recordRun(sim, PARTIAL_STEPS);
        const kinds = new Set<string>(
            recorded[PARTIAL_STEPS].events.map((e) => e.kind),
        );
        for (const kind of ['preemption', 'quantum-expired', 'deadline-miss']) {
            expect(kinds.has(kind)).toBe(true);
        }
        expect(
            recorded.some((s) => s.cpus.some((c) => c.sliceElapsed > 0)),
        ).toBe(true);
        expect(
            recorded.some((s) =>
                s.tasks.some((t) =>
                    t.jobs.some(
                        (j) => j.state !== 'completed' && j.executed > 0,
                    ),
                ),
            ),
        ).toBe(true);
        for (let k = 0; k < PARTIAL_STEPS; k++) {
            sim.restore(k);
            const fresh = continueFrom(sim, partialConfig, rmPolicy);
            fresh.tick();
            expect(fresh.getLatestSnapshot()).toEqual(recorded[k + 1]);
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
            'Step 6 is already computed; use forward() instead of tick().',
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
