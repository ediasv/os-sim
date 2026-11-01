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
