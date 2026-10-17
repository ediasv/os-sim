import { describe, expect, it } from 'vitest';
import { ConfigValidationError } from './config';
import { findInconsistencies } from './consistency';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { PolicyDecision, PolicyView, SchedulingPolicy } from './policy';
import { Simulator } from './simulator';

const periodicTask: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 1,
    duration: 2,
    period: 3,
    deadline: 2,
    rawEvents: '',
};

const firstAvailable: SchedulingPolicy = {
    select: (view) => ({
        selected: view.candidates
            .slice(0, view.cpuCount)
            .map(({ job }) => ({ taskId: job.taskId, index: job.index })),
    }),
};

function expectConsistent(sim: Simulator): void {
    expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
}

describe('Simulator', () => {
    it('publishes snapshot 0 built from the default configuration', () => {
        const snapshot = new Simulator(
            DEFAULT_CONFIG,
            firstAvailable,
        ).getLatestSnapshot();

        expect(snapshot.clock).toBe(0);
        expect(snapshot.config).toEqual(DEFAULT_CONFIG);
        expect(snapshot.cpus.map((cpu) => cpu.id)).toEqual([1]);
        expect(snapshot.tasks).toEqual([]);
    });

    it('starts the default empty simulation with the no-work policy (DEC-14)', () => {
        const sim = new Simulator();
        const snapshot = sim.getLatestSnapshot();

        expect(snapshot.cpus).toEqual([
            { id: 1, running: null, sliceElapsed: 0, offSince: 0 },
        ]);
        expect(snapshot.events).toEqual([
            { kind: 'cpu-off', time: 0, cpuId: 1 },
        ]);

        sim.tick();

        expect(sim.getLatestSnapshot().clock).toBe(1);
        expect(sim.getLatestSnapshot().events).toHaveLength(1);
        expectConsistent(sim);
    });

    it('rejects a policy without a select method', () => {
        expect(
            () => new Simulator(DEFAULT_CONFIG, {} as SchedulingPolicy),
        ).toThrow(/select method is required/);
    });

    it('rejects an invalid configuration with a ConfigValidationError listing every issue (DEC-15)', () => {
        let caught: unknown;
        try {
            new Simulator(
                {
                    ...DEFAULT_CONFIG,
                    cpuCount: 0,
                    tasks: [{ ...periodicTask, duration: 0 }],
                },
                firstAvailable,
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(ConfigValidationError);
        expect(caught).toBeInstanceOf(Error);
        const error = caught as ConfigValidationError;
        expect(error.name).toBe('ConfigValidationError');
        expect(error.issues.map((i) => [i.field, i.taskIndex])).toEqual([
            ['cpuCount', undefined],
            ['duration', 0],
        ]);
        expect(error.message).toBe(
            error.issues.map((i) => i.message).join('\n'),
        );
        expect(error.message).toMatch(/qtde_cpus/);
        expect(Object.isFrozen(error.issues)).toBe(true);
        expect(Object.isFrozen(error.issues[0])).toBe(true);
    });

    it('reports an invalid configuration before a missing policy (DEC-15)', () => {
        expect(
            () =>
                new Simulator({
                    ...DEFAULT_CONFIG,
                    cpuCount: 0,
                    tasks: [periodicTask],
                }),
        ).toThrow(ConfigValidationError);
    });

    it('publishes the normalized configuration in snapshot 0 (DEC-10)', () => {
        const snapshot = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [{ ...periodicTask, color: 'f0e0d0' }],
            },
            firstAvailable,
        ).getLatestSnapshot();

        expect(snapshot.config.tasks[0].color).toBe('F0E0D0');
        expect(snapshot.tasks[0].definition.color).toBe('F0E0D0');
    });

    it('advances the clock by exactly one tick per step (DEC-11)', () => {
        const sim = new Simulator(DEFAULT_CONFIG, firstAvailable);
        sim.tick();
        sim.tick();
        expect(sim.getLatestSnapshot().clock).toBe(2);
    });

    it('keeps earlier snapshots unchanged and frozen after later ticks', () => {
        const sim = new Simulator(DEFAULT_CONFIG, firstAvailable);
        const first = sim.getLatestSnapshot();

        sim.tick();

        expect(first.clock).toBe(0);
        expect(Object.isFrozen(first)).toBe(true);
        expect(sim.getLatestSnapshot()).not.toBe(first);
    });

    it('activates jobs at their arrival and period boundaries with individual deadlines', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [periodicTask],
            },
            firstAvailable,
        );

        expect(sim.getLatestSnapshot().tasks[0].jobs).toEqual([]);
        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().tasks[0].jobs).toEqual([
            expect.objectContaining({
                taskId: 1,
                index: 0,
                activation: 1,
                absoluteDeadline: 3,
            }),
        ]);
        sim.tick();
        expectConsistent(sim);
        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().tasks[0].jobs).toHaveLength(1);
        const firstJob = sim.getLatestSnapshot().tasks[0].jobs[0];
        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().tasks[0].jobs[1]).toMatchObject({
            index: 1,
            activation: 4,
            absoluteDeadline: 6,
        });
        // REQ-03: a new activation leaves earlier jobs intact.
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toEqual(firstJob);
        expect(firstJob).toEqual({
            taskId: 1,
            index: 0,
            activation: 1,
            absoluteDeadline: 3,
            executed: 2,
            state: 'completed',
            completedAt: 3,
            deadlineMissed: false,
        });
        expect(
            sim
                .getLatestSnapshot()
                .events.filter((event) => event.kind === 'activation'),
        ).toEqual([
            { kind: 'activation', time: 1, job: { taskId: 1, index: 0 } },
            { kind: 'activation', time: 4, job: { taskId: 1, index: 1 } },
        ]);
    });

    it('activates tick-zero tasks in snapshot 0 and limits periodic and aperiodic activations', () => {
        const config: SystemConfig = {
            ...DEFAULT_CONFIG,
            tasks: [
                { ...periodicTask, arrival: 0 },
                {
                    ...periodicTask,
                    id: 2,
                    color: 'AABBCC',
                    arrival: 0,
                    period: 0,
                },
            ],
        };
        const sim = new Simulator(config, firstAvailable);

        expect(sim.getLatestSnapshot().tasks.map((tcb) => tcb.jobs)).toEqual([
            [expect.objectContaining({ activation: 0, index: 0 })],
            [expect.objectContaining({ activation: 0, index: 0 })],
        ]);
        for (let tick = 0; tick < 30; tick++) {
            sim.tick();
            expectConsistent(sim);
        }
        const snapshot = sim.getLatestSnapshot();
        const activations = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27];
        expect(snapshot.tasks[0].jobs.map((job) => job.activation)).toEqual(
            activations,
        );
        expect(
            snapshot.tasks[0].jobs.map((job) => job.absoluteDeadline),
        ).toEqual(activations.map((time) => time + 2));
        expect(snapshot.tasks[1].jobs).toHaveLength(1);
        expect(
            snapshot.events.flatMap((event) =>
                event.kind === 'activation'
                    ? [[event.job.taskId, event.time]]
                    : [],
            ),
        ).toEqual([
            [1, 0],
            [2, 0],
            ...activations.slice(1).map((time) => [1, time]),
        ]);
    });

    it('activates an aperiodic task with a later arrival exactly once (DEC-09)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [{ ...periodicTask, arrival: 3, period: 0 }],
            },
            firstAvailable,
        );
        const jobCounts = [sim.getLatestSnapshot().tasks[0].jobs.length];
        for (let tick = 0; tick < 10; tick++) {
            sim.tick();
            expectConsistent(sim);
            jobCounts.push(sim.getLatestSnapshot().tasks[0].jobs.length);
        }

        const snapshot = sim.getLatestSnapshot();
        expect(jobCounts).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]);
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            activation: 3,
            absoluteDeadline: 5,
        });
        expect(
            snapshot.events.filter((event) => event.kind === 'activation'),
        ).toEqual([
            { kind: 'activation', time: 3, job: { taskId: 1, index: 0 } },
        ]);
    });

    it('starts each activated job untouched and records its activation in snapshot 0 (DEC-11)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    { ...periodicTask, arrival: 0 },
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        period: 0,
                    },
                ],
            },
            { select: () => ({ selected: [{ taskId: 1, index: 0 }] }) },
        );
        const snapshot = sim.getLatestSnapshot();
        const untouched = {
            index: 0,
            activation: 0,
            absoluteDeadline: 2,
            executed: 0,
            completedAt: null,
            deadlineMissed: false,
        };

        // Snapshot 0 already dispatches (DEC-11): task 1 runs, task 2 waits.
        expect(snapshot.tasks[0].jobs).toEqual([
            { ...untouched, taskId: 1, state: 'running' },
        ]);
        expect(snapshot.tasks[1].jobs).toEqual([
            { ...untouched, taskId: 2, state: 'ready' },
        ]);
        expect(
            snapshot.events.filter((event) => event.kind === 'activation'),
        ).toEqual([
            { kind: 'activation', time: 0, job: { taskId: 1, index: 0 } },
            { kind: 'activation', time: 0, job: { taskId: 2, index: 0 } },
        ]);
        expectConsistent(sim);
    });

    it('makes only the oldest incomplete job of each task eligible', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    { ...periodicTask, arrival: 0, period: 1 },
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        period: 0,
                        duration: 3,
                        deadline: 5,
                    },
                ],
            },
            firstAvailable,
        );
        sim.tick();
        expectConsistent(sim);

        expect(sim.getEligibleJobs()).toEqual([
            { taskId: 1, index: 0 },
            { taskId: 2, index: 0 },
        ]);
        // DEC-02: a ready job is not eligible while an older one is incomplete.
        expect(sim.getLatestSnapshot().tasks[0].jobs[1].state).toBe('ready');
        // REQ-03: the new activation keeps the unfinished older job's progress.
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toEqual({
            taskId: 1,
            index: 0,
            activation: 0,
            absoluteDeadline: 2,
            executed: 1,
            state: 'running',
            completedAt: null,
            deadlineMissed: false,
        });
    });

    it('dispatches the policy-selected set globally across CPUs', () => {
        const policy: SchedulingPolicy = {
            select: (view) => ({
                selected: view.candidates
                    .slice()
                    .reverse()
                    .slice(0, view.cpuCount)
                    .map(({ job }) => ({
                        taskId: job.taskId,
                        index: job.index,
                    })),
            }),
        };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    { ...periodicTask, id: 1, arrival: 0 },
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                    },
                ],
            },
            policy,
        );

        // Free CPUs are filled in selection order (DEC-07).
        expect(sim.getLatestSnapshot().cpus.map((cpu) => cpu.running)).toEqual([
            { taskId: 2, index: 0 },
            { taskId: 1, index: 0 },
        ]);
        expectConsistent(sim);
    });

    it('preempts and resumes a job without losing its execution progress', () => {
        const policy: SchedulingPolicy = {
            select: (view) => ({
                selected: [
                    {
                        taskId: view.clock === 1 || view.clock >= 3 ? 2 : 1,
                        index: 0,
                    },
                ],
            }),
        };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    { ...periodicTask, arrival: 0, period: 0 },
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        period: 0,
                    },
                ],
            },
            policy,
        );

        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'ready',
        });
        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'running',
        });
        sim.tick();
        expectConsistent(sim);

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 2,
            state: 'completed',
            completedAt: 3,
        });
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 0, end: 1 },
            { cpuId: 1, job: { taskId: 2, index: 0 }, start: 1, end: 2 },
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 2, end: 3 },
        ]);
        expect(
            snapshot.events.filter((event) => event.kind === 'preemption'),
        ).toEqual([
            {
                kind: 'preemption',
                time: 1,
                cpuId: 1,
                preempted: { taskId: 1, index: 0 },
                by: { taskId: 2, index: 0 },
            },
            {
                kind: 'preemption',
                time: 2,
                cpuId: 1,
                preempted: { taskId: 2, index: 0 },
                by: { taskId: 1, index: 0 },
            },
        ]);
        expectConsistent(sim);
    });

    it('executes one tick, completes on the deadline boundary, and powers idle CPUs off', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...periodicTask,
                        arrival: 2,
                        duration: 1,
                        period: 0,
                        deadline: 1,
                    },
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 5,
                        duration: 1,
                        period: 0,
                        deadline: 1,
                    },
                ],
            },
            firstAvailable,
        );

        expect(sim.getLatestSnapshot().cpus[0].offSince).toBe(0);
        expect(sim.getLatestSnapshot().events).toContainEqual({
            kind: 'cpu-off',
            time: 0,
            cpuId: 1,
        });
        expectConsistent(sim);
        sim.tick();
        expectConsistent(sim);
        sim.tick();
        expect(sim.getLatestSnapshot().cpus[0]).toMatchObject({
            running: { taskId: 1, index: 0 },
            offSince: null,
        });
        expectConsistent(sim);
        sim.tick();

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.clock).toBe(3);
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'completed',
            completedAt: 3,
            deadlineMissed: false,
        });
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 2, end: 3 },
        ]);
        expect(snapshot.cpus[0]).toMatchObject({
            running: null,
            offSince: 3,
        });
        expect(snapshot.events).toContainEqual({
            kind: 'completion',
            time: 3,
            job: { taskId: 1, index: 0 },
        });
        expectConsistent(sim);

        sim.tick();
        expectConsistent(sim);
        sim.tick();
        expect(sim.getLatestSnapshot().cpus[0]).toMatchObject({
            running: { taskId: 2, index: 0 },
            offSince: null,
        });
        expect(sim.getLatestSnapshot().events).toContainEqual({
            kind: 'cpu-on',
            time: 5,
            cpuId: 1,
        });
        expect(
            sim
                .getLatestSnapshot()
                .events.filter(
                    (event) => event.kind === 'cpu-off' && event.cpuId === 1,
                ),
        ).toEqual([
            { kind: 'cpu-off', time: 0, cpuId: 1 },
            { kind: 'cpu-off', time: 3, cpuId: 1 },
        ]);
        expectConsistent(sim);
        sim.tick();
        expect(sim.getLatestSnapshot().executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 2, end: 3 },
            { cpuId: 1, job: { taskId: 2, index: 0 }, start: 5, end: 6 },
        ]);
        expectConsistent(sim);
    });

    it('records a missed deadline once and continues executing the job', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...periodicTask,
                        arrival: 0,
                        duration: 3,
                        period: 0,
                        deadline: 1,
                    },
                ],
            },
            firstAvailable,
        );

        for (let tick = 0; tick < 3; tick++) {
            sim.tick();
            expectConsistent(sim);
        }

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 3,
            state: 'completed',
            completedAt: 3,
            deadlineMissed: true,
        });
        expect(
            snapshot.events.filter((event) => event.kind === 'deadline-miss'),
        ).toEqual([
            {
                kind: 'deadline-miss',
                time: 1,
                job: { taskId: 1, index: 0 },
            },
        ]);
    });

    it('rejects a policy decision that does not fill available CPUs', () => {
        const policy: SchedulingPolicy = {
            select: (_view: PolicyView) => ({ selected: [] }),
        };

        expect(
            () =>
                new Simulator(
                    {
                        ...DEFAULT_CONFIG,
                        tasks: [{ ...periodicTask, arrival: 0 }],
                    },
                    policy,
                ),
        ).toThrow(/wrong number of jobs/);
    });

    it('rejects a decision without a selected list', () => {
        const policy: SchedulingPolicy = {
            select: () => undefined as unknown as PolicyDecision,
        };

        expect(
            () =>
                new Simulator(
                    {
                        ...DEFAULT_CONFIG,
                        tasks: [{ ...periodicTask, arrival: 0 }],
                    },
                    policy,
                ),
        ).toThrow(/Invalid scheduling policy decision/);
    });

    it('rejects a decision with a non-reference entry', () => {
        const policy: SchedulingPolicy = {
            select: () => ({ selected: [null] }) as unknown as PolicyDecision,
        };

        expect(
            () =>
                new Simulator(
                    {
                        ...DEFAULT_CONFIG,
                        tasks: [{ ...periodicTask, arrival: 0 }],
                    },
                    policy,
                ),
        ).toThrow(/Invalid scheduling policy decision/);
    });

    it('stores the candidate reference, not the policy-typed one (DEC-13, DEC-14)', () => {
        const policy: SchedulingPolicy = {
            select: () =>
                ({
                    selected: [{ taskId: 1, index: '0' }],
                }) as unknown as PolicyDecision,
        };
        const sim = new Simulator(
            { ...DEFAULT_CONFIG, tasks: [{ ...periodicTask, arrival: 0 }] },
            policy,
        );

        const running = sim.getLatestSnapshot().cpus[0].running;
        expect(running).toEqual({ taskId: 1, index: 0 });
        expect(typeof running?.index).toBe('number');
        expectConsistent(sim);
    });

    it('dispatches the decision exactly as it was checked', () => {
        let reads = 0;
        const policy: SchedulingPolicy = {
            select: () => ({
                get selected() {
                    reads += 1;
                    return reads === 1
                        ? [{ taskId: 1, index: 0 }]
                        : [{ taskId: 99, index: 0 }];
                },
            }),
        };

        let sim!: Simulator;
        expect(() => {
            sim = new Simulator(
                {
                    ...DEFAULT_CONFIG,
                    tasks: [{ ...periodicTask, arrival: 0 }],
                },
                policy,
            );
        }).not.toThrow();

        expect(sim.getLatestSnapshot().cpus[0].running).toEqual({
            taskId: 1,
            index: 0,
        });
        expect(reads).toBe(1);
        expectConsistent(sim);
    });

    it('rejects a missing policy at runtime', () => {
        expect(
            () =>
                new Simulator(
                    DEFAULT_CONFIG,
                    null as unknown as SchedulingPolicy,
                ),
        ).toThrow(/scheduling policy with a select method is required/);
    });

    it('requires a policy for any configured tasks, including future arrivals', () => {
        expect(
            () =>
                new Simulator({
                    ...DEFAULT_CONFIG,
                    tasks: [{ ...periodicTask, arrival: 5 }],
                }),
        ).toThrow(/policy is required when tasks are configured/);
    });

    it('leaves state and history untouched when the policy throws during a tick (DEC-14)', () => {
        let failed = false;
        const policy: SchedulingPolicy = {
            select: (view) => {
                if (view.clock === 1 && !failed) {
                    failed = true;
                    throw new Error('policy failure');
                }
                return firstAvailable.select(view);
            },
        };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...periodicTask,
                        arrival: 0,
                        duration: 1,
                        period: 0,
                        deadline: 5,
                    },
                ],
            },
            policy,
        );

        const before = sim.getLatestSnapshot();
        expect(() => sim.tick()).toThrow('policy failure');
        expect(sim.getLatestSnapshot()).toBe(before);

        sim.tick();
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.clock).toBe(1);
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'completed',
            completedAt: 1,
        });
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 0, end: 1 },
        ]);
        expect(
            snapshot.events.filter((event) => event.kind === 'completion'),
        ).toHaveLength(1);
        expectConsistent(sim);
    });

    it.each([
        {
            name: 'duplicate',
            bad: [
                { taskId: 1, index: 0 },
                { taskId: 1, index: 0 },
            ],
            error: /selected more than once/,
        },
        {
            name: 'ineligible later job',
            bad: [{ taskId: 1, index: 1 }],
            error: /is not a candidate/,
        },
    ])(
        'rejects an invalid decision at a later tick without changing state: $name',
        ({ bad, error }) => {
            let useBad = true;
            const policy: SchedulingPolicy = {
                select: (view) =>
                    view.clock === 1 && useBad
                        ? { selected: bad }
                        : firstAvailable.select(view),
            };
            const sim = new Simulator(
                {
                    ...DEFAULT_CONFIG,
                    tasks: [
                        {
                            ...periodicTask,
                            arrival: 0,
                            duration: 3,
                            period: 1,
                            deadline: 10,
                        },
                    ],
                },
                policy,
            );

            expect(() => sim.tick()).toThrow(error);
            const unchanged = sim.getLatestSnapshot();
            expect(unchanged.clock).toBe(0);
            expect(unchanged.tasks[0].jobs[0].executed).toBe(0);

            useBad = false;
            sim.tick();
            const snapshot = sim.getLatestSnapshot();
            expect(snapshot.clock).toBe(1);
            expect(snapshot.tasks[0].jobs[0]).toMatchObject({
                executed: 1,
                state: 'running',
            });
            expectConsistent(sim);
        },
    );

    it('keeps each selected job on its CPU when the policy reorders its answer (DEC-07)', () => {
        const base = {
            arrival: 0,
            duration: 3,
            period: 0,
            deadline: 10,
            rawEvents: '',
        };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    { ...base, id: 1, color: 'F0E0D0' },
                    { ...base, id: 2, color: 'AABBCC' },
                ],
            },
            {
                select: (view) => {
                    const refs = view.candidates.map(({ job }) => ({
                        taskId: job.taskId,
                        index: job.index,
                    }));
                    return {
                        selected: view.clock % 2 === 0 ? refs : refs.reverse(),
                    };
                },
            },
        );
        expectConsistent(sim);

        const expectedRunning = [
            { taskId: 1, index: 0 },
            { taskId: 2, index: 0 },
        ];
        for (let step = 0; step < 3; step++) {
            // Snapshots 0, 1 and 2 hold the dispatch; snapshot 3 is idle.
            expect(
                sim.getLatestSnapshot().cpus.map((cpu) => cpu.running),
            ).toEqual(expectedRunning);
            sim.tick();
            expectConsistent(sim);
        }

        const snapshot = sim.getLatestSnapshot();
        expect(
            snapshot.events.filter((event) => event.kind === 'preemption'),
        ).toEqual([]);
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 0, end: 3 },
            { cpuId: 2, job: { taskId: 2, index: 0 }, start: 0, end: 3 },
        ]);
    });

    it('migrates a resumed job to a free CPU and preempts per CPU without losing progress', () => {
        const base = {
            arrival: 0,
            duration: 3,
            period: 0,
            deadline: 20,
            rawEvents: '',
        };
        const j1 = { taskId: 1, index: 0 };
        const j2 = { taskId: 2, index: 0 };
        const j3 = { taskId: 3, index: 0 };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    { ...base, id: 1, color: 'F0E0D0' },
                    { ...base, id: 2, color: 'AABBCC' },
                    { ...base, id: 3, color: '112233' },
                ],
            },
            {
                select: (view) => ({
                    selected:
                        view.clock === 0
                            ? [j1, j2]
                            : view.clock === 1
                              ? [j3, j2]
                              : [j1, j3],
                }),
            },
        );
        expectConsistent(sim);

        sim.tick();
        expectConsistent(sim);
        expect(sim.getLatestSnapshot().cpus[0]).toMatchObject({
            running: j3,
            sliceElapsed: 0,
        });

        sim.tick();
        expectConsistent(sim);
        sim.tick();
        expectConsistent(sim);

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: j1, start: 0, end: 1 },
            { cpuId: 2, job: j2, start: 0, end: 2 },
            { cpuId: 1, job: j3, start: 1, end: 3 },
            { cpuId: 2, job: j1, start: 2, end: 3 },
        ]);
        expect(
            snapshot.events.filter((event) => event.kind === 'preemption'),
        ).toEqual([
            expect.objectContaining({
                time: 1,
                cpuId: 1,
                preempted: j1,
                by: j3,
            }),
            expect.objectContaining({
                time: 2,
                cpuId: 2,
                preempted: j2,
                by: j1,
            }),
        ]);
        expect(snapshot.tasks.map((task) => task.jobs[0])).toMatchObject([
            { executed: 2, state: 'running' },
            { executed: 2, state: 'ready' },
            { executed: 2, state: 'running' },
        ]);
        expect(snapshot.cpus).toMatchObject([
            { id: 1, running: j3, sliceElapsed: 2 },
            { id: 2, running: j1, sliceElapsed: 1 },
        ]);
    });

    it('powers off and back on only the CPU that has no work (REQ-02)', () => {
        const base = { period: 0, rawEvents: '' };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    {
                        ...base,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 0,
                        duration: 4,
                        deadline: 10,
                    },
                    {
                        ...base,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 2,
                        duration: 1,
                        deadline: 5,
                    },
                ],
            },
            firstAvailable,
        );
        expectConsistent(sim);
        const powerEvents = () =>
            sim
                .getLatestSnapshot()
                .events.filter(
                    (event) =>
                        event.kind === 'cpu-off' || event.kind === 'cpu-on',
                );

        const snapshot0 = sim.getLatestSnapshot();
        expect(snapshot0.cpus[1].offSince).toBe(0);
        expect(powerEvents()).toEqual([{ kind: 'cpu-off', time: 0, cpuId: 2 }]);

        for (let step = 0; step < 3; step++) {
            sim.tick();
            expectConsistent(sim);
        }

        expect(powerEvents()).toEqual([
            { kind: 'cpu-off', time: 0, cpuId: 2 },
            { kind: 'cpu-on', time: 2, cpuId: 2 },
            { kind: 'cpu-off', time: 3, cpuId: 2 },
        ]);
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.cpus[0]).toMatchObject({
            running: { taskId: 1, index: 0 },
            offSince: null,
        });
        expect(
            snapshot.events.filter((event) => event.kind === 'task-finished'),
        ).toEqual([{ kind: 'task-finished', time: 3, taskId: 2 }]);
    });

    it('runs back-to-back jobs of a task as separate intervals and finishes the task once (DEC-09)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...periodicTask,
                        arrival: 0,
                        duration: 2,
                        period: 2,
                        deadline: 2,
                    },
                ],
            },
            firstAvailable,
        );
        expectConsistent(sim);
        for (let step = 0; step < 20; step++) {
            sim.tick();
            expectConsistent(sim);
        }

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.executions).toEqual(
            Array.from({ length: 10 }, (_, k) => ({
                cpuId: 1,
                job: { taskId: 1, index: k },
                start: 2 * k,
                end: 2 * k + 2,
            })),
        );
        for (const job of snapshot.tasks[0].jobs) {
            expect(job).toMatchObject({
                state: 'completed',
                deadlineMissed: false,
            });
        }
        expect(
            snapshot.events.filter((event) => event.kind === 'preemption'),
        ).toEqual([]);
        expect(
            snapshot.events.filter(
                (event) => event.kind === 'cpu-off' || event.kind === 'cpu-on',
            ),
        ).toEqual([{ kind: 'cpu-off', time: 20, cpuId: 1 }]);
        expect(
            snapshot.events.filter((event) => event.kind === 'task-finished'),
        ).toEqual([{ kind: 'task-finished', time: 20, taskId: 1 }]);
        expect(
            snapshot.events.filter((event) => event.kind === 'completion'),
        ).toHaveLength(10);
    });

    it('records a deadline miss for a ready job that never ran (REQ-08)', () => {
        const base = { period: 0, arrival: 0, rawEvents: '' };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...base,
                        id: 1,
                        color: 'F0E0D0',
                        duration: 3,
                        deadline: 10,
                    },
                    {
                        ...base,
                        id: 2,
                        color: 'AABBCC',
                        duration: 1,
                        deadline: 1,
                    },
                ],
            },
            firstAvailable,
        );
        expectConsistent(sim);
        sim.tick();
        expectConsistent(sim);

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[1].jobs[0]).toMatchObject({
            executed: 0,
            state: 'ready',
            deadlineMissed: true,
        });
        expect(
            snapshot.events.filter((event) => event.kind === 'deadline-miss'),
        ).toEqual([
            { kind: 'deadline-miss', time: 1, job: { taskId: 2, index: 0 } },
        ]);
    });

    it('finishes a periodic task only when its tenth job completes, even if late (DEC-09)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    // Idle gaps: every activated job completes before the next arrives.
                    {
                        ...periodicTask,
                        arrival: 0,
                        duration: 1,
                        period: 3,
                        deadline: 3,
                    },
                    // Every job, including the last, misses its deadline.
                    {
                        ...periodicTask,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        duration: 2,
                        period: 3,
                        deadline: 1,
                    },
                ],
            },
            firstAvailable,
        );
        const finished = () =>
            sim
                .getLatestSnapshot()
                .events.filter((event) => event.kind === 'task-finished');
        expectConsistent(sim);

        for (let step = 1; step <= 30; step++) {
            sim.tick();
            expectConsistent(sim);
            if (step === 25) {
                // Nine jobs exist and all completed, yet a tenth is still due.
                const tcb = sim.getLatestSnapshot().tasks[0];
                expect(tcb.jobs).toHaveLength(9);
                expect(tcb.jobs.every((job) => job.state === 'completed')).toBe(
                    true,
                );
            }
            if (step < 28) {
                expect(finished()).toEqual([]);
            }
        }

        expect(finished()).toEqual([
            { kind: 'task-finished', time: 28, taskId: 1 },
            { kind: 'task-finished', time: 29, taskId: 2 },
        ]);
        const late = sim.getLatestSnapshot().tasks[1].jobs;
        expect(late).toHaveLength(10);
        expect(late[9]).toMatchObject({
            state: 'completed',
            completedAt: 29,
            deadlineMissed: true,
        });
    });

    it('records deadline misses for later jobs blocked behind an incomplete one (DEC-02)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...periodicTask,
                        arrival: 0,
                        duration: 3,
                        period: 1,
                        deadline: 1,
                    },
                ],
            },
            firstAvailable,
        );
        expectConsistent(sim);
        for (let step = 0; step < 3; step++) {
            sim.tick();
            expectConsistent(sim);
        }

        expect(
            sim
                .getLatestSnapshot()
                .events.filter((event) => event.kind === 'deadline-miss'),
        ).toEqual([
            { kind: 'deadline-miss', time: 1, job: { taskId: 1, index: 0 } },
            { kind: 'deadline-miss', time: 2, job: { taskId: 1, index: 1 } },
            { kind: 'deadline-miss', time: 3, job: { taskId: 1, index: 2 } },
        ]);
    });
});
