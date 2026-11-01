import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import {
    DEFAULT_CONFIG,
    type Job,
    type SimulationState,
    type TaskDefinition,
} from './domain';
import { createInitialState, takeSnapshot } from './snapshot';

const definition: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
};

function job(overrides: Partial<Job> = {}): Job {
    return {
        taskId: 1,
        index: 0,
        activation: 0,
        absoluteDeadline: 5,
        executed: 0,
        state: 'ready',
        completedAt: null,
        deadlineMissed: false,
        ...overrides,
    };
}

/** Two CPUs and one task holding the given jobs; nothing assigned yet. */
function stateWith(...jobs: Job[]): SimulationState {
    const state = createInitialState({
        ...DEFAULT_CONFIG,
        cpuCount: 2,
        tasks: [definition],
    });
    state.tasks[0].jobs.push(...jobs);
    return state;
}

describe('findInconsistencies: running state', () => {
    it('accepts a running job owned by exactly one CPU', () => {
        const state = stateWith(job({ state: 'running' }));
        state.cpus[0].running = { taskId: 1, index: 0 };

        expect(findInconsistencies(state)).toEqual([]);
    });

    it('reports a running job that no CPU owns', () => {
        const state = stateWith(job({ state: 'running' }));

        expect(findInconsistencies(state)).toHaveLength(1);
    });

    it.each(['ready', 'suspended', 'completed'] as const)(
        'reports a CPU running a job whose state is %s',
        (jobState) => {
            const state = stateWith(job({ state: jobState }));
            state.cpus[0].running = { taskId: 1, index: 0 };

            expect(findInconsistencies(state)).toHaveLength(1);
        },
    );

    it('reports a job owned by two CPUs in the same tick', () => {
        const state = stateWith(job({ state: 'running' }));
        state.cpus[0].running = { taskId: 1, index: 0 };
        state.cpus[1].running = { taskId: 1, index: 0 };

        expect(findInconsistencies(state)).toHaveLength(1);
    });

    it('reports a CPU running a job that does not exist', () => {
        const state = stateWith();
        state.cpus[0].running = { taskId: 1, index: 0 };

        expect(findInconsistencies(state)).toHaveLength(1);
    });
});

describe('findInconsistencies: missed deadlines', () => {
    it('accepts a missed deadline recorded once as an event', () => {
        const state = stateWith(job({ deadlineMissed: true }));
        state.events.push({
            kind: 'deadline-miss',
            time: 5,
            job: { taskId: 1, index: 0 },
        });

        expect(findInconsistencies(state)).toEqual([]);
    });

    it('reports a missed deadline without its event', () => {
        const state = stateWith(job({ deadlineMissed: true }));

        expect(findInconsistencies(state)).toHaveLength(1);
    });

    it('reports a deadline-miss event for a job not marked as missed', () => {
        const state = stateWith(job());
        state.events.push({
            kind: 'deadline-miss',
            time: 5,
            job: { taskId: 1, index: 0 },
        });

        expect(findInconsistencies(state)).toHaveLength(1);
    });

    it('reports a missed deadline recorded more than once (DEC-04)', () => {
        const state = stateWith(job({ deadlineMissed: true }));
        for (const time of [5, 6]) {
            state.events.push({
                kind: 'deadline-miss',
                time,
                job: { taskId: 1, index: 0 },
            });
        }

        expect(findInconsistencies(state)).toHaveLength(1);
    });

    it('reports a deadline-miss event for a job that does not exist', () => {
        const state = stateWith();
        state.events.push({
            kind: 'deadline-miss',
            time: 5,
            job: { taskId: 1, index: 0 },
        });

        expect(findInconsistencies(state)).toHaveLength(1);
    });
});

