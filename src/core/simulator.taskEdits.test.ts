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
