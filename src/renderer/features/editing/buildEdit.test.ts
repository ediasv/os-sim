import { describe, expect, it } from 'vitest';
import {
    buildAddTask,
    buildSystemEdit,
    buildTaskEdit,
    refusalsByField,
    type AddTaskDraft,
    type SystemDraft,
    type TaskDraft,
} from './buildEdit';

const original: TaskDraft = {
    color: 'F28C59',
    arrival: '0',
    duration: '4',
    deadline: '12',
    period: '15',
    state: 'ready',
};

function itemsOf(result: ReturnType<typeof buildTaskEdit>) {
    if (!result.ok) throw new Error('expected a built edit');
    return result.edit;
}

describe('buildTaskEdit', () => {
    it('builds no item when nothing changed', () => {
        const edit = itemsOf(buildTaskEdit('2', original, { ...original }));
        expect(edit.items).toEqual([]);
    });

    it('builds one item per changed field, in form order, with the field of each', () => {
        const edit = itemsOf(
            buildTaskEdit('2', original, {
                ...original,
                period: '8',
                color: '102030',
            }),
        );
        expect(edit.items).toEqual([
            { kind: 'taskColor', taskId: '2', color: '102030' },
            { kind: 'taskPeriod', taskId: '2', period: 8 },
        ]);
        expect(edit.fields).toEqual(['color', 'period']);
    });

    it('passes period zero to the core, which refuses it with the reason (DEC-37)', () => {
        const edit = itemsOf(
            buildTaskEdit('2', original, { ...original, period: '0' }),
        );
        expect(edit.items).toEqual([
            { kind: 'taskPeriod', taskId: '2', period: 0 },
        ]);
    });

    it('treats a numerically equal text as unchanged', () => {
        const edit = itemsOf(
            buildTaskEdit('2', original, { ...original, duration: '04' }),
        );
        expect(edit.items).toEqual([]);
    });

    it('puts the state last so characteristic edits are judged before finishing', () => {
        const edit = itemsOf(
            buildTaskEdit('2', original, {
                ...original,
                state: 'concluded',
                color: '102030',
            }),
        );
        expect(edit.items.map((item) => item.kind)).toEqual([
            'taskColor',
            'taskState',
        ]);
        expect(edit.fields).toEqual(['color', 'state']);
    });

    it.each(['', ' ', '2.5', 'abc', '-1'])(
        'rejects %j as a duration before sending anything',
        (text) => {
            const result = buildTaskEdit('2', original, {
                ...original,
                duration: text,
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(Object.keys(result.errors)).toEqual(['duration']);
            }
        },
    );

    it('reports every malformed field at once', () => {
        const result = buildTaskEdit('2', original, {
            ...original,
            duration: 'x',
            deadline: '',
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(Object.keys(result.errors).sort()).toEqual([
                'deadline',
                'duration',
            ]);
        }
    });
});

describe('buildSystemEdit', () => {
    const base: SystemDraft = { algorithm: 'RM', quantum: '5', cpuCount: '3' };

    it('builds the items of the changed fields', () => {
        const result = buildSystemEdit(base, {
            algorithm: 'EDF',
            quantum: '2',
            cpuCount: '3',
        });
        if (!result.ok) throw new Error('expected a built edit');
        expect(result.edit.items).toEqual([
            { kind: 'algorithm', algorithm: 'EDF' },
            { kind: 'quantum', quantum: 2 },
        ]);
        expect(result.edit.fields).toEqual(['algorithm', 'quantum']);
    });

    it('sends quantum zero so the core refuses it with the reason', () => {
        const result = buildSystemEdit(base, { ...base, quantum: '0' });
        if (!result.ok) throw new Error('expected a built edit');
        expect(result.edit.items).toEqual([{ kind: 'quantum', quantum: 0 }]);
    });

    it('rejects a malformed CPU count', () => {
        const result = buildSystemEdit(base, { ...base, cpuCount: 'x' });
        expect(result.ok).toBe(false);
    });
});

describe('buildAddTask', () => {
    const draft: AddTaskDraft = {
        id: '',
        color: '',
        arrival: '8',
        duration: '3',
        deadline: '6',
        period: '',
    };

    it('leaves a blank ID, color and period to the core (DEC-29, DEC-48)', () => {
        const result = buildAddTask(draft);
        if (!result.ok) throw new Error('expected a built edit');
        expect(result.edit.items).toEqual([
            {
                kind: 'addTask',
                task: { arrival: 8, duration: 3, deadline: 6 },
            },
        ]);
        expect(result.edit.fields).toEqual(['task']);
    });

    it('sends a typed ID, color and period', () => {
        const result = buildAddTask({
            ...draft,
            id: 'X1',
            color: '102030',
            period: '9',
        });
        if (!result.ok) throw new Error('expected a built edit');
        expect(result.edit.items[0]).toEqual({
            kind: 'addTask',
            task: {
                id: 'X1',
                color: '102030',
                arrival: 8,
                duration: 3,
                deadline: 6,
                period: 9,
            },
        });
    });

    it('requires arrival, duration and deadline', () => {
        const result = buildAddTask({ ...draft, arrival: '' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(Object.keys(result.errors)).toEqual(['arrival']);
        }
    });
});

describe('refusalsByField', () => {
    it('maps each refused item back to the field that produced it', () => {
        const edit = itemsOf(
            buildTaskEdit('2', original, {
                ...original,
                color: '102030',
                duration: '5',
                period: '0',
            }),
        );
        expect(
            refusalsByField(edit, [
                { index: 0, kind: 'taskColor', reason: 'Cor repetida.' },
                { index: 2, kind: 'taskPeriod', reason: 'Período ≥ 1.' },
            ]),
        ).toEqual({ color: 'Cor repetida.', period: 'Período ≥ 1.' });
    });
});
