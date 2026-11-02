import { Simulator } from '../../../core/simulator';
import { DEFAULT_CONFIG } from '../../../core/domain';
import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../../core/domain';
import { createSimulator } from '../../../core/createSimulator';
import { DEFAULT_POLICIES } from '../../../core/policies';
import {
    describeTaskChoice,
    projectFutureJob,
    projectInspection,
} from './inspection';

function snapshot(): SimulationState {
    return {
        clock: 8,
        config: {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [
                {
                    id: '1',
                    color: 'F0E0D0',
                    arrival: 0,
                    duration: 3,
                    period: 5,
                    deadline: 4,
                    rawEvents: '',
                },
                {
                    id: '2',
                    color: 'D0E0F0',
                    arrival: 0,
                    duration: 2,
                    period: 0,
                    deadline: 2,
                    rawEvents: '',
                },
            ],
        },
        tasks: [
            {
                status: 'ready',
                definition: {
                    id: '1',
                    color: 'F0E0D0',
                    arrival: 0,
                    duration: 3,
                    period: 5,
                    deadline: 4,
                    rawEvents: '',
                },
                nextActivation: 10,
                jobs: [
                    {
                        taskId: '1',
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 4,
                        duration: 3,
                        executed: 3,
                        state: 'completed',
                        completedAt: 3,
                        deadlineMissed: false,
                    },
                    {
                        taskId: '1',
                        index: 1,
                        activation: 5,
                        absoluteDeadline: 9,
                        duration: 3,
                        executed: 1,
                        state: 'ready',
                        completedAt: null,
                        deadlineMissed: true,
                    },
                ],
            },
            {
                status: 'ready',
                definition: {
                    id: '2',
                    color: 'D0E0F0',
                    arrival: 0,
                    duration: 2,
                    period: 0,
                    deadline: 2,
                    rawEvents: '',
                },
                nextActivation: null,
                jobs: [
                    {
                        taskId: '2',
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 2,
                        duration: 2,
                        executed: 0,
                        state: 'suspended',
                        completedAt: null,
                        deadlineMissed: true,
                    },
                ],
            },
        ],
        cpus: [
            {
                id: 1,
                running: { taskId: '1', index: 1 },
                sliceElapsed: 1,
                offSince: null,
            },
        ],
        executions: [],
        events: [
            { kind: 'cpu-off', time: 0, cpuId: 1 },
            { kind: 'cpu-on', time: 2, cpuId: 1 },
        ],
        drawState: 1,
        usedTaskIds: [],
    };
}

describe('projectInspection', () => {
    it('preserves the inspected tick and separates state, eligibility, and deadline loss', () => {
        const result = projectInspection(snapshot());
        const task = result.tasks[0];
        const completed = task?.jobs[0];
        const late = task?.jobs[1];

        expect(result.inspectedTick).toBe(8);
        expect(completed).toMatchObject({
            state: 'completed',
            eligible: false,
            deadlineMissed: false,
        });
        expect(late).toMatchObject({
            state: 'ready',
            eligible: true,
            deadlineMissed: true,
        });
        expect(task?.status).toBe('active');
    });

    it('does not make a suspended job eligible or hide its deadline loss', () => {
        const task = projectInspection(snapshot()).tasks[1];

        expect(task?.jobs[0]).toMatchObject({
            state: 'suspended',
            eligible: false,
            deadlineMissed: true,
        });
    });

    it('derives CPU-off intervals through the core query', () => {
        expect(projectInspection(snapshot()).cpuOff).toEqual([
            {
                cpuId: 1,
                intervals: [{ start: 0, end: 2 }],
                totalOff: 2,
            },
        ]);
    });

    it('represents future selection without current progress or state', () => {
        expect(
            projectFutureJob({
                taskId: '1',
                index: 3,
                activation: 15,
                absoluteDeadline: 19,
            }),
        ).toEqual({
            availability: 'future',
            ref: { taskId: '1', index: 3 },
            activation: 15,
            absoluteDeadline: 19,
            executed: null,
            state: null,
            completedAt: null,
            deadlineMissed: false,
            eligible: false,
        });
    });

    it('does not mutate the snapshot', () => {
        const input = snapshot();
        const before = structuredClone(input);

        projectInspection(input);

        expect(input).toEqual(before);
    });
});

