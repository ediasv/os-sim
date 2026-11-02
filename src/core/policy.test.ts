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
    selectedRefs,
    type PolicyView,
    type SchedulingPolicy,
} from './policy';
import { createInitialState, takeSnapshot } from './snapshot';

const first: TaskDefinition = {
    id: '1',
    color: 'F0E0D0',
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
};
const second: TaskDefinition = {
    ...first,
    id: '2',
    color: '000000',
    duration: 3,
    period: 0,
    deadline: 4,
};

function job(taskId: string, overrides: Partial<Job> = {}): Job {
    return {
        taskId,
        index: 0,
        activation: 0,
        absoluteDeadline: 5,
        duration: taskId === '1' ? first.duration : second.duration,
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
    state.tasks[0].jobs.push(job('1', { state: 'running', executed: 1 }));
    state.tasks[1].jobs.push(job('2', { absoluteDeadline: 4 }));
    state.cpus[1].running = { taskId: '1', index: 0 };
    return state;
}

const both: JobRef[] = [
    { taskId: '1', index: 0 },
    { taskId: '2', index: 0 },
];

describe('buildPolicyView', () => {
    it('keeps execution precedence after its CPU disappears', () => {
        const state = runningState();
        state.clock = 1;
        state.cpus = [state.cpus[0]];
        state.config = { ...state.config, cpuCount: 1 };
        state.executions.push({ cpuId: 2, job: both[1], start: 0, end: 1 });
        const view = buildPolicyView(state, both);
        expect(view.candidates.map((c) => c.wasRunning)).toEqual([false, true]);
        expect(view.candidates[1].previousCpu).toBeNull();
        expect(Object.isFrozen(view.candidates[1])).toBe(true);
        state.executions.length = 0;
        expect(view.candidates[1].wasRunning).toBe(true);
    });

    it('does not count old executions or CPU ownership before the first tick', () => {
        const state = runningState();
        state.executions.push({ cpuId: 2, job: both[0], start: 0, end: 2 });
        expect(
            buildPolicyView(state, both).candidates.map((c) => c.wasRunning),
        ).toEqual([false, false]);
        state.clock = 0;
        expect(
            buildPolicyView(state, both).candidates.map((c) => c.wasRunning),
        ).toEqual([false, false]);
    });

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
            () => [{ taskId: '3', index: 0 }],
        ],
        [
            'has no such activation',
            /1\.1 does not exist/,
            () => [{ taskId: '1', index: 1 }],
        ],
        [
            'is completed',
            /2\.0 has already completed/,
            (state) => {
                state.tasks[1].jobs[0].state = 'completed';
                state.tasks[1].jobs[0].completedAt = 3;
                return [{ taskId: '2', index: 0 }];
            },
        ],
        [
            'is interrupted',
            /2\.0 is interrupted/,
            (state) => {
                state.tasks[1].jobs[0].state = 'interrupted';
                return [{ taskId: '2', index: 0 }];
            },
        ],
        [
            'is suspended',
            /2\.0 is suspended/,
            (state) => {
                state.tasks[1].jobs[0].state = 'suspended';
                return [{ taskId: '2', index: 0 }];
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
        id: String(i + 1),
    }));
    const state = createInitialState({ ...DEFAULT_CONFIG, cpuCount: 2, tasks });
    state.tasks.forEach((tcb) => tcb.jobs.push(job(tcb.definition.id)));
    return buildPolicyView(
        state,
        tasks.map((t) => ({ taskId: t.id, index: 0 })),
    );
}

const ref = (taskId: string): JobRef => ({ taskId, index: 0 });

