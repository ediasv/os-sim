import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { createSimulator } from './createSimulator';
import { findInconsistencies } from './consistency';
import { rmPolicy } from './policies';
import { SimulationRefusal } from './refusal';
import { Simulator } from './simulator';

const task = (
    id = '1',
    changes: Partial<TaskDefinition> = {},
): TaskDefinition => ({
    id,
    color: id === '1' ? '112233' : '445566',
    arrival: 0,
    duration: 2,
    period: 4,
    deadline: 4,
    rawEvents: '',
    ...changes,
});
const configOf = (
    tasks: TaskDefinition[],
    changes: Partial<SystemConfig> = {},
): SystemConfig => ({ ...DEFAULT_CONFIG, tasks, ...changes });
const make = (tasks = [task()], changes: Partial<SystemConfig> = {}) =>
    createSimulator(configOf(tasks, changes));

/** Two tied tasks, so the run draws and the draw state travels in snapshots. */
const tiedTasks = [task('1'), task('2')];
const countingPolicy = () => {
    const counter = { calls: 0 };
    return {
        counter,
        policy: {
            ...rmPolicy,
            select: (...args: Parameters<typeof rmPolicy.select>) => {
                counter.calls++;
                return rmPolicy.select(...args);
            },
        },
    };
};

/** Suspends task 1 at tick 2: it keeps activating up to ten jobs but never runs them. */
function suspendedAtTwo() {
    const sim = make([task('1', { duration: 5, period: 2, deadline: 3 })]);
    sim.tick();
    sim.tick();
    sim.edit([{ kind: 'taskState', taskId: '1', state: 'suspended' }]);
    return sim;
}

describe('getProgress', () => {
    it('can advance while a task has not arrived yet, even with idle CPUs', () => {
        const sim = make([task('1', { arrival: 6 })]);
        expect(sim.getEligibleJobs()).toEqual([]);
        expect(sim.getProgress()).toEqual({ kind: 'running' });
    });

    it('is finished when every task is finished', () => {
        const sim = make([task('1', { duration: 1, period: 2 })]);
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(sim.getProgress()).toEqual({ kind: 'finished' });
    });

    it('keeps waiting for the activations of a suspended task, then reports the block', () => {
        const sim = suspendedAtTwo();
        for (let i = 0; i < 8; i++) sim.tick();
        expect(sim.getCurrentSnapshot().clock).toBe(10);
        expect(sim.getProgress()).toEqual({ kind: 'running' });
    });

    it('does not count the pending activation of a concluded task', () => {
        const sim = make([task('1', { duration: 5, period: 2, deadline: 3 })]);
        sim.tick();
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'concluded' }]);
        expect(sim.getCurrentSnapshot().tasks[0].nextActivation).not.toBeNull();
        expect(sim.getProgress()).toEqual({ kind: 'finished' });
    });
});

