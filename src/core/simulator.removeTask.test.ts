import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import { createSimulator } from './createSimulator';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import type { EditItem } from './edit';
import { EditRefusal } from './refusal';
import type { Simulator } from './simulator';

const task = (id: string, changes: Partial<TaskDefinition> = {}) => ({
    id,
    color: `00000${id}`,
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
    ...changes,
});
/** Task 1 runs from tick 0; task 2 arrives only at tick 10. */
const make = (cpuCount = 1) =>
    createSimulator({
        ...DEFAULT_CONFIG,
        cpuCount,
        tasks: [task('1'), task('2', { arrival: 10 })],
    });
const remove = (taskId: string): EditItem => ({ kind: 'removeTask', taskId });
const add = (changes: Partial<TaskDefinition> = {}): EditItem => ({
    kind: 'addTask',
    task: {
        color: 'ABCDEF',
        arrival: 20,
        duration: 2,
        deadline: 4,
        ...changes,
    },
});

function advance(sim: Simulator, ticks: number) {
    for (let i = 0; i < ticks; i++) sim.tick();
}
function edit(sim: Simulator, ...items: EditItem[]) {
    sim.edit(items);
    expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
}
function refusal(sim: Simulator, ...items: EditItem[]): EditRefusal {
    try {
        sim.edit(items);
    } catch (error) {
        expect(error).toBeInstanceOf(EditRefusal);
        return error as EditRefusal;
    }
    throw new Error('the edit should have been refused');
}
const ids = (sim: Simulator) =>
    sim.getCurrentSnapshot().tasks.map((tcb) => tcb.definition.id);
/** Events that name the task, whatever their kind. */
const eventsOf = (sim: Simulator, taskId: string) =>
    sim
        .getCurrentSnapshot()
        .events.filter((event) => 'taskId' in event && event.taskId === taskId);

describe('task exclusion (DEC-47)', () => {
    it('removes a task never activated, without trace', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, remove('2'));
        const snapshot = sim.getCurrentSnapshot();
        expect(ids(sim)).toEqual(['1']);
        expect(eventsOf(sim, '2')).toEqual([]);
        expect(snapshot.usedTaskIds).toEqual(['1', '2']);
        expect(sim.getEdits(2)).toHaveLength(1);
    });

    it('refuses a task already activated and points to concluding it', () => {
        const sim = make();
        advance(sim, 2);
        const before = sim.getCurrentSnapshot();
        const refused = refusal(sim, remove('1'));
        expect(refused.items[0]).toMatchObject({
            index: 0,
            kind: 'removeTask',
        });
        expect(refused.items[0].reason).toContain('encerr');
        expect(sim.getCurrentSnapshot()).toBe(before);
    });

    it('refuses a task whose first job is activated at the current tick', () => {
        const sim = make();
        advance(sim, 10);
        expect(refusal(sim, remove('2')).items[0].reason).toContain('encerr');
    });

    it('refuses an unknown or malformed task ID', () => {
        const sim = make();
        expect(refusal(sim, remove('9')).items[0].reason).toContain('9');
        const bad = refusal(sim, {
            kind: 'removeTask',
            taskId: 2,
        } as unknown as EditItem);
        expect(bad.items[0].reason).toContain('texto');
        expect(ids(sim)).toEqual(['1', '2']);
    });

    it('refuses the whole edit when another item is refused', () => {
        const sim = make();
        advance(sim, 1);
        const refused = refusal(sim, remove('2'), remove('1'));
        expect(refused.items.map((item) => item.index)).toEqual([1]);
        expect(ids(sim)).toEqual(['1', '2']);
    });

    it('refuses removing the same task twice and changing a removed task', () => {
        const sim = make();
        expect(refusal(sim, remove('2'), remove('2')).items[0].index).toBe(1);
        const later = refusal(sim, remove('2'), {
            kind: 'taskState',
            taskId: '2',
            state: 'suspended',
        });
        expect(later.items[0].index).toBe(1);
        expect(ids(sim)).toEqual(['1', '2']);
    });

    it('spends the ID of a task included and excluded in the same tick', () => {
        const sim = make();
        advance(sim, 2);
        const before = sim.getCurrentSnapshot().events;
        edit(sim, add(), remove('3'));
        expect(ids(sim)).toEqual(['1', '2']);
        expect(sim.getCurrentSnapshot().events).toEqual(before);
        expect(sim.getCurrentSnapshot().usedTaskIds).toEqual(['1', '2', '3']);
        edit(sim, add({ color: 'FEDCBA' }));
        expect(ids(sim)).toEqual(['1', '2', '4']);
    });

    it('does not reuse the ID of an excluded task', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, add());
        expect(ids(sim)).toEqual(['1', '2', '3']);
        advance(sim, 1);
        edit(sim, remove('3'));
        advance(sim, 1);
        edit(sim, add({ color: 'FEDCBA' }));
        expect(ids(sim)).toEqual(['1', '2', '4']);
    });

    it('frees the ID when the future that generated it is discarded', () => {
        const sim = make();
        advance(sim, 3);
        edit(sim, add());
        edit(sim, remove('3'));
        advance(sim, 1);
        expect(sim.getCurrentSnapshot().usedTaskIds).toEqual(['1', '2', '3']);
        sim.backward();
        sim.backward();
        sim.backward();
        edit(sim, add({ color: 'FEDCBA' }));
        expect(ids(sim)).toEqual(['1', '2', '3']);
    });

    it('removes earlier events of the task from the current step only', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, { kind: 'taskState', taskId: '2', state: 'suspended' });
        advance(sim, 1);
        expect(eventsOf(sim, '2')).toHaveLength(1);
        edit(sim, remove('2'));
        expect(eventsOf(sim, '2')).toEqual([]);
        sim.backward();
        expect(eventsOf(sim, '2')).toHaveLength(1);
        sim.forward();
        expect(ids(sim)).toEqual(['1']);
        expect(eventsOf(sim, '2')).toEqual([]);
    });

    it('leaves no event when a task is changed and removed in one tick', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, { kind: 'taskState', taskId: '2', state: 'forced' });
        edit(sim, remove('2'));
        expect(eventsOf(sim, '2')).toEqual([]);
        expect(
            sim.getCurrentSnapshot().events.some((e) => e.kind === 'forced'),
        ).toBe(false);
    });

    it('stops counting a removed forced task against the CPUs', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, { kind: 'taskState', taskId: '2', state: 'forced' });
        edit(sim, add({ arrival: 30 }));
        expect(
            refusal(sim, { kind: 'taskState', taskId: '3', state: 'forced' })
                .items[0].reason,
        ).toContain('CPU');
        advance(sim, 1);
        edit(sim, remove('2'));
        edit(sim, { kind: 'taskState', taskId: '3', state: 'forced' });
        expect(sim.getCurrentSnapshot().tasks[1].status).toBe('forced');
    });

    it('can remove a concluded task never activated', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, { kind: 'taskState', taskId: '2', state: 'concluded' });
        advance(sim, 1);
        edit(sim, remove('2'));
        expect(ids(sim)).toEqual(['1']);
        expect(eventsOf(sim, '2')).toEqual([]);
    });

    it('frees the color of a removed task for an item of the same edit', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, remove('2'), add({ color: '000002' }));
        expect(ids(sim)).toEqual(['1', '3']);
    });

    it('survives replaying the tick when it is edited again', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, remove('2'));
        edit(sim, { kind: 'quantum', quantum: 3 });
        expect(ids(sim)).toEqual(['1']);
        expect(sim.getEdits(2)).toHaveLength(2);
    });
});
