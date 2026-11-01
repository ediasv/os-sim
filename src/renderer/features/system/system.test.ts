import { describe, expect, it } from 'vitest';
import { CpuEventSequenceError } from '../../../core/cpuOff';
import type { SimulationState } from '../../../core/domain';
import { projectSystem } from './system';

function task(id: number, period: number, duration: number, deadline: number) {
    return {
        id,
        color: 'F0E0D0',
        arrival: 0,
        duration,
        period,
        deadline,
        rawEvents: '',
    };
}

/**
 * Clock 8, three CPUs: CPU 1 runs T1#1 since tick 6 (slice 2 of quantum 5, job
 * progress 2), CPU 2 is off since 6, CPU 3 is off since 8. CPU 1 was off during
 * [2, 4). T2 has an eligible ready job; T3#0 is suspended and blocks T3#1
 * (pending).
 */
function snapshot(): SimulationState {
    const t1 = task(1, 5, 3, 4);
    const t2 = task(2, 0, 2, 2);
    const t3 = task(3, 10, 2, 6);
    return {
        clock: 8,
        config: {
            algorithm: 'EDF',
            quantum: 5,
            cpuCount: 3,
            tasks: [t1, t2, t3],
        },
        tasks: [
            {
                definition: t1,
                jobs: [
                    {
                        taskId: 1,
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 4,
                        executed: 3,
                        state: 'completed',
                        completedAt: 3,
                        deadlineMissed: false,
                    },
                    {
                        taskId: 1,
                        index: 1,
                        activation: 5,
                        absoluteDeadline: 9,
                        executed: 2,
                        state: 'running',
                        completedAt: null,
                        deadlineMissed: false,
                    },
                ],
            },
            {
                definition: t2,
                jobs: [
                    {
                        taskId: 2,
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 2,
                        executed: 0,
                        state: 'ready',
                        completedAt: null,
                        deadlineMissed: true,
                    },
                ],
            },
            {
                definition: t3,
                jobs: [
                    {
                        taskId: 3,
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 6,
                        executed: 1,
                        state: 'suspended',
                        completedAt: null,
                        deadlineMissed: true,
                    },
                    {
                        taskId: 3,
                        index: 1,
                        activation: 4,
                        absoluteDeadline: 14,
                        executed: 0,
                        state: 'ready',
                        completedAt: null,
                        deadlineMissed: false,
                    },
                ],
            },
        ],
        cpus: [
            {
                id: 1,
                running: { taskId: 1, index: 1 },
                sliceElapsed: 2,
                offSince: null,
            },
            { id: 2, running: null, sliceElapsed: 0, offSince: 6 },
            { id: 3, running: null, sliceElapsed: 0, offSince: 8 },
        ],
        executions: [
            {
                cpuId: 1,
                job: { taskId: 1, index: 1 },
                start: 6,
                end: 8,
            },
        ],
        events: [
            { kind: 'cpu-off', time: 2, cpuId: 1 },
            { kind: 'cpu-on', time: 4, cpuId: 1 },
            { kind: 'cpu-off', time: 6, cpuId: 2 },
            { kind: 'cpu-off', time: 8, cpuId: 3 },
        ],
        drawState: 1,
    };
}

