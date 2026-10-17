import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { PolicyView, SchedulingPolicy } from './policy';
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
        expect(sim.getLatestSnapshot().tasks[0].jobs).toEqual([
            expect.objectContaining({
                taskId: 1,
                index: 0,
                activation: 1,
                absoluteDeadline: 3,
            }),
        ]);
        sim.tick();
        sim.tick();
        expect(sim.getLatestSnapshot().tasks[0].jobs).toHaveLength(1);
        sim.tick();
        expect(sim.getLatestSnapshot().tasks[0].jobs[1]).toMatchObject({
            index: 1,
            activation: 4,
            absoluteDeadline: 6,
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
        }
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs).toHaveLength(10);
        expect(snapshot.tasks[1].jobs).toHaveLength(1);
        expect(
            snapshot.events.filter((event) => event.kind === 'activation'),
        ).toHaveLength(11);
    });

    it('makes only the oldest incomplete job of each task eligible', () => {
        const sim = new Simulator(
            {
                ...DEFAULT_CONFIG,
                tasks: [{ ...periodicTask, arrival: 0, period: 1 }],
            },
            firstAvailable,
        );
        sim.tick();

        expect(sim.getEligibleJobs()).toEqual([{ taskId: 1, index: 0 }]);
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

        expect(sim.getLatestSnapshot().cpus.map((cpu) => cpu.running)).toEqual([
            { taskId: 2, index: 0 },
            { taskId: 1, index: 0 },
        ]);
        expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
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
        expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'ready',
        });
        sim.tick();
        expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
        expect(sim.getLatestSnapshot().tasks[0].jobs[0]).toMatchObject({
            executed: 1,
            state: 'running',
        });
        sim.tick();
        expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);

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
        expect(findInconsistencies(snapshot)).toEqual([]);
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
        const assertConsistent = () =>
            expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);

        expect(sim.getLatestSnapshot().cpus[0].offSince).toBe(0);
        expect(sim.getLatestSnapshot().events).toContainEqual({
            kind: 'cpu-off',
            time: 0,
            cpuId: 1,
        });
        assertConsistent();
        sim.tick();
        assertConsistent();
        sim.tick();
        expect(sim.getLatestSnapshot().cpus[0]).toMatchObject({
            running: { taskId: 1, index: 0 },
            offSince: null,
        });
        assertConsistent();
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
        assertConsistent();

        sim.tick();
        assertConsistent();
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
        assertConsistent();
        sim.tick();
        expect(sim.getLatestSnapshot().executions).toEqual([
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 2, end: 3 },
            { cpuId: 1, job: { taskId: 2, index: 0 }, start: 5, end: 6 },
        ]);
        assertConsistent();
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
            expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
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

    it('rejects a missing policy at runtime', () => {
        expect(
            () =>
                new Simulator(
                    DEFAULT_CONFIG,
                    null as unknown as SchedulingPolicy,
                ),
        ).toThrow(/scheduling policy with a select method is required/);
    });
});
