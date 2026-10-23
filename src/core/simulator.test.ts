import { describe, expect, it } from 'vitest';
import { ConfigValidationError } from './config';
import { findInconsistencies } from './consistency';
import { summarizeCpuOff } from './cpuOff';
import {
    DEFAULT_CONFIG,
    type SimulationEvent,
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

/**
 * Checks the multi-CPU invariants of REQ-02 over the whole run, not only the
 * current state that `findInconsistencies` sees: no job runs on two CPUs in
 * the same tick, no CPU runs two jobs in the same tick, and no CPU stays off
 * while an eligible job waits.
 */
function expectMultiCpuInvariants(sim: Simulator): void {
    expectConsistent(sim);
    const snapshot = sim.getLatestSnapshot();
    for (const [i, a] of snapshot.executions.entries()) {
        for (const b of snapshot.executions.slice(i + 1)) {
            const overlap = a.start < b.end && b.start < a.end;
            const sameJob =
                a.job.taskId === b.job.taskId && a.job.index === b.job.index;
            if (overlap && (sameJob || a.cpuId === b.cpuId)) {
                expect.fail(
                    `Overlapping executions: ${JSON.stringify(a)} and ${JSON.stringify(b)}`,
                );
            }
        }
    }
    const busy = snapshot.cpus.filter((cpu) => cpu.running !== null).length;
    expect(busy).toBe(
        Math.min(snapshot.config.cpuCount, sim.getEligibleJobs().length),
    );
}

function task(
    id: number,
    color: string,
    fields: Pick<TaskDefinition, 'arrival' | 'duration' | 'deadline'>,
): TaskDefinition {
    return { id, color, period: 0, rawEvents: '', ...fields };
}

function run(sim: Simulator, ticks: number): void {
    for (let step = 0; step < ticks; step++) {
        sim.tick();
        expectMultiCpuInvariants(sim);
    }
}

function eventsOf(sim: Simulator, kind: SimulationEvent['kind']) {
    return sim
        .getLatestSnapshot()
        .events.filter((event) => event.kind === kind);
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
        expectMultiCpuInvariants(sim);
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
            absoluteDeadline: 2,
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
        expectMultiCpuInvariants(sim);

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
            expectMultiCpuInvariants(sim);
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
        expectMultiCpuInvariants(sim);

        sim.tick();
        expectMultiCpuInvariants(sim);
        expect(sim.getLatestSnapshot().cpus[0]).toMatchObject({
            running: j3,
            sliceElapsed: 0,
        });

        sim.tick();
        expectMultiCpuInvariants(sim);
        sim.tick();
        expectMultiCpuInvariants(sim);

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
        expectMultiCpuInvariants(sim);
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
            expectMultiCpuInvariants(sim);
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
        // Events of the two CPUs interleave; each keeps its own intervals.
        expect(summarizeCpuOff(snapshot)).toEqual([
            { cpuId: 1, intervals: [], totalOff: 0 },
            {
                cpuId: 2,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: null },
                ],
                totalOff: 2,
            },
        ]);
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
        expectMultiCpuInvariants(sim);

        for (let step = 1; step <= 30; step++) {
            sim.tick();
            expectMultiCpuInvariants(sim);
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

    it('logs every completion before any deadline miss at a shared boundary (DEC-22)', () => {
        const base = { period: 0, rawEvents: '' };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    // Listed first, so a per-job pass would log its miss first.
                    {
                        ...base,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 0,
                        duration: 1,
                        deadline: 2,
                    },
                    {
                        ...base,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        duration: 2,
                        deadline: 10,
                    },
                    {
                        ...base,
                        id: 3,
                        color: '112233',
                        arrival: 2,
                        duration: 1,
                        deadline: 10,
                    },
                ],
            },
            {
                select: (view) => {
                    const preferred =
                        view.candidates.find(({ job }) => job.taskId === 2) ??
                        view.candidates[0];
                    return {
                        selected:
                            preferred === undefined
                                ? []
                                : [
                                      {
                                          taskId: preferred.job.taskId,
                                          index: preferred.job.index,
                                      },
                                  ],
                    };
                },
            },
        );
        sim.tick();
        expectConsistent(sim);
        sim.tick();
        expectConsistent(sim);

        expect(
            sim.getLatestSnapshot().events.filter((event) => event.time === 2),
        ).toEqual([
            { kind: 'completion', time: 2, job: { taskId: 2, index: 0 } },
            { kind: 'task-finished', time: 2, taskId: 2 },
            { kind: 'deadline-miss', time: 2, job: { taskId: 1, index: 0 } },
            { kind: 'activation', time: 2, job: { taskId: 3, index: 0 } },
        ]);
    });
});