it('projects the CPU history kept after removing CPUs', () => {
    // With no tasks every CPU idles, so each one is off from tick 0 until removed.
    expect(DEFAULT_CONFIG.tasks).toEqual([]);
    const sim = new Simulator({ ...DEFAULT_CONFIG, cpuCount: 4 });
    sim.tick();
    sim.edit([{ kind: 'cpuCount', cpuCount: 1 }]);
    sim.tick();
    expect(projectInspection(sim.getCurrentSnapshot()).cpuOff).toEqual([
        { cpuId: 1, intervals: [{ start: 0, end: null }], totalOff: 2 },
        { cpuId: 2, intervals: [{ start: 0, end: 1 }], totalOff: 1 },
        { cpuId: 3, intervals: [{ start: 0, end: 1 }], totalOff: 1 },
        { cpuId: 4, intervals: [{ start: 0, end: 1 }], totalOff: 1 },
    ]);
});

it('does not count interrupted jobs as incomplete', () => {
    const state = snapshot();
    state.tasks[1].jobs[0].state = 'interrupted';
    expect(projectInspection(state).tasks[1].status).toBe('completed');
});

describe('concluded tasks in the inspection', () => {
    it('shows a task concluded before its arrival as completed, not awaiting activation', () => {
        const state = snapshot();
        state.tasks[1].definition = {
            ...state.tasks[1].definition,
            arrival: 20,
        };
        state.tasks[1].jobs = [];
        state.tasks[1].status = 'concluded';
        expect(projectInspection(state).tasks[1].status).toBe('completed');
    });

    it('shows a task concluded between jobs as completed, not awaiting the next activation', () => {
        const state = snapshot();
        state.tasks[0].jobs[1].state = 'interrupted';
        state.tasks[0].status = 'concluded';
        expect(projectInspection(state).tasks[0].status).toBe('completed');
    });
});

describe('inspection of edited tasks (#37, FE-09, DEC-37)', () => {
    const definition = (id: string, duration: number, period: number) => ({
        id,
        color: id === '1' ? 'F0E0D0' : id === '2' ? 'D0E0F0' : 'E0F0D0',
        arrival: 0,
        duration,
        period,
        deadline: id === '3' ? 2 : id === '1' ? 3 : 10,
        rawEvents: '',
    });

    /** Task 1 runs late with a job pending behind it, 2 is forced, 3 is suspended. */
    function edited() {
        const sim = createSimulator(
            {
                algorithm: 'RM',
                quantum: 5,
                cpuCount: 2,
                tasks: [
                    definition('1', 6, 3),
                    definition('2', 2, 10),
                    definition('3', 2, 10),
                ],
            },
            DEFAULT_POLICIES,
        );
        sim.edit([
            { kind: 'taskState', taskId: '2', state: 'forced' },
            { kind: 'taskState', taskId: '3', state: 'suspended' },
        ]);
        for (let i = 0; i < 4; i++) sim.tick();
        return projectInspection(sim.getCurrentSnapshot());
    }

    it('keeps the state the user chose apart from what the job is doing', () => {
        const { tasks } = edited();
        expect(tasks.map((task) => task.choice)).toEqual([
            'ready',
            'forced',
            'suspended',
        ]);
        expect(tasks[0].jobs[0].state).toBe('running');
    });

    it('labels a ready task running by priority differently from a forced one', () => {
        const { tasks } = edited();
        expect(describeTaskChoice(tasks[0])).toBe(
            'Pronta, executando por prioridade',
        );
        expect(describeTaskChoice(tasks[1])).toBe('Forçada');
        expect(describeTaskChoice(tasks[2])).toBe('Suspensa');
    });

    it('shows a suspended job that missed its deadline with both facts', () => {
        const job = edited().tasks[2].jobs[0];
        // The core never marks a job suspended: the task is (DEC-37), and
        // that state holds for its oldest incomplete job.
        expect(job.suspended).toBe(true);
        expect(job.eligible).toBe(false);
        expect(job.deadlineMissed).toBe(true);
    });

    it('shows a job activated behind an older late one as pending and not eligible', () => {
        const [late, pending] = edited().tasks[0].jobs;
        expect(late.deadlineMissed).toBe(true);
        expect(pending.activation).toBe(3);
        expect(pending.eligible).toBe(false);
    });

    it('copies the duration of each job and the next activation from the snapshot', () => {
        const { tasks } = edited();
        expect(tasks[0].jobs.map((job) => job.duration)).toEqual([6, 6]);
        expect(tasks[0].nextActivation).toBe(6);
    });
});
