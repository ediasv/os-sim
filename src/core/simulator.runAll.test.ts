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

/** Suspends task 1 at tick 2: the last unfinished task can no longer run (DEC-52). */
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

    it('reports suspension as soon as every unfinished task is suspended, activations left or not', () => {
        const sim = suspendedAtTwo();
        expect(sim.getCurrentSnapshot().tasks[0].nextActivation).not.toBeNull();
        expect(sim.getProgress()).toEqual({
            kind: 'suspended',
            taskIds: ['1'],
            jobs: [
                { taskId: '1', index: 0 },
                { taskId: '1', index: 1 },
            ],
        });
    });

    it('keeps running while an unsuspended task still has work', () => {
        const sim = make([
            task('1', { duration: 5, period: 2, deadline: 3 }),
            task('2', { duration: 3, period: 0, deadline: 10, arrival: 6 }),
        ]);
        sim.tick();
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'suspended' }]);
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

    it('stops at once when the last unfinished task is suspended, telling to resume it', () => {
        const sim = suspendedAtTwo();
        const result = sim.runAll();
        if (result.kind !== 'blocked') throw new Error('expected a block');
        expect(result.tick).toBe(2);
        expect(result.snapshot).toBe(sim.getLatestSnapshot());
        expect(result.snapshot.clock).toBe(2);
        expect(result.reason).toContain('tick 2');
        expect(result.reason).toContain('última tarefa restante (tarefa 1)');
        expect(result.reason).toContain('suspensa');
        expect(result.reason).toContain('Pronta');
        expect(result.jobs).toEqual([
            { taskId: '1', index: 0 },
            { taskId: '1', index: 1 },
        ]);
        expect(sim.getCursor()).toBe(2);
        expect(findInconsistencies(result.snapshot)).toEqual([]);
    });

    it('names every remaining task when all of them are suspended', () => {
        const sim = make([task('1'), task('2')]);
        sim.tick();
        sim.edit([
            { kind: 'taskState', taskId: '1', state: 'suspended' },
            { kind: 'taskState', taskId: '2', state: 'suspended' },
        ]);
        const result = sim.runAll();
        if (result.kind !== 'blocked') throw new Error('expected a block');
        expect(result.reason).toContain('tarefas restantes (1, 2)');
        expect(result.reason).toContain('suspensas');
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

    it('pauses with the cursor at the last computed step when the budget runs out', () => {
        const sim = make(tiedTasks);
        const result = sim.runAll({ maxSteps: 3 });
        if (result.kind !== 'paused') throw new Error('expected a pause');
        expect(result.snapshot.clock).toBe(3);
        expect(sim.getCursor()).toBe(3);
        expect(sim.getLatestSnapshot()).toBe(result.snapshot);
        expect(sim.getProgress()).toEqual({ kind: 'running' });
    });

    it('resumed in chunks, reaches the same history as one uninterrupted run', () => {
        const whole = make(tiedTasks);
        whole.runAll();
        const chunked = make(tiedTasks);
        let result = chunked.runAll({ maxSteps: 2 });
        while (result.kind === 'paused')
            result = chunked.runAll({ maxSteps: 2 });
        expect(result.kind).toBe('completed');
        expect(chunked.getLatestSnapshot()).toEqual(whole.getLatestSnapshot());
        expect(chunked.getCursor()).toBe(whole.getCursor());
        for (let k = 0; k <= whole.getCursor(); k++) {
            chunked.restore(k);
            whole.restore(k);
            expect(chunked.getCurrentSnapshot()).toEqual(
                whole.getCurrentSnapshot(),
            );
        }
    });

    it('completes without spending the budget when the run is already finished', () => {
        const sim = make();
        sim.runAll();
        const result = sim.runAll({ maxSteps: 1 });
        expect(result.kind).toBe('completed');
    });

    it('reports a block within the budget instead of pausing', () => {
        const sim = suspendedAtTwo();
        const result = sim.runAll({ maxSteps: 1000 });
        expect(result.kind).toBe('blocked');
    });

    it('rejects a budget that is not a positive integer without changing the run', () => {
        const sim = make(tiedTasks);
        for (const maxSteps of [0, -1, 1.5, Number.NaN]) {
            expect(() => sim.runAll({ maxSteps })).toThrow(RangeError);
        }
        expect(sim.getCursor()).toBe(0);
        expect(sim.getLatestSnapshot().clock).toBe(0);
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

describe('tick once every unfinished task is suspended', () => {
    it('is refused with the resume hint, and allowed again after resuming', () => {
        const sim = suspendedAtTwo();
        const last = sim.getLatestSnapshot();
        expect(() => sim.tick()).toThrow(SimulationRefusal);
        expect(() => sim.tick()).toThrow(/última tarefa restante \(tarefa 1\)/);
        expect(sim.getLatestSnapshot()).toBe(last);
        expect(sim.getCursor()).toBe(2);
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'ready' }]);
        sim.tick();
        expect(sim.getCursor()).toBe(3);
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
