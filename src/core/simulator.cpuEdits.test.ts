import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { findInconsistencies } from './consistency';
import { summarizeCpuOff } from './cpuOff';
import { DEFAULT_POLICIES, rmPolicy } from './policies';
import { type EditItem } from './edit';
import { EditRefusal } from './refusal';
import { Simulator } from './simulator';

const count = (cpuCount: number): EditItem => ({ kind: 'cpuCount', cpuCount });
const ref = (taskId: number) => ({ taskId, index: 0 });
const task = (
    id: number,
    changes: Partial<TaskDefinition> = {},
): TaskDefinition => ({
    id,
    color: ['AABBCC', 'CCDDEE', '112233', '445566'][id - 1],
    arrival: 0,
    duration: 10,
    period: 50,
    deadline: 50,
    rawEvents: '',
    ...changes,
});
const config = (changes: Partial<SystemConfig> = {}): SystemConfig => ({
    ...DEFAULT_CONFIG,
    cpuCount: 4,
    tasks: [task(1)],
    ...changes,
});
function tick(sim: Simulator, n = 1) {
    for (let i = 0; i < n; i++) {
        sim.tick();
        expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
    }
}
function edit(sim: Simulator, items: readonly EditItem[]) {
    sim.edit(items);
    expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
}
function history(sim: Simulator) {
    const cursor = sim.getCursor();
    const last = sim.getLatestSnapshot().clock;
    const steps = Array.from({ length: last + 1 }, (_, i) => {
        sim.restore(i);
        return { snapshot: sim.getCurrentSnapshot(), edits: sim.getEdits(i) };
    });
    sim.restore(cursor);
    return { cursor, steps };
}