describe('Simulator quantum (#14)', () => {
    const J = { taskId: 1, index: 0 };
    const K = { taskId: 2, index: 0 };

    it('keeps the expired job on its CPU in a tie and starts a new slice (DEC-18)', () => {
        // Stands in for A.4.3 (1) "was running before", then (2) deadline.
        const views: PolicyView[] = [];
        const runningThenDeadline: SchedulingPolicy = {
            select: (view) => {
                views.push(view);
                const [best] = [...view.candidates].sort(
                    (a, b) =>
                        Number(b.previousCpu !== null) -
                            Number(a.previousCpu !== null) ||
                        a.job.absoluteDeadline - b.job.absoluteDeadline,
                );
                return {
                    selected:
                        best === undefined
                            ? []
                            : [
                                  {
                                      taskId: best.job.taskId,
                                      index: best.job.index,
                                  },
                              ],
                };
            },
        };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 2,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 4,
                        deadline: 10,
                    }),
                    task(2, 'AABBCC', { arrival: 1, duration: 2, deadline: 8 }),
                ],
            },
            runningThenDeadline,
        );

        run(sim, 2);
        const atTwo = sim.getLatestSnapshot();
        const eventsAtTwo = atTwo.events.length;
        expect(atTwo.cpus[0]).toMatchObject({ running: J, sliceElapsed: 0 });
        run(sim, 4);

        expect(
            views
                .find((view) => view.clock === 2)
                ?.candidates.find((candidate) => candidate.job.taskId === 1)
                ?.previousCpu,
        ).toBe(1);
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: J, start: 0, end: 4 },
            { cpuId: 1, job: K, start: 4, end: 6 },
        ]);
        expect(eventsOf(sim, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 2, cpuId: 1, job: J },
        ]);
        expect(eventsOf(sim, 'preemption')).toEqual([]);
        expect(eventsOf(sim, 'completion')).toEqual([
            { kind: 'completion', time: 4, job: J },
            { kind: 'completion', time: 6, job: K },
        ]);
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 4,
            absoluteDeadline: 10,
            deadlineMissed: false,
            completedAt: 4,
        });
        expect(atTwo.events).toHaveLength(eventsAtTwo);
    });

    it('logs quantum-expired and preemption when another job takes the CPU, and gives a migrated job a full quantum', () => {
        const A = { taskId: 1, index: 0 };
        const B = { taskId: 2, index: 0 };
        const C = { taskId: 3, index: 0 };
        const base = { arrival: 0, duration: 4, deadline: 20 };
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                quantum: 2,
                tasks: [
                    task(1, 'F0E0D0', base),
                    task(2, 'AABBCC', base),
                    task(3, '112233', base),
                ],
            },
            {
                select: (view) => ({
                    selected:
                        view.clock === 0
                            ? [A, B]
                            : view.clock === 1
                              ? [C, B]
                              : [C, A],
                }),
            },
        );

        run(sim, 4);

        const snapshot = sim.getLatestSnapshot();
        // A resumed on CPU 2 at 2, so its slice expires at 4, not 3.
        expect(eventsOf(sim, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 2, cpuId: 2, job: B },
            { kind: 'quantum-expired', time: 3, cpuId: 1, job: C },
            { kind: 'quantum-expired', time: 4, cpuId: 2, job: A },
        ]);
        expect(eventsOf(sim, 'preemption')).toEqual([
            { kind: 'preemption', time: 1, cpuId: 1, preempted: A, by: C },
            { kind: 'preemption', time: 2, cpuId: 2, preempted: B, by: A },
        ]);
        // C's reselection at 3 does not split its interval.
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: A, start: 0, end: 1 },
            { cpuId: 2, job: B, start: 0, end: 2 },
            { cpuId: 1, job: C, start: 1, end: 4 },
            { cpuId: 2, job: A, start: 2, end: 4 },
        ]);
        expect(snapshot.cpus).toMatchObject([
            { id: 1, running: C, sliceElapsed: 1 },
            { id: 2, running: A, sliceElapsed: 0 },
        ]);
        expect(snapshot.tasks.map((tcb) => tcb.jobs[0])).toMatchObject([
            { executed: 3, state: 'running' },
            { executed: 2, state: 'ready' },
            { executed: 3, state: 'running' },
        ]);
    });

    it('restarts the slice when a job preempted mid-slice resumes on the same CPU', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 3,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 6,
                        deadline: 20,
                    }),
                    task(2, 'AABBCC', {
                        arrival: 0,
                        duration: 1,
                        deadline: 20,
                    }),
                ],
            },
            {
                select: (view) => ({
                    selected:
                        view.candidates.length === 0
                            ? []
                            : [view.clock === 2 ? K : J],
                }),
            },
        );

        run(sim, 7);

        expect(eventsOf(sim, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 6, cpuId: 1, job: J },
        ]);
        // Preemption changed the CPU owner only: progress and deadline survive.
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toMatchObject({
            executed: 6,
            completedAt: 7,
            absoluteDeadline: 20,
            deadlineMissed: false,
        });
    });

    it('expires every boundary with quantum 1 without splitting the interval', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 1,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 3,
                        deadline: 20,
                    }),
                ],
            },
            firstAvailable,
        );

        run(sim, 3);

        expect(
            eventsOf(sim, 'quantum-expired').map((event) => event.time),
        ).toEqual([1, 2]);
        expect(sim.getLatestSnapshot().executions).toEqual([
            { cpuId: 1, job: J, start: 0, end: 3 },
        ]);
        expect(eventsOf(sim, 'preemption')).toEqual([]);
    });

    it('logs a deadline miss before the expiry at the same boundary and keeps running', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 2,
                tasks: [
                    task(1, 'F0E0D0', { arrival: 0, duration: 4, deadline: 2 }),
                ],
            },
            firstAvailable,
        );

        run(sim, 2);

        const snapshot = sim.getLatestSnapshot();
        expect(
            snapshot.events
                .filter((event) => event.time === 2)
                .map((event) => event.kind),
        ).toEqual(['deadline-miss', 'quantum-expired']);
        expect(snapshot.cpus[0].running).toEqual(J);
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            executed: 2,
            state: 'running',
            deadlineMissed: true,
        });
    });

    it('leaves state and history untouched when the policy throws at an expiry boundary (DEC-14)', () => {
        let failed = false;
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 2,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 4,
                        deadline: 20,
                    }),
                ],
            },
            {
                select: (view) => {
                    if (view.clock === 2 && !failed) {
                        failed = true;
                        throw new Error('boom');
                    }
                    return firstAvailable.select(view);
                },
            },
        );

        run(sim, 1);
        const before = sim.getLatestSnapshot();
        expect(() => sim.tick()).toThrow(/boom/);
        expect(sim.getLatestSnapshot()).toBe(before);

        // The retry must start from the restored state, not from a half-applied
        // expiry: one event, one renewed slice, one tick of progress.
        run(sim, 1);
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.clock).toBe(2);
        expect(eventsOf(sim, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 2, cpuId: 1, job: J },
        ]);
        expect(snapshot.cpus[0]).toMatchObject({ running: J, sliceElapsed: 0 });
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({ executed: 2 });
    });
});

