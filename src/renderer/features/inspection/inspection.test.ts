import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../../core/domain';
import { projectFutureJob, projectInspection } from './inspection';

function snapshot(): SimulationState {
    return {
        clock: 8,
        config: {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [
                {
                    id: 1,
                    color: 'F0E0D0',
                    arrival: 0,
                    duration: 3,
                    period: 5,
                    deadline: 4,
                    rawEvents: '',
                },
                {
                    id: 2,
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
                definition: {
                    id: 1,
                    color: 'F0E0D0',
                    arrival: 0,
                    duration: 3,
                    period: 5,
                    deadline: 4,
                    rawEvents: '',
                },
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
                        executed: 1,
                        state: 'ready',
                        completedAt: null,
                        deadlineMissed: true,
                    },
                ],
            },
            {
                definition: {
                    id: 2,
                    color: 'D0E0F0',
                    arrival: 0,
                    duration: 2,
                    period: 0,
                    deadline: 2,
                    rawEvents: '',
                },
                jobs: [
                    {
                        taskId: 2,
                        index: 0,
                        activation: 0,
                        absoluteDeadline: 2,
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
                running: { taskId: 1, index: 1 },
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
                taskId: 1,
                index: 3,
                activation: 15,
                absoluteDeadline: 19,
            }),
        ).toEqual({
            availability: 'future',
            ref: { taskId: 1, index: 3 },
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