describe('runAll', () => {
    it('reaches the same final snapshot, cursor and history as manual ticks', () => {
        const manual = make(tiedTasks);
        const auto = make(tiedTasks);
        const result = auto.runAll();
        expect(result.kind).toBe('completed');
        const last = auto.getLatestSnapshot();
        expect(result.snapshot).toBe(last);
        for (let i = 0; i < last.clock; i++) manual.tick();
        expect(manual.getLatestSnapshot()).toEqual(last);
        expect(auto.getCursor()).toBe(last.clock);
        for (let k = 0; k <= last.clock; k++) {
            auto.restore(k);
            manual.restore(k);
            expect(auto.getCurrentSnapshot()).toEqual(
                manual.getCurrentSnapshot(),
            );
        }
        expect(last.events.some((event) => event.kind === 'tie-break')).toBe(
            true,
        );
        expect(findInconsistencies(last)).toEqual([]);
    });

    it('starting in the past reuses the recorded future without calling the policy again', () => {
        const reference = countingPolicy();
        const full = new Simulator(configOf(tiedTasks), reference.policy);
        full.runAll();
        const expected = full.getLatestSnapshot();

        const replay = countingPolicy();
        const sim = new Simulator(configOf(tiedTasks), replay.policy);
        for (let i = 0; i < 5; i++) sim.tick();
        sim.restore(2);
        const callsBefore = replay.counter.calls;
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(sim.getLatestSnapshot()).toEqual(expected);
        expect(sim.getCursor()).toBe(expected.clock);
        // Only the steps after the fifth were computed; the first five were reused.
        expect(replay.counter.calls).toBe(reference.counter.calls);
        expect(callsBefore).toBeLessThan(replay.counter.calls);
    });

    it('goes through idle CPUs up to a future activation', () => {
        const sim = make([task('1', { arrival: 6, duration: 1 })], {
            cpuCount: 2,
        });
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(result.snapshot.clock).toBeGreaterThan(6);
        expect(result.snapshot.tasks[0].jobs).toHaveLength(10);
    });

    it('reports a block with tick, reason and jobs once nothing can run or arrive', () => {
        const sim = suspendedAtTwo();
        const result = sim.runAll();
        if (result.kind !== 'blocked') throw new Error('expected a block');
        expect(result.tick).toBe(18);
        expect(result.snapshot).toBe(sim.getLatestSnapshot());
        expect(result.snapshot.clock).toBe(18);
        expect(result.reason).toContain('18');
        expect(result.jobs).toHaveLength(10);
        expect(result.jobs[0]).toEqual({ taskId: '1', index: 0 });
        expect(sim.getCursor()).toBe(18);
        expect(findInconsistencies(result.snapshot)).toEqual([]);
    });

    it('resumes after the user edits the block away', () => {
        const sim = suspendedAtTwo();
        expect(sim.runAll().kind).toBe('blocked');
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'ready' }]);
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(findInconsistencies(result.snapshot)).toEqual([]);
    });

    it('finishes without a new tick when every task is already finished', () => {
        const sim = make();
        sim.runAll();
        const length = sim.getLatestSnapshot();
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(sim.getLatestSnapshot()).toBe(length);
    });

    it('ends when a concluded task still has a pending activation', () => {
        const sim = make([
            task('1', { duration: 5, period: 2, deadline: 3 }),
            task('2', { duration: 1, period: 4 }),
        ]);
        sim.tick();
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'concluded' }]);
        const result = sim.runAll();
        expect(result.kind).toBe('completed');
        expect(findInconsistencies(result.snapshot)).toEqual([]);
    });

    it('leaves the last confirmed step when the policy fails mid-run', () => {
        let calls = 0;
        const policy = {
            ...rmPolicy,
            select: (...args: Parameters<typeof rmPolicy.select>) => {
                if (++calls === 4) throw new Error('policy failure');
                return rmPolicy.select(...args);
            },
        };
        const sim = new Simulator(configOf(tiedTasks), policy);
        expect(() => sim.runAll()).toThrow('policy failure');
        const confirmed = sim.getLatestSnapshot();
        // Call 1 dispatched tick 0, so the failing 4th call belongs to step 3.
        expect(confirmed.clock).toBe(2);
        expect(sim.getCursor()).toBe(2);
        expect(sim.getCurrentSnapshot()).toBe(confirmed);
        expect(findInconsistencies(confirmed)).toEqual([]);
    });
});

describe('tick once everything has finished', () => {
    it('is refused without changing snapshot, cursor or history', () => {
        const sim = make();
        sim.runAll();
        const last = sim.getLatestSnapshot();
        const cursor = sim.getCursor();
        expect(() => sim.tick()).toThrow(SimulationRefusal);
        expect(() => sim.tick()).toThrow(/terminaram/);
        expect(sim.getLatestSnapshot()).toBe(last);
        expect(sim.getCursor()).toBe(cursor);
        sim.restore(cursor - 1);
        expect(() => sim.tick()).toThrow(/forward/);
    });
});
