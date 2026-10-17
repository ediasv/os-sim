import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type Job, type TaskDefinition } from './domain';
import { findEligibleJobs } from './eligibility';
import { createInitialState } from './snapshot';

const task: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 0,
    duration: 2,
    period: 3,
    deadline: 2,
    rawEvents: '',
};

function job(index: number, state: Job['state'], taskId = 1): Job {
    return {
        taskId,
        index,
        activation: index,
        absoluteDeadline: index + 2,
        executed: 0,
        state,
        completedAt: state === 'completed' ? index + 1 : null,
        deadlineMissed: false,
    };
}

describe('findEligibleJobs', () => {
    it('skips completed jobs and returns only the oldest incomplete job', () => {
        const state = createInitialState({
            ...DEFAULT_CONFIG,
            tasks: [task],
        });
        state.tasks[0].jobs.push(
            job(0, 'completed'),
            job(1, 'ready'),
            job(2, 'ready'),
        );

        expect(findEligibleJobs(state)).toEqual([{ taskId: 1, index: 1 }]);
    });

    it('does not let a later job pass a suspended oldest incomplete job', () => {
        const secondTask = { ...task, id: 2, color: 'AABBCC' };
        const state = createInitialState({
            ...DEFAULT_CONFIG,
            tasks: [task, secondTask],
        });
        state.tasks[0].jobs.push(job(0, 'completed'), job(1, 'ready'));
        state.tasks[1].jobs.push(job(0, 'suspended', 2), job(1, 'ready', 2));

        expect(findEligibleJobs(state)).toEqual([{ taskId: 1, index: 1 }]);
    });

    it('returns frozen refs so callers cannot mutate eligibility results', () => {
        const state = createInitialState({
            ...DEFAULT_CONFIG,
            tasks: [task],
        });
        state.tasks[0].jobs.push(job(0, 'ready'));

        const eligible = findEligibleJobs(state);

        expect(Object.isFrozen(eligible)).toBe(true);
        expect(Object.isFrozen(eligible[0])).toBe(true);
    });
});