describe('projectSystem', () => {
    it('reports the system parameters and the inspected tick', () => {
        const result = projectSystem(snapshot());

        expect(result.inspectedTick).toBe(8);
        expect(result.parameters).toEqual({
            algorithm: 'EDF',
            quantum: 5,
            cpuCount: 3,
        });
    });

    it('gives one row per CPU in received order with its job or off condition', () => {
        const cpus = projectSystem(snapshot()).cpus;

        expect(cpus.map((cpu) => cpu.id)).toEqual([1, 2, 3]);
        expect(cpus.map((cpu) => cpu.condition)).toEqual([
            'running',
            'off',
            'off',
        ]);
        expect(cpus[0]?.job).toMatchObject({
            ref: { taskId: 1, index: 1 },
            state: 'running',
            color: 'F0E0D0',
        });
        expect(cpus[1]?.job).toBeNull();
        expect(cpus[2]?.job).toBeNull();
    });

    it('gives the tick since which each CPU has its condition', () => {
        const cpus = projectSystem(snapshot()).cpus;

        expect(cpus.map((cpu) => cpu.since)).toEqual([6, 6, 8]);
    });

    it('starts the run of a job at the clock when no unbroken slice leads to it', () => {
        const state = snapshot();
        state.executions = [];

        expect(projectSystem(state).cpus[0]?.since).toBe(8);
    });

    it('starts the run at the start of the last unbroken slice of the same job', () => {
        const state = snapshot();
        state.executions = [
            { cpuId: 1, job: { taskId: 1, index: 0 }, start: 0, end: 2 },
            { cpuId: 1, job: { taskId: 1, index: 1 }, start: 4, end: 5 },
            { cpuId: 1, job: { taskId: 1, index: 1 }, start: 6, end: 8 },
        ];

        expect(projectSystem(state).cpus[0]?.since).toBe(6);
    });

    it('keeps the slice consumption apart from the job progress', () => {
        const running = projectSystem(snapshot()).cpus[0];

        expect(running).toMatchObject({ sliceElapsed: 2, quantum: 5 });
        expect(running?.job?.executed).toBe(2);
        expect(running?.job?.duration).toBe(3);
    });

    it('lists intervals and totals of CPU off time, including an open one', () => {
        const cpus = projectSystem(snapshot()).cpus;

        expect(cpus[0]).toMatchObject({
            offIntervals: [{ start: 2, end: 4 }],
            totalOff: 2,
        });
        expect(cpus[1]).toMatchObject({
            offIntervals: [{ start: 6, end: null }],
            totalOff: 2,
        });
        expect(cpus[2]).toMatchObject({
            offIntervals: [{ start: 8, end: null }],
            totalOff: 0,
        });
    });

    it('counts zero off ticks for a CPU switched off at the snapshot clock', () => {
        const cpu = projectSystem(snapshot()).cpus[2];

        expect(cpu).toMatchObject({
            condition: 'off',
            since: 8,
            totalOff: 0,
        });
    });

    it('fails instead of showing a CPU that is on without a job', () => {
        const state = snapshot();
        state.cpus[2] = {
            id: 3,
            running: null,
            sliceElapsed: 0,
            offSince: null,
        };

        expect(() => projectSystem(state)).toThrow(/without a job/);
    });

    it('puts only eligible ready jobs in the ready queue, in received order', () => {
        const result = projectSystem(snapshot());

        expect(result.ready.map((job) => job.ref)).toEqual([
            { taskId: 2, index: 0 },
        ]);
    });

    it('lists incomplete non-eligible jobs as pending, with their state', () => {
        const result = projectSystem(snapshot());

        expect(result.pending.map((job) => [job.ref, job.state])).toEqual([
            [{ taskId: 3, index: 0 }, 'suspended'],
            [{ taskId: 3, index: 1 }, 'ready'],
        ]);
        expect(result.pending[0]).toMatchObject({ deadlineMissed: true });
    });

    it('accounts each incomplete job once and leaves out completed ones', () => {
        const result = projectSystem(snapshot());
        const refs = [
            ...result.cpus.flatMap((cpu) => (cpu.job ? [cpu.job.ref] : [])),
            ...result.ready.map((job) => job.ref),
            ...result.pending.map((job) => job.ref),
        ];
        const keys = refs.map((ref) => `${ref.taskId}.${ref.index}`);

        expect(keys.sort()).toEqual(['1.1', '2.0', '3.0', '3.1']);
    });

    it('fails instead of hiding a running job that no CPU owns', () => {
        const state = snapshot();
        state.cpus[0] = {
            id: 1,
            running: null,
            sliceElapsed: 0,
            offSince: 8,
        };
        state.events.push({ kind: 'cpu-off', time: 8, cpuId: 1 });

        expect(() => projectSystem(state)).toThrow(/running/);
    });

    it('propagates malformed CPU event histories instead of guessing intervals', () => {
        const state = snapshot();
        state.events.push({ kind: 'cpu-off', time: 7, cpuId: 2 });

        expect(() => projectSystem(state)).toThrow(CpuEventSequenceError);
    });

    it('does not change the snapshot it reads', () => {
        const state = snapshot();
        const before = structuredClone(state);

        projectSystem(state);

        expect(state).toEqual(before);
    });
});