describe('checkDecision', () => {
    it.each([
        [3, [ref('1'), ref('3')]],
        [1, [ref('1')]],
        [0, []],
    ])(
        'accepts min(cpuCount, candidates) distinct candidates (%i candidates)',
        (count, selected) => {
            expect(checkDecision(viewOf(count), { selected })).toEqual([]);
        },
    );

    it('reports a selected job that is not a candidate', () => {
        const issues = checkDecision(viewOf(2), {
            selected: [ref('1'), ref('4')],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/4\.0/);
    });

    it('reports a job selected twice', () => {
        const issues = checkDecision(viewOf(2), {
            selected: [ref('2'), ref('2')],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/2\.0/);
    });

    it('reports more jobs selected than CPUs', () => {
        const issues = checkDecision(viewOf(3), {
            selected: [ref('1'), ref('2'), ref('3')],
        });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/expected 2.*got 3/);
    });

    it('reports too few jobs selected while CPUs are free (REQ-02)', () => {
        const issues = checkDecision(viewOf(2), { selected: [ref('1')] });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/expected 2.*got 1/);
    });

    it('reports too few jobs selected when candidates are fewer than CPUs (REQ-02)', () => {
        const issues = checkDecision(viewOf(1), { selected: [] });

        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatch(/expected 1.*got 0/);
    });

    it('reports every problem of one decision together', () => {
        const issues = checkDecision(viewOf(3), {
            selected: [ref('1'), ref('1'), ref('4')],
        });

        expect(issues).toHaveLength(3);
        expect(issues[0]).toMatch(/1\.0 is selected more than once/);
        expect(issues[1]).toMatch(/4\.0 is not a candidate/);
        expect(issues[2]).toMatch(/expected 2, got 3/);
    });

    describe('with a residual tie (DEC-27)', () => {
        it.each([
            ['part of the cut', [ref('1')], [ref('2'), ref('3')], 1],
            ['the whole cut', [], [ref('1'), ref('2'), ref('3')], 2],
        ])('accepts a tie covering %s', (_, selected, candidates, slots) => {
            expect(
                checkDecision(viewOf(3), {
                    selected,
                    tie: { candidates, slots },
                }),
            ).toEqual([]);
        });

        it('reports a tied job that is not a candidate', () => {
            expect(
                checkDecision(viewOf(3), {
                    selected: [ref('1')],
                    tie: { candidates: [ref('2'), ref('9')], slots: 1 },
                }),
            ).toEqual([
                'Tied job 9.0 is not a candidate.',
                'Tie must leave out at least one job: 1 slots for 1 tied jobs.',
            ]);
        });

        it('reports a job tied more than once', () => {
            expect(
                checkDecision(viewOf(3), {
                    selected: [ref('1')],
                    tie: {
                        candidates: [ref('2'), ref('3'), ref('2')],
                        slots: 1,
                    },
                }),
            ).toEqual(['Job 2.0 is tied more than once.']);
        });

        it('reports a job both selected and tied', () => {
            expect(
                checkDecision(viewOf(3), {
                    selected: [ref('1')],
                    tie: { candidates: [ref('1'), ref('2')], slots: 1 },
                }),
            ).toEqual([
                'Job 1.0 is both selected and tied.',
                'Tie must leave out at least one job: 1 slots for 1 tied jobs.',
            ]);
        });

        it('reports a tie that fills no CPU', () => {
            expect(
                checkDecision(viewOf(4), {
                    selected: [ref('1'), ref('2')],
                    tie: { candidates: [ref('3'), ref('4')], slots: 0 },
                }),
            ).toEqual(['Tie must fill at least one CPU, got 0 slots.']);
        });

        it('reports a fractional number of slots', () => {
            expect(
                checkDecision(viewOf(3), {
                    selected: [ref('1')],
                    tie: { candidates: [ref('2'), ref('3')], slots: 1.5 },
                }),
            ).toContain('Tie must fill at least one CPU, got 1.5 slots.');
        });

        it('reports a tie that leaves no job out', () => {
            expect(
                checkDecision(viewOf(3), {
                    selected: [],
                    tie: { candidates: [ref('2'), ref('3')], slots: 2 },
                }),
            ).toEqual([
                'Tie must leave out at least one job: 2 slots for 2 tied jobs.',
            ]);
        });

        it('counts the tie slots with the selected jobs', () => {
            expect(
                checkDecision(viewOf(4), {
                    selected: [ref('1'), ref('2')],
                    tie: { candidates: [ref('3'), ref('4')], slots: 1 },
                }),
            ).toEqual([
                'Policy selected the wrong number of jobs: expected 2, got 3.',
            ]);
        });
    });
});

describe('selectedRefs', () => {
    it('keeps only taskId and index when the policy returns whole jobs', () => {
        const view = viewOf(2);
        const refs = selectedRefs({
            selected: view.candidates.map((c) => c.job),
        });

        expect(refs).toEqual([ref('1'), ref('2')]);
        expect(refs.map((r) => Object.keys(r))).toEqual([
            ['taskId', 'index'],
            ['taskId', 'index'],
        ]);
    });

    it('does not share objects the policy still holds', () => {
        const mine = { taskId: '1', index: 0 };
        const refs = selectedRefs({ selected: [mine] });

        mine.index = 1;

        expect(refs[0]).not.toBe(mine);
        expect(refs).toEqual([ref('1')]);
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
