import { describe, expect, it } from 'vitest';
import { activateDueJobs } from './activation';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import { createInitialState } from './snapshot';

const definition: TaskDefinition = {
    id: '1',
    color: 'F0E0D0',
    arrival: 0,
    duration: 3,
    period: 2,
    deadline: 4,
    rawEvents: '',
};

function stateFor(task: TaskDefinition) {
    return createInitialState({ ...DEFAULT_CONFIG, tasks: [task] });
}

describe('activateDueJobs', () => {
    it('stores the duration of the definition on each job', () => {
        const state = stateFor(definition);

        activateDueJobs(state);

        expect(state.tasks[0].jobs[0].duration).toBe(3);
    });

    it('advances nextActivation by the period and ends at null after ten jobs', () => {
        const state = stateFor(definition);

        state.clock = 2;
        activateDueJobs(state);
        expect(state.tasks[0].jobs).toHaveLength(2);
        expect(state.tasks[0].nextActivation).toBe(4);

        state.clock = 18;
        activateDueJobs(state);
        expect(state.tasks[0].jobs).toHaveLength(10);
        expect(state.tasks[0].nextActivation).toBeNull();
    });

    it('does not activate a concluded task', () => {
        const state = stateFor(definition);
        state.tasks[0].status = 'concluded';
        state.clock = 10;

        activateDueJobs(state);

        expect(state.tasks[0].jobs).toHaveLength(0);
    });
});