describe('Simulator CPU edits (DEC-37)', () => {
    it.each([0, 1])(
        'cancels count changes at tick %s without events, slice renewal or draw changes',
        (time) => {
            const cfg = config({ tasks: [task(1), task(2), task(3), task(4)] });
            const changed = new Simulator(cfg, rmPolicy);
            const direct = new Simulator(cfg, rmPolicy);
            tick(changed, time);
            tick(direct, time);
            const before = changed.getCurrentSnapshot();
            edit(changed, [count(2)]);
            edit(changed, [count(4)]);
            edit(direct, [count(4)]);
            expect(changed.getCurrentSnapshot()).toEqual(
                direct.getCurrentSnapshot(),
            );
            expect(changed.getCurrentSnapshot()).toEqual(before);
        },
    );

    it('reuses IDs between ticks and excludes absent time from idle totals', () => {
        const sim = new Simulator(config(), rmPolicy);
        tick(sim);
        edit(sim, [count(2)]);
        tick(sim, 2);
        edit(sim, [count(4)]);
        tick(sim);
        const state = sim.getCurrentSnapshot();
        expect(state.cpus.map((c) => c.id)).toEqual([1, 2, 3, 4]);
        expect(summarizeCpuOff(state).find((c) => c.cpuId === 3)).toEqual({
            cpuId: 3,
            intervals: [
                { start: 0, end: 1 },
                { start: 3, end: null },
            ],
            totalOff: 2,
        });
        expect(
            state.events.filter(
                (e) => e.kind === 'cpu-added' || e.kind === 'cpu-removed',
            ),
        ).toEqual([
            { kind: 'cpu-removed', time: 1, cpuId: 3 },
            { kind: 'cpu-removed', time: 1, cpuId: 4 },
            { kind: 'cpu-added', time: 3, cpuId: 3 },
            { kind: 'cpu-added', time: 3, cpuId: 4 },
        ]);
    });

    it('initializes added CPUs as off and wakes them when eligible work arrives', () => {
        const sim = new Simulator(
            config({
                cpuCount: 1,
                tasks: [task(1, { arrival: 3 }), task(2, { arrival: 3 })],
            }),
            rmPolicy,
        );
        tick(sim);
        edit(sim, [count(2)]);
        expect(sim.getCurrentSnapshot().cpus[1].offSince).toBe(1);
        tick(sim, 2);
        expect(sim.getCurrentSnapshot().cpus[1].running).not.toBeNull();
        expect(summarizeCpuOff(sim.getCurrentSnapshot())[1]).toEqual({
            cpuId: 2,
            intervals: [{ start: 1, end: 3 }],
            totalOff: 2,
        });
    });

    it('retains a removed CPU runner tie-break and gives migration a new slice', () => {
        const sim = new Simulator(
            config({
                cpuCount: 2,
                tasks: [
                    task(1, { period: 10, deadline: 40 }),
                    task(2, { period: 20, deadline: 20 }),
                    task(3, { arrival: 1, period: 20, deadline: 19 }),
                ],
            }),
            { policies: DEFAULT_POLICIES },
        );
        expect(sim.getCurrentSnapshot().cpus.map((c) => c.running)).toEqual([
            ref(1),
            ref(2),
        ]);
        tick(sim);
        edit(sim, [count(1), { kind: 'algorithm', algorithm: 'EDF' }]);
        const state = sim.getCurrentSnapshot();
        expect(state.cpus[0].running).toEqual(ref(2));
        expect(state.cpus[0].sliceElapsed).toBe(0);
        expect(state.events).toContainEqual({
            kind: 'cpu-removed',
            time: 1,
            cpuId: 2,
        });
        expect(
            state.events.filter(
                (e) => e.kind === 'preemption' && e.cpuId === 2,
            ),
        ).toEqual([]);
        expect(state.events).toContainEqual({
            kind: 'preemption',
            time: 1,
            cpuId: 1,
            preempted: ref(1),
            by: ref(2),
        });
        tick(sim);
        expect(sim.getCurrentSnapshot().tasks[1].jobs[0].executed).toBe(2);
        expect(sim.getCurrentSnapshot().cpus[0].sliceElapsed).toBe(1);
    });

    it('orders simultaneous boundary facts and excludes removed CPUs from quantum expiry', () => {
        const sim = new Simulator(
            config({
                cpuCount: 3,
                quantum: 2,
                tasks: [
                    task(1, { duration: 2, period: 10, deadline: 2 }),
                    task(2, { duration: 8, period: 20, deadline: 2 }),
                    task(3, { duration: 8, period: 30, deadline: 2 }),
                    task(4, { arrival: 2, period: 40, deadline: 40 }),
                ],
            }),
            rmPolicy,
        );
        tick(sim, 2);
        edit(sim, [count(2)]);
        expect(
            sim
                .getCurrentSnapshot()
                .events.filter((e) => e.time === 2)
                .map((e) => e.kind),
        ).toEqual([
            'completion',
            'deadline-miss',
            'deadline-miss',
            'activation',
            'cpu-removed',
            'quantum-expired',
        ]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs[0].state).toBe(
            'completed',
        );
        expect(sim.getCurrentSnapshot().cpus[1].sliceElapsed).toBe(0);
    });

    it('does not revive a job completed on a removed CPU', () => {
        const sim = new Simulator(
            config({
                cpuCount: 2,
                tasks: [task(1), task(2, { duration: 1, period: 60 })],
            }),
            rmPolicy,
        );
        tick(sim);
        edit(sim, [count(1)]);
        expect(sim.getCurrentSnapshot().tasks[1].jobs[0].state).toBe(
            'completed',
        );
        expect(sim.getCurrentSnapshot().events).toContainEqual({
            kind: 'completion',
            time: 1,
            job: ref(2),
        });
        expect(
            sim
                .getCurrentSnapshot()
                .events.filter((e) => e.kind === 'preemption' && e.cpuId === 2),
        ).toEqual([]);
    });

    it('keeps surviving slice consumption while removing busy CPUs', () => {
        const sim = new Simulator(
            config({
                tasks: [
                    task(1, { period: 10 }),
                    task(2, { period: 20 }),
                    task(3, { period: 30 }),
                ],
            }),
            rmPolicy,
        );
        tick(sim, 2);
        edit(sim, [count(1)]);
        expect(sim.getCurrentSnapshot().cpus[0].sliceElapsed).toBe(2);
        expect(sim.getCurrentSnapshot().tasks[1].jobs[0]).toMatchObject({
            state: 'ready',
            executed: 2,
            absoluteDeadline: 50,
        });
    });

    it('rejects a mixed edit atomically including all future history and edits', () => {
        const sim = new Simulator(config(), rmPolicy);
        tick(sim, 2);
        edit(sim, [count(3)]);
        tick(sim, 2);
        edit(sim, [count(2)]);
        sim.restore(1);
        const before = history(sim);
        expect(() =>
            sim.edit([count(1), { kind: 'quantum', quantum: 0 }]),
        ).toThrow(EditRefusal);
        expect(history(sim)).toEqual(before);
    });

    it('rolls back resized state and history when the policy fails', () => {
        let fail = false;
        const sim = new Simulator(config(), {
            select: (view) => {
                if (fail && view.cpuCount === 1)
                    throw new Error('policy failed after resize');
                return rmPolicy.select(view);
            },
        });
        tick(sim, 2);
        edit(sim, [count(3)]);
        tick(sim, 2);
        sim.restore(1);
        const before = history(sim);
        fail = true;
        expect(() => sim.edit([count(1)])).toThrow(
            'policy failed after resize',
        );
        expect(history(sim)).toEqual(before);
    });

    it('branches in the past and restores rewritten snapshots without dispatch', () => {
        let calls = 0;
        const sim = new Simulator(config(), {
            select: (view) => {
                calls++;
                return rmPolicy.select(view);
            },
        });
        tick(sim, 2);
        edit(sim, [count(3)]);
        tick(sim);
        edit(sim, [count(2)]);
        sim.restore(1);
        edit(sim, [count(1)]);
        expect(sim.getLatestSnapshot().clock).toBe(1);
        expect(() => sim.getEdits(2)).toThrow(RangeError);
        const rewritten = sim.getCurrentSnapshot();
        const countCalls = calls;
        sim.backward();
        expect(sim.getCurrentSnapshot().config.cpuCount).toBe(4);
        sim.forward();
        expect(sim.getCurrentSnapshot()).toBe(rewritten);
        expect(calls).toBe(countCalls);
        tick(sim);
        expect(sim.getCurrentSnapshot().config.cpuCount).toBe(1);
    });
});
