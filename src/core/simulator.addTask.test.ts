import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import { createSimulator } from './createSimulator';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import type { EditItem } from './edit';
import { EditRefusal } from './refusal';
import type { Simulator } from './simulator';

const base: TaskDefinition = {
    id: 1,
    color: '112233',
    arrival: 0,
    duration: 2,
    period: 5,
    deadline: 5,
    rawEvents: '',
};
const make = (tasks: TaskDefinition[] = [base]) =>
    createSimulator({ ...DEFAULT_CONFIG, tasks });

type NewTask = Extract<EditItem, { kind: 'addTask' }>['task'];
const newTask = (changes: Partial<NewTask> = {}): NewTask => ({
    color: 'ABCDEF',
    arrival: 0,
    duration: 2,
    deadline: 4,
    period: 6,
    ...changes,
});
const add = (changes: Partial<NewTask> = {}): EditItem => ({
    kind: 'addTask',
    task: newTask(changes),
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

describe('task inclusion (DEC-46)', () => {
    it('adds a ready task with the next ID', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, add({ arrival: 4 }));
        const snapshot = sim.getCurrentSnapshot();
        expect(ids(sim)).toEqual([1, 2]);
        expect(snapshot.tasks[1]).toMatchObject({
            status: 'ready',
            jobs: [],
            definition: {
                id: 2,
                color: 'ABCDEF',
                arrival: 4,
                duration: 2,
                period: 6,
                deadline: 4,
                rawEvents: '',
            },
        });
        expect(snapshot.tasks[1].nextActivation).toBe(4);
        expect(snapshot.maxTaskId).toBe(2);
        // Inclusion has no event of its own; only an activation would show it.
        expect(JSON.stringify(snapshot.events)).not.toContain('"taskId":2');
    });

    it('activates at the current tick when the arrival equals it', () => {
        const sim = make();
        advance(sim, 3);
        edit(sim, add({ arrival: 3, duration: 1 }));
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.tasks[1].jobs).toHaveLength(1);
        expect(snapshot.events).toContainEqual({
            kind: 'activation',
            time: 3,
            job: { taskId: 2, index: 0 },
        });
        expect(snapshot.tasks[1].jobs[0]).toMatchObject({
            activation: 3,
            absoluteDeadline: 7,
        });
    });

    it('activates a later arrival only at that tick', () => {
        const sim = make();
        advance(sim, 1);
        edit(sim, add({ arrival: 3 }));
        expect(sim.getCurrentSnapshot().tasks[1].jobs).toHaveLength(0);
        advance(sim, 1);
        expect(sim.getCurrentSnapshot().tasks[1].jobs).toHaveLength(0);
        advance(sim, 1);
        expect(sim.getCurrentSnapshot().tasks[1].jobs).toHaveLength(1);
        expect(sim.getCurrentSnapshot().tasks[1].jobs[0].activation).toBe(3);
    });

    it('can add a task at tick 0', () => {
        const sim = make();
        edit(sim, add({ arrival: 0 }));
        const snapshot = sim.getCurrentSnapshot();
        expect(ids(sim)).toEqual([1, 2]);
        expect(snapshot.tasks[1].jobs).toHaveLength(1);
        expect(snapshot.maxTaskId).toBe(2);
    });

    it('refuses an arrival before the current tick, leaving everything as it was', () => {
        const sim = make();
        advance(sim, 3);
        const before = sim.getCurrentSnapshot();
        const refused = refusal(sim, add({ arrival: 2 }));
        expect(refused.items).toHaveLength(1);
        expect(refused.items[0]).toMatchObject({ index: 0, kind: 'addTask' });
        expect(refused.items[0].reason).toContain('ingresso');
        expect(refused.items[0].reason).toContain('3');
        expect(sim.getCurrentSnapshot()).toBe(before);
        expect(sim.getEdits(3)).toEqual([]);
    });

    it('gives the default period when none is informed and refuses zero (DEC-29)', () => {
        const sim = make();
        advance(sim, 1);
        const { period: _period, ...withoutPeriod } = newTask({ arrival: 1 });
        edit(sim, { kind: 'addTask', task: withoutPeriod });
        expect(sim.getCurrentSnapshot().tasks[1].definition.period).toBe(15);
        const refused = refusal(sim, add({ period: 0, color: '010101' }));
        expect(refused.items[0].reason).toContain('período');
        expect(ids(sim)).toEqual([1, 2]);
    });

    it('applies the limits of DEC-10 and reports each refused item', () => {
        const sim = make();
        const refused = refusal(
            sim,
            add({ duration: 0 }),
            add({ deadline: 0, color: '0A0B0C' }),
            add({ color: 'ZZZZZZ' }),
        );
        expect(refused.items.map((item) => item.index)).toEqual([0, 1, 2]);
        expect(refused.items[0].reason).toContain('duracao');
        expect(refused.items[1].reason).toContain('prazo');
        expect(refused.items[2].reason).toContain('cor');
        expect(ids(sim)).toEqual([1]);
    });

    it('refuses a color already used by any task, including concluded ones', () => {
        const sim = make();
        expect(
            refusal(sim, add({ color: '112233' })).items[0].reason,
        ).toContain('cor');
        edit(sim, add({ color: 'aabbcc', arrival: 9 }));
        expect(
            refusal(sim, add({ color: 'AABBCC' })).items[0].reason,
        ).toContain('cor');
        edit(sim, { kind: 'taskState', taskId: 2, state: 'concluded' });
        expect(
            refusal(sim, add({ color: 'aabbcc' })).items[0].reason,
        ).toContain('cor');
    });

    it('refuses the whole edit when one item is invalid', () => {
        const sim = make();
        refusal(sim, add({ color: '778899' }), add({ duration: 0 }));
        expect(ids(sim)).toEqual([1]);
        expect(sim.getCurrentSnapshot().maxTaskId).toBe(1);
    });

    it('refuses a malformed task with a reason', () => {
        const sim = make();
        const refused = refusal(sim, {
            kind: 'addTask',
        } as unknown as EditItem);
        expect(refused.items[0].reason).toContain('tarefa');
        expect(ids(sim)).toEqual([1]);
    });

    it('generates consecutive IDs inside one edit, after the highest used', () => {
        const sim = make([base, { ...base, id: 7, color: '334455' }]);
        edit(sim, add({ color: '000001' }), add({ color: '000002' }));
        expect(ids(sim)).toEqual([1, 7, 8, 9]);
        expect(sim.getCurrentSnapshot().maxTaskId).toBe(9);
    });

    it('does not duplicate the task when the same tick is edited again', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, add({ arrival: 5 }));
        edit(sim, { kind: 'quantum', quantum: 3 });
        expect(ids(sim)).toEqual([1, 2]);
        expect(sim.getEdits(2)).toHaveLength(2);
    });

    it('lets a later edit change the state of the included task', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, add({ arrival: 2 }));
        edit(sim, { kind: 'taskState', taskId: 2, state: 'suspended' });
        expect(sim.getCurrentSnapshot().tasks[1].status).toBe('suspended');
        expect(
            sim
                .getCurrentSnapshot()
                .cpus.some((cpu) => cpu.running?.taskId === 2),
        ).toBe(false);
    });

    it('reuses the ID of a discarded future and restores it with the history', () => {
        const sim = make();
        advance(sim, 4);
        sim.backward();
        sim.backward();
        edit(sim, add({ arrival: 9 }));
        expect(sim.getCurrentSnapshot().maxTaskId).toBe(2);
        advance(sim, 2);
        expect(ids(sim)).toEqual([1, 2]);
        sim.backward();
        sim.backward();
        sim.backward();
        expect(ids(sim)).toEqual([1]);
        expect(sim.getCurrentSnapshot().maxTaskId).toBe(1);
        sim.forward();
        sim.forward();
        sim.forward();
        expect(ids(sim)).toEqual([1, 2]);
        expect(sim.getCurrentSnapshot().maxTaskId).toBe(2);
        edit(sim, add({ color: '999999', arrival: 20 }));
        expect(ids(sim)).toEqual([1, 2, 3]);
    });

    it('lets the new task compete once activated', () => {
        const sim = make([{ ...base, duration: 5, deadline: 20, period: 20 }]);
        advance(sim, 1);
        edit(sim, add({ arrival: 1, duration: 1, deadline: 2, period: 10 }));
        // RM: shorter period wins the only CPU at the tick of the inclusion.
        expect(sim.getCurrentSnapshot().cpus[0].running).toEqual({
            taskId: 2,
            index: 0,
        });
        advance(sim, 1);
        expect(sim.getCurrentSnapshot().tasks[1].jobs[0].state).toBe(
            'completed',
        );
    });

    it('picks a color different from every other task when none is given', () => {
        const sim = make();
        advance(sim, 1);
        const { color: _color, ...withoutColor } = newTask({ arrival: 5 });
        edit(
            sim,
            { kind: 'addTask', task: withoutColor },
            { kind: 'addTask', task: withoutColor },
        );
        const colors = sim
            .getCurrentSnapshot()
            .tasks.map((tcb) => tcb.definition.color);
        expect(colors[1]).toMatch(/^[0-9A-F]{6}$/);
        expect(new Set(colors).size).toBe(3);
    });

    it('keeps the chosen color when the same tick is edited again', () => {
        const sim = make();
        advance(sim, 1);
        const { color: _color, ...withoutColor } = newTask({ arrival: 5 });
        edit(sim, { kind: 'addTask', task: withoutColor });
        const chosen = sim.getCurrentSnapshot().tasks[1].definition.color;
        edit(sim, { kind: 'quantum', quantum: 3 });
        expect(sim.getCurrentSnapshot().tasks[1].definition.color).toBe(chosen);
    });

    it('still refuses an informed color that is empty or invalid', () => {
        const sim = make();
        expect(refusal(sim, add({ color: '' })).items[0].reason).toContain(
            'cor',
        );
    });

    describe('with the characteristics of the same tick (#118)', () => {
        it('refuses another task taking the color of a task included in the tick', () => {
            const sim = make();
            advance(sim, 1);
            edit(sim, add({ arrival: 9, color: 'ABCDEF' }));
            const refused = refusal(sim, {
                kind: 'taskColor',
                taskId: 1,
                color: 'abcdef',
            });
            expect(refused.items[0].reason).toContain('cor');
            expect(sim.getCurrentSnapshot().tasks[0].definition.color).toBe(
                '112233',
            );
        });

        it('lets a later edit of the tick change the included task', () => {
            const sim = make();
            advance(sim, 1);
            edit(sim, add({ arrival: 9 }));
            edit(sim, { kind: 'taskDuration', taskId: 2, duration: 3 });
            expect(sim.getCurrentSnapshot().tasks[1].definition.duration).toBe(
                3,
            );
            expect(ids(sim)).toEqual([1, 2]);
        });

        it('activates the included task when its arrival is moved to now', () => {
            const sim = make();
            advance(sim, 2);
            edit(sim, add({ arrival: 9 }));
            edit(sim, { kind: 'taskArrival', taskId: 2, arrival: 2 });
            expect(sim.getCurrentSnapshot().tasks[1].jobs).toHaveLength(1);
            expect(sim.getCurrentSnapshot().tasks[1].jobs[0].duration).toBe(2);
        });

        it('activates with the net definition of the tick, not the one first asked for', () => {
            const sim = make();
            advance(sim, 2);
            edit(sim, add({ arrival: 2, duration: 2 }));
            edit(sim, { kind: 'taskDuration', taskId: 2, duration: 3 });
            expect(sim.getCurrentSnapshot().tasks[1].jobs[0].duration).toBe(3);
        });
    });
});
