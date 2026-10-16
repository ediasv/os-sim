import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type Job,
    type JobRef,
    type SimulationState,
    type TaskDefinition,
} from './domain';
import {
    buildPolicyView,
    checkDecision,
    type PolicyView,
    type SchedulingPolicy,
} from './policy';
import { createInitialState, takeSnapshot } from './snapshot';

const first: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
};
const second: TaskDefinition = {
    ...first,
    id: 2,
    color: '000000',
    duration: 3,
    period: 0,
    deadline: 4,
};

function job(taskId: number, overrides: Partial<Job> = {}): Job {
    return {
        taskId,
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

/**
 * Two CPUs and two tasks at tick 3: job 1.0 runs on CPU 2 and job 2.0 waits.
 * Built by hand because activation and dispatch belong to the engine (#12, #13).
 */
function runningState(): SimulationState {
    const state = createInitialState({
        ...DEFAULT_CONFIG,
        cpuCount: 2,
        tasks: [first, second],
    });
    state.clock = 3;
    state.tasks[0].jobs.push(job(1, { state: 'running', executed: 1 }));
    state.tasks[1].jobs.push(job(2, { absoluteDeadline: 4 }));
    state.cpus[1].running = { taskId: 1, index: 0 };
    return state;
}

const both: JobRef[] = [
    { taskId: 1, index: 0 },
    { taskId: 2, index: 0 },
];

describe('buildPolicyView', () => {
    it('builds one candidate per eligible ref with its job, task definition and previous CPU', () => {
        const state = runningState();

        const view = buildPolicyView(state, both);

        expect(view.clock).toBe(3);
        expect(view.cpuCount).toBe(2);
        expect(view.candidates.map((c) => c.previousCpu)).toEqual([2, null]);
        expect(view.candidates.map((c) => c.task)).toEqual([first, second]);
        expect(view.candidates.map((c) => c.job)).toEqual([
            state.tasks[0].jobs[0],
            state.tasks[1].jobs[0],
        ]);
    });

    it('returns an empty candidate list when nothing is eligible', () => {
        const view = buildPolicyView(runningState(), []);

        expect(view.candidates).toEqual([]);
    });

    it('freezes the whole view', () => {
        const state = runningState();
        const view = buildPolicyView(state, both);
        const candidate = view.candidates[0];

        expect(Object.isFrozen(view)).toBe(true);
        expect(Object.isFrozen(view.candidates)).toBe(true);
        expect(Object.isFrozen(candidate)).toBe(true);
        expect(Object.isFrozen(candidate.job)).toBe(true);
        expect(Object.isFrozen(candidate.task)).toBe(true);
        expect(() => {
            (candidate.job as Job).executed = 9;
        }).toThrow(TypeError);
        expect(() => {
            (view.candidates as unknown[]).push(candidate);
        }).toThrow(TypeError);
        expect(state.tasks[0].jobs[0].executed).toBe(1);
    });

    it('does not change when live state changes afterwards', () => {
        const state = runningState();
        const view = buildPolicyView(state, both);

        state.tasks[0].jobs[0].executed = 2;
        state.cpus[1].running = null;

        expect(view.candidates[0].job.executed).toBe(1);
        expect(view.candidates[0].previousCpu).toBe(2);
    });

    it.each<[string, RegExp, (state: SimulationState) => JobRef[]]>([
        [
            'does not exist',
            /3\.0 does not exist/,
            () => [{ taskId: 3, index: 0 }],
        ],
        [
            'has no such activation',
            /1\.1 does not exist/,
            () => [{ taskId: 1, index: 1 }],
        ],
        [
            'is completed',
            /2\.0 has already completed/,
            (state) => {
                state.tasks[1].jobs[0].state = 'completed';
                state.tasks[1].jobs[0].completedAt = 3;
                return [{ taskId: 2, index: 0 }];
            },
        ],
        [
            'is suspended',
            /2\.0 is suspended/,
            (state) => {
                state.tasks[1].jobs[0].state = 'suspended';
                return [{ taskId: 2, index: 0 }];
            },
        ],
        [
            'is repeated',
            /2\.0 is listed twice/,
            () => [both[1], { ...both[1] }],
        ],
    ])('throws for an eligible ref that %s', (_, message, eligible) => {
        const state = runningState();
        const refs = eligible(state);

        expect(() => buildPolicyView(state, refs)).toThrow(message);
    });
});

/** View over `count` waiting jobs (tasks 1..count) on two CPUs. */
function viewOf(count: number): PolicyView {
    const tasks = Array.from({ length: count }, (_, i) => ({
        ...first,
        id: i + 1,
    }));
    const state = createInitialState({ ...DEFAULT_CONFIG, cpuCount: 2, tasks });
    state.tasks.forEach((tcb) => tcb.jobs.push(job(tcb.definition.id)));
    return buildPolicyView(
        state,
        tasks.map((t) => ({ taskId: t.id, index: 0 })),
    );
}

const ref = (taskId: number): JobRef => ({ taskId, index: 0 });

describe('checkDecision', () => {
    it.each([
        [3, [ref(1), ref(3)]],
        [1, [ref(1)]],
        [0, []],
    ])(
        'accepts min(cpuCount, candidates) distinct candidates (%i candidates)',
        (count, selected) => {
            expect(checkDecision(viewOf(count), { selected })).toEqual([]);
        },
    );

    it('reports a selected job that is not a candidate', () => {
        const issues = checkDecision(viewOf(2), {
            selected: [ref(1), ref(4)],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/4\.0/);
    });

    it('reports a job selected twice', () => {
        const issues = checkDecision(viewOf(2), {
            selected: [ref(2), ref(2)],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/2\.0/);
    });

    it('reports more jobs selected than CPUs', () => {
        const issues = checkDecision(viewOf(3), {
            selected: [ref(1), ref(2), ref(3)],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/expected 2.*got 3/);
    });

    it('reports too few jobs selected while CPUs are free (REQ-02)', () => {
        const issues = checkDecision(viewOf(2), { selected: [ref(1)] });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/expected 2.*got 1/);
    });
});

describe('SchedulingPolicy', () => {
    it('chooses from the view without touching the live state', () => {
        const state = runningState();
        const before = takeSnapshot(state);
        const firstFit: SchedulingPolicy = {
            select: (view) => ({
                selected: view.candidates
                    .slice(0, view.cpuCount)
                    .map(({ job }) => ({
                        taskId: job.taskId,
                        index: job.index,
                    })),
            }),
        };

        const view = buildPolicyView(state, both);
        const decision = firstFit.select(view);

        expect(checkDecision(view, decision)).toEqual([]);
        expect(state).toEqual(before);
    });
});
