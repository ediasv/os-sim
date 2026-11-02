import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import { DEFAULT_POLICIES } from '../../../core/policies';
import { projectInspection } from '../inspection/inspection';
import {
    addTaskForm,
    systemForm,
    taskForm,
    toAddTaskDraft,
    toSystemDraft,
    toTaskDraft,
    type FormField,
} from './forms';

const definition = (id: string, arrival: number, period: number) => ({
    id,
    color: id === '1' ? 'F0E0D0' : 'D0E0F0',
    arrival,
    duration: 3,
    period,
    deadline: 6,
    rawEvents: '',
});

/** Task 1 already activated; task 2 arrives at tick 5. */
function tasks(
    ticks = 1,
    edit?: Parameters<ReturnType<typeof createSimulator>['edit']>[0],
) {
    const sim = createSimulator(
        {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [definition('1', 0, 20), definition('2', 5, 20)],
        },
        DEFAULT_POLICIES,
    );
    if (edit) sim.edit(edit);
    for (let i = 0; i < ticks; i++) sim.tick();
    return projectInspection(sim.getCurrentSnapshot()).tasks;
}

const field = (fields: readonly FormField[], key: string) =>
    fields.find((candidate) => candidate.key === key)!;

describe('taskForm', () => {
    it('starts from the values of the task, with the ID shown and fixed', () => {
        const [task] = tasks();
        const { fields, initial } = taskForm(task);
        expect(initial).toEqual({
            color: 'F0E0D0',
            arrival: '0',
            duration: '3',
            deadline: '6',
            period: '20',
            state: 'ready',
        });
        expect(field(fields, 'id').disabled).toBe(true);
        expect(field(fields, 'id').hint).toBe(
            'O ID não muda depois de criado.',
        );
    });

    it('locks the arrival of a task that already activated and says why', () => {
        const [activated, waiting] = tasks();
        expect(field(taskForm(activated).fields, 'arrival')).toMatchObject({
            disabled: true,
            disabledReason:
                'O ingresso não pode ser alterado pois a tarefa já ingressou.',
        });
        expect(field(taskForm(waiting).fields, 'arrival').disabled).toBeFalsy();
    });

    it('says duration and deadline only reach the next activation', () => {
        const [task] = tasks();
        const { fields } = taskForm(task);
        for (const key of ['duration', 'deadline']) {
            expect(field(fields, key).hint).toContain(
                'a partir da próxima ativação',
            );
            expect(field(fields, key).hint).toContain('jobs já ativados');
        }
    });

    it('explains the period: RM priority now, and the kept value in EDF once exhausted', () => {
        const [task] = tasks();
        const period = field(taskForm(task).fields, 'period');
        expect(period.hint).toContain('prioridade no RM já neste tick');
        expect(period.hint).toContain('Próxima ativação: tick 20');
        expect(period.hint).not.toContain('EDF');

        const exhausted = { ...task, nextActivation: null };
        expect(field(taskForm(exhausted).fields, 'period').hint).toContain(
            'no EDF fica guardado, sem efeito visível',
        );
    });

    it('offers the four states and warns about suspending, resuming and finishing', () => {
        const [task] = tasks();
        const state = field(taskForm(task).fields, 'state');
        expect(state.options?.map((option) => option.value)).toEqual([
            'ready',
            'forced',
            'suspended',
            'concluded',
        ]);
        expect(state.hint).toContain('Suspender não pausa o prazo');
        expect(state.hint).toContain('retomar não garante CPU');
        expect(state.hint).toContain('interrompe os jobs incompletos');
    });

    it('accepts only the color of a concluded task (DEC-37)', () => {
        const [task] = tasks(1, [
            { kind: 'taskState', taskId: '1', state: 'concluded' },
        ]);
        const { fields } = taskForm(task);
        expect(field(fields, 'color').disabled).toBeFalsy();
        for (const key of [
            'arrival',
            'duration',
            'deadline',
            'period',
            'state',
        ]) {
            expect(field(fields, key).disabled).toBe(true);
        }
    });
});

describe('systemForm', () => {
    it('warns that the quantum keeps the slice consumed and that CPUs can migrate jobs', () => {
        const { fields, initial } = systemForm({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 3,
        });
        expect(initial).toEqual({
            algorithm: 'RM',
            quantum: '5',
            cpuCount: '3',
        });
        expect(field(fields, 'algorithm').disabled).toBeFalsy();
        expect(field(fields, 'quantum').hint).toContain(
            'preserva o consumo da fatia atual',
        );
        expect(field(fields, 'cpuCount').hint).toContain('maior ID');
    });
});

describe('addTaskForm', () => {
    it('starts at the inspected tick with the suggested ID and the default period 15 (DEC-29)', () => {
        const { initial } = addTaskForm('3', 8);
        expect(initial).toMatchObject({ id: '3', arrival: '8', period: '15' });
    });
});

describe('draft readers', () => {
    it('read form values back into the drafts the builders take', () => {
        expect(
            toTaskDraft({
                color: 'F0E0D0',
                arrival: '0',
                duration: '3',
                deadline: '6',
                period: '20',
                state: 'forced',
            }),
        ).toMatchObject({ state: 'forced', duration: '3' });
        expect(
            toSystemDraft({ algorithm: 'EDF', quantum: '2', cpuCount: '1' }),
        ).toEqual({ algorithm: 'EDF', quantum: '2', cpuCount: '1' });
        expect(
            toAddTaskDraft({
                id: 'X',
                color: '',
                arrival: '1',
                duration: '2',
                deadline: '3',
                period: '15',
            }).id,
        ).toBe('X');
    });
});
