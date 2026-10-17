import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    MAX_PERIODIC_JOBS,
    maxJobs,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { createInitialState, takeSnapshot } from './snapshot';

const periodic: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
};
const aperiodic: TaskDefinition = {
    ...periodic,
    id: 2,
    color: '000000',
    period: 0,
};

const twoCpus: SystemConfig = {
    ...DEFAULT_CONFIG,
    cpuCount: 2,
    tasks: [periodic, aperiodic],
};

describe('maxJobs', () => {
    it('allows ten jobs for a periodic task and one for an aperiodic task', () => {
        expect(MAX_PERIODIC_JOBS).toBe(10);
        expect(maxJobs(periodic)).toBe(10);
        expect(maxJobs(aperiodic)).toBe(1);
    });
});

describe('createInitialState', () => {
    it('starts at tick 0 with one TCB per task, in configuration order, and no jobs yet', () => {
        const state = createInitialState(twoCpus);

        expect(state.clock).toBe(0);
        expect(state.config).toBe(twoCpus);
        expect(state.tasks.map((tcb) => tcb.definition)).toEqual([
            periodic,
            aperiodic,
        ]);
        expect(state.tasks.every((tcb) => tcb.jobs.length === 0)).toBe(true);
        expect(state.executions).toEqual([]);
        expect(state.events).toEqual([]);
    });

    it('creates CPUs numbered from 1, off since tick zero and with an empty slice', () => {
        const state = createInitialState(twoCpus);

        expect(state.cpus).toEqual([
            { id: 1, running: null, sliceElapsed: 0, offSince: 0 },
            { id: 2, running: null, sliceElapsed: 0, offSince: 0 },
        ]);
    });
});

describe('takeSnapshot', () => {
    function stateWithJob() {
        const state = createInitialState(twoCpus);
        state.tasks[0].jobs.push({
            taskId: 1,
            index: 0,
            activation: 0,
            absoluteDeadline: 5,
            executed: 0,
            state: 'running',
            completedAt: null,
            deadlineMissed: false,
        });
        state.cpus[0].running = { taskId: 1, index: 0 };
        state.events.push({
            kind: 'activation',
            time: 0,
            job: { taskId: 1, index: 0 },
        });
        return state;
    }

    it('copies the whole state', () => {
        const state = stateWithJob();
        expect(takeSnapshot(state)).toEqual(state);
    });

    it('does not change when the live state changes afterwards', () => {
        const state = stateWithJob();
        const snapshot = takeSnapshot(state);

        state.clock = 1;
        state.tasks[0].jobs[0].executed = 1;
        state.cpus[0].running = null;
        state.events.push({ kind: 'cpu-off', time: 1, cpuId: 2 });

        expect(snapshot.clock).toBe(0);
        expect(snapshot.tasks[0].jobs[0].executed).toBe(0);
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(snapshot.events).toHaveLength(1);
    });

    it('is deeply frozen, so consumers cannot write into it', () => {
        const snapshot = takeSnapshot(stateWithJob());

        expect(() => {
            (snapshot as { clock: number }).clock = 9;
        }).toThrow(TypeError);
        expect(() => {
            (snapshot.tasks[0].jobs[0] as { executed: number }).executed = 9;
        }).toThrow(TypeError);
        expect(() => {
            (snapshot.events as unknown[]).push({});
        }).toThrow(TypeError);
        expect(Object.isFrozen(snapshot.config.tasks[0])).toBe(true);
    });

    it('shares no object with the live state', () => {
        const state = stateWithJob();
        const snapshot = takeSnapshot(state);

        expect(snapshot.tasks).not.toBe(state.tasks);
        expect(snapshot.tasks[0]).not.toBe(state.tasks[0]);
        expect(snapshot.tasks[0].jobs[0]).not.toBe(state.tasks[0].jobs[0]);
        expect(snapshot.cpus[0].running).not.toBe(state.cpus[0].running);
        expect(snapshot.events[0]).not.toBe(state.events[0]);
    });
});