describe('findInconsistencies: CPU power (DEC-21)', () => {
    it('accepts offSince matching the open cpu-off interval', () => {
        const state = stateWith();
        state.clock = 3;
        state.cpus[0].offSince = 3;
        state.events.push(
            { kind: 'cpu-off', time: 0, cpuId: 1 },
            { kind: 'cpu-on', time: 2, cpuId: 1 },
            { kind: 'cpu-off', time: 3, cpuId: 1 },
        );

        expect(findInconsistencies(state)).toEqual([]);
    });

    it('reports offSince that disagrees with the last cpu-off event', () => {
        const state = stateWith();
        state.clock = 3;
        state.cpus[0].offSince = 2;
        state.events.push({ kind: 'cpu-off', time: 3, cpuId: 1 });

        expect(findInconsistencies(state)).toEqual([
            'CPU 1 has offSince = 2 but its open off interval starts at 3.',
        ]);
    });

    it('reports a CPU off by events but with offSince null', () => {
        const state = stateWith();
        state.events.push({ kind: 'cpu-off', time: 0, cpuId: 1 });

        expect(findInconsistencies(state)).toEqual([
            'CPU 1 has offSince = null but its open off interval starts at 0.',
        ]);
    });

    it('reports offSince set on a CPU that events show as on', () => {
        const state = stateWith();
        state.cpus[1].offSince = 0;

        expect(findInconsistencies(state)).toEqual([
            'CPU 2 has offSince = 0 but no open off interval.',
        ]);
    });

    it('reports a CPU running a job while marked off', () => {
        const state = stateWith(job({ state: 'running' }));
        state.cpus[0].running = { taskId: 1, index: 0 };
        state.cpus[0].offSince = 0;
        state.events.push({ kind: 'cpu-off', time: 0, cpuId: 1 });

        expect(findInconsistencies(state)).toEqual([
            'CPU 1 runs job 1.0 but is off since 0.',
        ]);
    });

    it('reports a malformed cpu-off/cpu-on sequence', () => {
        const state = stateWith();
        state.clock = 1;
        state.events.push({ kind: 'cpu-on', time: 1, cpuId: 1 });

        expect(findInconsistencies(state)).toEqual([
            'CPU 1 turned on at 1 while not off.',
        ]);
    });

    it('lets an error other than a malformed sequence propagate', () => {
        const state = stateWith();
        // Only summarizeCpuOff reads `time`, so this stands in for a bug there.
        state.events.push({
            kind: 'cpu-off',
            cpuId: 1,
            get time(): number {
                throw new TypeError('boom');
            },
        });

        expect(() => findInconsistencies(state)).toThrow(TypeError);
    });
});

describe('findInconsistencies: execution budget', () => {
    it('reports a job that executed more ticks than its duration', () => {
        const state = stateWith(job({ executed: 3 }));

        expect(findInconsistencies(state)).toContain(
            'Job 1.0 executed 3 ticks, more than its duration of 2.',
        );
    });

    it('accepts a job that executed exactly its duration', () => {
        const state = stateWith(
            job({ executed: 2, state: 'completed', completedAt: 2 }),
        );

        expect(findInconsistencies(state)).toEqual([]);
    });
});

describe('findInconsistencies: inputs', () => {
    it('accepts the initial state and frozen snapshots', () => {
        const state = stateWith(
            job({ state: 'running', deadlineMissed: true }),
            job({ index: 1, activation: 5, absoluteDeadline: 10 }),
        );
        state.cpus[1].running = { taskId: 1, index: 0 };
        state.events.push({
            kind: 'deadline-miss',
            time: 5,
            job: { taskId: 1, index: 0 },
        });

        expect(findInconsistencies(stateWith())).toEqual([]);
        expect(findInconsistencies(takeSnapshot(state))).toEqual([]);
    });

    it('collects every inconsistency instead of stopping at the first', () => {
        const state = stateWith(
            job({ state: 'running' }),
            job({ index: 1, deadlineMissed: true }),
        );

        expect(findInconsistencies(state)).toHaveLength(2);
    });
});

describe('CPU existence consistency', () => {
    it('accepts historical removed IDs and compares current offSince by ID', () => {
        const state = createInitialState({ ...DEFAULT_CONFIG, cpuCount: 1 });
        state.clock = 4;
        state.cpus[0].offSince = 1;
        state.events.push(
            { kind: 'cpu-off', time: 0, cpuId: 2 },
            { kind: 'cpu-off', time: 1, cpuId: 1 },
            { kind: 'cpu-removed', time: 2, cpuId: 2 },
        );
        expect(findInconsistencies(state)).toEqual([]);
        state.cpus[0].offSince = 2;
        expect(findInconsistencies(state)).toContain(
            'CPU 1 has offSince = 2 but its open off interval starts at 1.',
        );
    });

    it('rejects CPU count or IDs inconsistent with configuration', () => {
        const state = createInitialState(DEFAULT_CONFIG);
        state.cpus.push({
            id: 3,
            running: null,
            sliceElapsed: 0,
            offSince: null,
        });
        expect(findInconsistencies(state).length).toBeGreaterThan(0);
    });
});

describe('findInconsistencies: CPU count and IDs', () => {
    const message =
        'Current CPU IDs must be 1..cpuCount and match the configured count.';

    it('accepts CPUs 1..cpuCount', () => {
        expect(findInconsistencies(stateWith())).not.toContain(message);
    });

    it('reports a length that differs from the configured count', () => {
        const state = stateWith();
        state.cpus.pop();

        expect(findInconsistencies(state)).toContain(message);
    });

    it.each([
        ['non-contiguous', [1, 3]],
        ['shuffled', [2, 1]],
        ['duplicated', [1, 1]],
    ])('reports %s IDs with the right length', (_name, ids) => {
        const state = stateWith();
        state.cpus = state.cpus.map((cpu, index) => ({
            ...cpu,
            id: ids[index],
        }));

        expect(findInconsistencies(state)).toContain(message);
    });
});