describe('Simulator boundaries, overlap and multiple CPUs (#16)', () => {
    function eventsAt(sim: Simulator, time: number) {
        return sim
            .getLatestSnapshot()
            .events.filter((event) => event.time === time);
    }

    it('processes every kind of fact at shared boundaries in stage order (DEC-04, DEC-11, DEC-22)', () => {
        const ref = (taskId: number) => ({ taskId, index: 0 });
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                quantum: 2,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 2,
                        deadline: 10,
                    }),
                    task(2, 'AABBCC', {
                        arrival: 0,
                        duration: 4,
                        deadline: 20,
                    }),
                    task(3, '112233', { arrival: 0, duration: 1, deadline: 2 }),
                    task(4, '445566', {
                        arrival: 2,
                        duration: 1,
                        deadline: 10,
                    }),
                    task(5, '778899', {
                        arrival: 4,
                        duration: 1,
                        deadline: 10,
                    }),
                ],
            },
            {
                // Scripted choices: 1 and 2 first, then 3 and 4 displace 2.
                select: (view) => {
                    const chosen = view.candidates.filter(({ job }) =>
                        view.clock < 2
                            ? job.taskId <= 2
                            : view.clock === 2
                              ? job.taskId === 3 || job.taskId === 4
                              : true,
                    );
                    return {
                        selected: chosen.map(({ job }) => ref(job.taskId)),
                    };
                },
            },
        );
        expectMultiCpuInvariants(sim);

        run(sim, 2);
        // Completion, deadline miss, slice expiry, activation, then dispatch.
        expect(eventsAt(sim, 2)).toEqual([
            { kind: 'completion', time: 2, job: ref(1) },
            { kind: 'task-finished', time: 2, taskId: 1 },
            { kind: 'deadline-miss', time: 2, job: ref(3) },
            { kind: 'quantum-expired', time: 2, cpuId: 2, job: ref(2) },
            { kind: 'activation', time: 2, job: ref(4) },
            {
                kind: 'preemption',
                time: 2,
                cpuId: 2,
                preempted: ref(2),
                by: ref(4),
            },
        ]);

        run(sim, 1);
        // A CPU released by completions is powered off after them.
        expect(eventsAt(sim, 3)).toEqual([
            { kind: 'completion', time: 3, job: ref(3) },
            { kind: 'task-finished', time: 3, taskId: 3 },
            { kind: 'completion', time: 3, job: ref(4) },
            { kind: 'task-finished', time: 3, taskId: 4 },
            { kind: 'cpu-off', time: 3, cpuId: 2 },
        ]);

        run(sim, 1);
        // The activation comes before the power-on it causes.
        expect(eventsAt(sim, 4)).toEqual([
            { kind: 'activation', time: 4, job: ref(5) },
            { kind: 'cpu-on', time: 4, cpuId: 2 },
        ]);

        run(sim, 1);
        // Task 2 ends exactly where its slice would expire: no expiry logged.
        expect(eventsAt(sim, 5)).toEqual([
            { kind: 'completion', time: 5, job: ref(2) },
            { kind: 'task-finished', time: 5, taskId: 2 },
            { kind: 'completion', time: 5, job: ref(5) },
            { kind: 'task-finished', time: 5, taskId: 5 },
            { kind: 'cpu-off', time: 5, cpuId: 1 },
            { kind: 'cpu-off', time: 5, cpuId: 2 },
        ]);

        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: ref(1), start: 0, end: 2 },
            { cpuId: 2, job: ref(2), start: 0, end: 2 },
            { cpuId: 1, job: ref(3), start: 2, end: 3 },
            { cpuId: 2, job: ref(4), start: 2, end: 3 },
            { cpuId: 1, job: ref(2), start: 3, end: 5 },
            { cpuId: 2, job: ref(5), start: 4, end: 5 },
        ]);
        expect(snapshot.tasks.map((tcb) => tcb.jobs[0])).toMatchObject([
            { completedAt: 2, deadlineMissed: false },
            { executed: 4, completedAt: 5, deadlineMissed: false },
            { executed: 1, completedAt: 3, deadlineMissed: true },
            { completedAt: 3, deadlineMissed: false },
            { completedAt: 5, deadlineMissed: false },
        ]);
        expect(snapshot.cpus).toMatchObject([
            { id: 1, running: null, offSince: 5 },
            { id: 2, running: null, offSince: 5 },
        ]);
    });

    it('holds a later activation without running it, even with a free CPU, until the earlier job completes (DEC-02)', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    {
                        ...task(1, 'F0E0D0', {
                            arrival: 0,
                            duration: 3,
                            deadline: 2,
                        }),
                        period: 2,
                    },
                ],
            },
            firstAvailable,
        );
        const first = { taskId: 1, index: 0 };
        const second = { taskId: 1, index: 1 };
        expectMultiCpuInvariants(sim);

        run(sim, 2);
        // The second job is active and its deadline runs, but it may not use
        // the idle CPU 2 while the first job is incomplete.
        let snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs[1]).toMatchObject({
            activation: 2,
            absoluteDeadline: 4,
            executed: 0,
            state: 'ready',
        });
        expect(sim.getEligibleJobs()).toEqual([first]);
        expect(snapshot.cpus).toMatchObject([
            { id: 1, running: first },
            { id: 2, running: null, offSince: 0 },
        ]);

        run(sim, 1);
        // It starts at the exact boundary where the first job completes.
        snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs[0]).toMatchObject({
            state: 'completed',
            completedAt: 3,
        });
        expect(snapshot.cpus[0]).toMatchObject({
            running: second,
            sliceElapsed: 0,
        });
        expect(sim.getEligibleJobs()).toEqual([second]);

        run(sim, 1);
        // Its own deadline (activation 2 + 2) passes while it runs.
        snapshot = sim.getLatestSnapshot();
        expect(eventsOf(sim, 'deadline-miss')).toEqual([
            { kind: 'deadline-miss', time: 2, job: first },
            { kind: 'deadline-miss', time: 4, job: second },
        ]);
        expect(snapshot.tasks[0].jobs[1]).toMatchObject({
            executed: 1,
            state: 'running',
            deadlineMissed: true,
        });
        expect(snapshot.tasks[0].jobs[2]).toMatchObject({
            activation: 4,
            state: 'ready',
        });
        expect(snapshot.executions).toEqual([
            { cpuId: 1, job: first, start: 0, end: 3 },
            { cpuId: 1, job: second, start: 3, end: 4 },
        ]);
        expect(summarizeCpuOff(snapshot)[1]).toEqual({
            cpuId: 2,
            intervals: [{ start: 0, end: null }],
            totalOff: 4,
        });
    });

    it('never expires a slice when the quantum exceeds the duration', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                quantum: 10,
                tasks: [
                    task(1, 'F0E0D0', {
                        arrival: 0,
                        duration: 3,
                        deadline: 20,
                    }),
                ],
            },
            firstAvailable,
        );

        run(sim, 4);

        expect(eventsOf(sim, 'quantum-expired')).toEqual([]);
        expect(eventsOf(sim, 'completion')).toEqual([
            { kind: 'completion', time: 3, job: { taskId: 1, index: 0 } },
        ]);
        expect(sim.getLatestSnapshot().executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 0, end: 3 },
        ]);
    });
});
