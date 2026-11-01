import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import { createSimulator } from './createSimulator';
import { findInconsistencies } from './consistency';

const task = (
    id = 1,
    changes: Partial<TaskDefinition> = {},
): TaskDefinition => ({
    id,
    color: id === 1 ? '112233' : '445566',
    arrival: 0,
    duration: 5,
    period: 2,
    deadline: 3,
    rawEvents: '',
    ...changes,
});
const make = () => createSimulator({ ...DEFAULT_CONFIG, tasks: [task()] });

describe('task color edit in the engine', () => {
    it('replaces the definition without events or mutation of earlier snapshots', () => {
        const sim = make();
        sim.tick();
        const before = sim.getCurrentSnapshot();
        const eventCount = before.events.length;
        sim.edit([{ kind: 'taskColor', taskId: 1, color: 'aabbcc' }]);
        const after = sim.getCurrentSnapshot();
        expect(after.tasks[0].definition.color).toBe('AABBCC');
        expect(after.events).toHaveLength(eventCount);
        expect(findInconsistencies(after)).toEqual([]);
        expect(before.tasks[0].definition.color).toBe('112233');
    });
    it('leaves the definition untouched when the color returns to the original', () => {
        const sim = make();
        const original = sim.getCurrentSnapshot().tasks[0].definition;
        sim.edit([
            { kind: 'taskColor', taskId: 1, color: 'aabbcc' },
            { kind: 'taskColor', taskId: 1, color: '112233' },
        ]);
        expect(sim.getCurrentSnapshot().tasks[0].definition).toEqual(original);
    });
});

describe('task duration and deadline edit in the engine', () => {
    it('keeps the duration of a job already activated', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { period: 20, deadline: 30 })],
        });
        for (let step = 0; step < 4; step++) sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 2 }]);
        for (let step = 0; step < 3; step++) sim.tick();
        const snapshot = sim.getCurrentSnapshot();
        const job = snapshot.tasks[0].jobs[0];
        expect(job.duration).toBe(5);
        expect(job.completedAt).toBe(5);
        expect(snapshot.tasks[0].definition.duration).toBe(2);
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('gives the new duration only to later jobs', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { period: 4, deadline: 4, duration: 1 })],
        });
        sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 3 }]);
        for (let step = 0; step < 5; step++) sim.tick();
        const { jobs } = sim.getCurrentSnapshot().tasks[0];
        expect(jobs.map((job) => job.duration)).toEqual([1, 3]);
    });
    it('keeps the absolute deadline of jobs already activated', () => {
        const sim = make();
        sim.tick();
        sim.edit([{ kind: 'taskDeadline', taskId: 1, deadline: 10 }]);
        for (let step = 0; step < 3; step++) sim.tick();
        const snapshot = sim.getCurrentSnapshot();
        const { jobs } = snapshot.tasks[0];
        expect(jobs[0].absoluteDeadline).toBe(3);
        expect(jobs[0].deadlineMissed).toBe(true);
        expect(jobs[1].activation).toBe(2);
        expect(jobs[1].absoluteDeadline).toBe(12);
        expect(
            snapshot.events.filter((event) => event.kind === 'deadline-miss'),
        ).toMatchObject([{ time: 3, job: { taskId: 1, index: 0 } }]);
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('records no event for the edit', () => {
        const sim = make();
        sim.tick();
        const count = sim.getCurrentSnapshot().events.length;
        sim.edit([
            { kind: 'taskDuration', taskId: 1, duration: 2 },
            { kind: 'taskDeadline', taskId: 1, deadline: 9 },
        ]);
        expect(sim.getCurrentSnapshot().events).toHaveLength(count);
    });
});

describe('task arrival edit in the engine', () => {
    const later = () =>
        createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { arrival: 5, period: 20, deadline: 30 })],
        });
    const activations = (sim: ReturnType<typeof later>) =>
        sim
            .getCurrentSnapshot()
            .events.filter((event) => event.kind === 'activation');

    it('moves the first activation later', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 8 }]);
        while (sim.getCurrentSnapshot().clock < 9) sim.tick();
        expect(activations(sim)).toMatchObject([{ time: 8 }]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs[0].activation).toBe(8);
    });
    it('activates and dispatches in the same tick when moved to the clock', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 2 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(activations(sim)).toMatchObject([{ time: 2 }]);
        expect(snapshot.tasks[0].jobs).toHaveLength(1);
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('activates and dispatches at tick 0', () => {
        const sim = later();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 0 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(activations(sim)).toMatchObject([{ time: 0 }]);
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('refuses an arrival before the clock', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 1 }]),
        ).toThrow(/maior ou igual ao tick atual \(2\)/);
    });
    it('refuses after the first activation, even at the arrival tick', () => {
        const sim = make();
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 0 }]),
        ).toThrow(
            'O ingresso não pode ser alterado pois a tarefa já ingressou.',
        );
    });
    it('gives a suspended task its job without CPU', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([
            { kind: 'taskState', taskId: 1, state: 'suspended' },
            { kind: 'taskArrival', taskId: 1, arrival: 2 },
        ]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.tasks[0].status).toBe('suspended');
        expect(snapshot.tasks[0].jobs).toHaveLength(1);
        expect(snapshot.cpus[0].running).toBeNull();
        expect(
            snapshot.events
                .filter((event) => event.time === 2)
                .map((event) => event.kind),
        ).toEqual(['suspension', 'activation']);
    });
    it('leaves no trace when the arrival returns to the original', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        const count = sim.getCurrentSnapshot().events.length;
        sim.edit([
            { kind: 'taskArrival', taskId: 1, arrival: 8 },
            { kind: 'taskArrival', taskId: 1, arrival: 5 },
        ]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.events).toHaveLength(count);
        expect(snapshot.tasks[0].jobs).toEqual([]);
        while (sim.getCurrentSnapshot().clock < 6) sim.tick();
        expect(activations(sim)).toMatchObject([{ time: 5 }]);
    });
});
