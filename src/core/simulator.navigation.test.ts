import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SimulationSnapshot,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { SchedulingPolicy } from './policy';
import { rmPolicy } from './policies';
import { SimulationRefusal } from './refusal';
import { Simulator } from './simulator';

// Residual ties recur, so the draw state and tie-break events change along
// the run: reusing a step must keep them exactly as recorded (DEC-06).
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

const BACKWARD_AT_ZERO =
    'Step 0 is the first recorded step; there is no earlier step to go back to.';

/** Runs `steps` ticks and returns the snapshots 0..steps as recorded. */
function recordRun(sim: Simulator, steps = STEPS): SimulationSnapshot[] {
    const recorded = [sim.getLatestSnapshot()];
    for (let i = 0; i < steps; i++) {
        sim.tick();
        recorded.push(sim.getLatestSnapshot());
    }
    return recorded;
}

/** Wraps a policy and counts its decisions, to prove navigation never asks it. */
function counting(policy: SchedulingPolicy): SchedulingPolicy & {
    calls: number;
} {
    const wrapper = {
        calls: 0,
        select: (view: Parameters<SchedulingPolicy['select']>[0]) => {
            wrapper.calls++;
            return policy.select(view);
        },
    };
    return wrapper;
}

describe('Simulator navigation', () => {
    it('backward moves the cursor and the clock to the previous step', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim);
        sim.backward();
        expect(sim.getCursor()).toBe(STEPS - 1);
        expect(sim.getCurrentSnapshot()).toBe(recorded[STEPS - 1]);
        expect(sim.getCurrentSnapshot().clock).toBe(STEPS - 1);
    });

    it('back n then forward n returns the recorded snapshots without recomputing (REQ-04, DEC-06)', () => {
        const policy = counting(rmPolicy);
        const sim = new Simulator(config, policy);
        const recorded = recordRun(sim);
        expect(
            recorded.some((s) => s.events.some((e) => e.kind === 'tie-break')),
        ).toBe(true);
        const copies = structuredClone(recorded);
        const callsBefore = policy.calls;

        for (let k = STEPS - 1; k >= 0; k--) {
            sim.backward();
            expect(sim.getCurrentSnapshot()).toBe(recorded[k]);
            expect(sim.getCurrentSnapshot().clock).toBe(k);
        }
        for (let k = 1; k <= STEPS; k++) {
            sim.forward();
            expect(sim.getCursor()).toBe(k);
            expect(sim.getCurrentSnapshot()).toBe(recorded[k]);
            expect(sim.getCurrentSnapshot().clock).toBe(k);
        }

        expect(policy.calls).toBe(callsBefore);
        expect(recorded).toEqual(copies);
        expect(sim.getLatestSnapshot()).toBe(recorded[STEPS]);
    });

    it('ticks from the latest step after navigating like an uninterrupted run', () => {
        const a = new Simulator(config, rmPolicy);
        recordRun(a);
        for (let i = 0; i < 5; i++) a.backward();
        for (let i = 0; i < 5; i++) a.forward();
        a.tick();

        const b = new Simulator(config, rmPolicy);
        recordRun(b, STEPS + 1);

        expect(a.getCursor()).toBe(STEPS + 1);
        expect(a.getLatestSnapshot()).toEqual(b.getLatestSnapshot());
    });

    it('refuses backward at step 0 without changing anything (REQ-10)', () => {
        const sim = new Simulator(config, rmPolicy);
        const recorded = recordRun(sim, 3);
        for (let i = 0; i < 3; i++) sim.backward();

        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => sim.backward()).toThrow(SimulationRefusal);
            expect(() => sim.backward()).toThrow(BACKWARD_AT_ZERO);
            expect(sim.getCursor()).toBe(0);
            expect(sim.getCurrentSnapshot()).toBe(recorded[0]);
            expect(sim.getLatestSnapshot()).toBe(recorded[3]);
        }
    });

    it('refuses forward at the latest step and names tick() (REQ-10)', () => {
        const policy = counting(rmPolicy);
        const sim = new Simulator(config, policy);
        const recorded = recordRun(sim);
        const callsBefore = policy.calls;

        for (let attempt = 0; attempt < 2; attempt++) {
            expect(() => sim.forward()).toThrow(SimulationRefusal);
            expect(() => sim.forward()).toThrow(
                'Step 12 is the latest recorded step; use tick() to compute step 13.',
            );
            expect(sim.getCursor()).toBe(STEPS);
            expect(sim.getCurrentSnapshot()).toBe(recorded[STEPS]);
        }
        expect(policy.calls).toBe(callsBefore);
    });

    it('refuses both moves on a new empty simulator', () => {
        const sim = new Simulator();
        const zero = sim.getCurrentSnapshot();
        expect(() => sim.backward()).toThrow(SimulationRefusal);
        expect(() => sim.forward()).toThrow(
            'Step 0 is the latest recorded step; use tick() to compute step 1.',
        );
        expect(sim.getCursor()).toBe(0);
        expect(sim.getCurrentSnapshot()).toBe(zero);
    });

    it('canForward tells whether a recorded step is ahead of the cursor', () => {
        const sim = new Simulator(config, rmPolicy);
        expect(sim.canForward()).toBe(false);
        recordRun(sim, 2);
        expect(sim.canForward()).toBe(false);
        sim.backward();
        expect(sim.canForward()).toBe(true);
        sim.forward();
        expect(sim.canForward()).toBe(false);
    });

    it('refuses tick behind the cursor as a refusal', () => {
        const sim = new Simulator(config, rmPolicy);
        recordRun(sim);
        sim.backward();
        expect(() => sim.tick()).toThrow(SimulationRefusal);
        expect(() => sim.tick()).toThrow(
            'Step 12 is already computed; use forward() instead of tick().',
        );
        expect(sim.getCursor()).toBe(STEPS - 1);
    });
});
