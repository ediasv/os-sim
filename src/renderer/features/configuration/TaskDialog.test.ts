// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigIssue } from '../../../core/config';
import TaskDialog from './TaskDialog.vue';

enableAutoUnmount(afterEach);

const initial = {
    id: '2',
    color: 'F28C59',
    arrival: 0,
    duration: 4,
    period: 15,
    deadline: 12,
};
const base = { initial, editing: false, taskIndex: 1 };

function field(wrapper: ReturnType<typeof mount>, label: string) {
    const label_ = wrapper.findAll('label').find((l) => l.text() === label)!;
    return wrapper.get<HTMLInputElement>(`#${label_.attributes('for')}`);
}

const button = (wrapper: ReturnType<typeof mount>, text: string) =>
    wrapper.findAll('button').find((b) => b.text() === text);

describe('TaskDialog', () => {
    it('adds: titled as new, with the id fixed and the default period', () => {
        const wrapper = mount(TaskDialog, { props: base });

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Adicionar tarefa',
        );
        expect(field(wrapper, 'ID').element.value).toBe('2');
        expect(field(wrapper, 'ID').element.disabled).toBe(true);
        expect(field(wrapper, 'Período').element.value).toBe('15');
        expect(button(wrapper, 'Remover tarefa')).toBeUndefined();
    });

    it('edits: titled with the task and offering removal', async () => {
        const wrapper = mount(TaskDialog, {
            props: { ...base, editing: true },
        });

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Editar Tarefa 2',
        );
        await button(wrapper, 'Remover tarefa')!.trigger('click');
        expect(wrapper.emitted('remove')).toHaveLength(1);
    });

    it('applies the typed values, trimming the color and reading numbers', async () => {
        const wrapper = mount(TaskDialog, { props: base });

        await field(wrapper, 'Cor').setValue(' 112233 ');
        await field(wrapper, 'Ingresso').setValue('2');
        await field(wrapper, 'Duração').setValue('3');
        await field(wrapper, 'Período').setValue('20');
        await field(wrapper, 'Prazo relativo').setValue('9');
        await button(wrapper, 'Aplicar')!.trigger('click');

        expect(wrapper.emitted('apply')).toEqual([
            [
                {
                    id: '2',
                    color: '112233',
                    arrival: 2,
                    duration: 3,
                    period: 20,
                    deadline: 9,
                },
            ],
        ]);
    });

    it('does not decide validity: zero and blank go to the owner as typed', async () => {
        const wrapper = mount(TaskDialog, { props: base });

        await field(wrapper, 'Período').setValue('0');
        await field(wrapper, 'Duração').setValue('');
        await button(wrapper, 'Aplicar')!.trigger('click');

        const [[values]] = wrapper.emitted('apply') as [
            [{ period: number; duration: number }],
        ];
        expect(values.period).toBe(0);
        expect(values.duration).toBeNaN();
    });

    it('shows the reasons of this task at their fields and the others apart', () => {
        const issues: ConfigIssue[] = [
            {
                field: 'period',
                taskIndex: 1,
                message: 'Período deve ser maior que zero.',
            },
            {
                field: 'color',
                taskIndex: 0,
                message: 'Cor repetida na 1ª tarefa.',
            },
            { field: 'quantum', message: 'Quantum inválido.' },
        ];
        const wrapper = mount(TaskDialog, { props: { ...base, issues } });

        expect(field(wrapper, 'Período').attributes('aria-invalid')).toBe(
            'true',
        );
        expect(
            field(wrapper, 'Cor').attributes('aria-invalid'),
        ).toBeUndefined();
        expect(wrapper.text()).toContain('Período deve ser maior que zero.');
        const alerts = wrapper.findAll('[role="alert"]').map((a) => a.text());
        expect(alerts).toEqual([
            expect.stringContaining('Cor repetida na 1ª tarefa.'),
            expect.stringContaining('Quantum inválido.'),
        ]);
        expect(field(wrapper, 'Período').element.value).toBe('15');
    });

    it('shows the chosen color as a swatch only when it is a valid color', async () => {
        const wrapper = mount(TaskDialog, { props: base });
        expect(wrapper.find('.task-dialog__swatch').exists()).toBe(true);

        await field(wrapper, 'Cor').setValue('zzz');

        expect(wrapper.find('.task-dialog__swatch').exists()).toBe(false);
    });

    it('cancels with the button, the close button and Escape, applying nothing', async () => {
        const wrapper = mount(TaskDialog, { props: base });

        await button(wrapper, 'Cancelar')!.trigger('click');
        await wrapper.get('button[aria-label="Fechar"]').trigger('click');
        await wrapper
            .get('[role="dialog"]')
            .trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('cancel')).toHaveLength(3);
        expect(wrapper.emitted('apply')).toBeUndefined();
    });
});
