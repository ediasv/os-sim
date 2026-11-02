// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import EditDialog from './EditDialog.vue';
import type { FormField } from './forms';

enableAutoUnmount(afterEach);

const fields: readonly FormField[] = [
    { key: 'id', label: 'ID', disabled: true, hint: 'O ID não muda.' },
    {
        key: 'period',
        label: 'Período',
        unit: 'ticks',
        hint: 'Ticks entre ativações.',
    },
    {
        key: 'state',
        label: 'Estado',
        options: [
            { value: 'ready', label: 'Pronta' },
            { value: 'suspended', label: 'Suspensa' },
        ],
        wide: true,
    },
    {
        key: 'arrival',
        label: 'Ingresso',
        disabled: true,
        disabledReason:
            'O ingresso não pode ser alterado pois a tarefa já ingressou.',
    },
];

const initial = { id: '2', period: '15', state: 'ready', arrival: '0' };

function mountDialog(props: Record<string, unknown> = {}) {
    return mount(EditDialog, {
        props: {
            open: true,
            title: 'Editar Tarefa 2',
            fields,
            initial,
            ...props,
        },
        attachTo: document.body,
    });
}

const button = (wrapper: ReturnType<typeof mountDialog>, text: string) =>
    wrapper.findAll('button').find((candidate) => candidate.text() === text)!;

describe('EditDialog', () => {
    it('renders each field with its value, hint, unit and select options', () => {
        const wrapper = mountDialog();
        expect(
            (
                wrapper.get('input[type="text"]:not([disabled])')
                    .element as HTMLInputElement
            ).value,
        ).toBe('15');
        expect(wrapper.text()).toContain('Ticks entre ativações.');
        expect(wrapper.text()).toContain('ticks');
        expect(
            wrapper.findAll('option').map((option) => option.text()),
        ).toEqual(['Pronta', 'Suspensa']);
    });

    it('shows why a field is blocked and keeps it disabled', () => {
        const wrapper = mountDialog();
        expect(wrapper.text()).toContain(
            'O ingresso não pode ser alterado pois a tarefa já ingressou.',
        );
        const arrival = wrapper
            .findAll('input')
            .find(
                (input) => (input.element as HTMLInputElement).value === '0',
            )!;
        expect(arrival.attributes('disabled')).toBeDefined();
    });

    it('keeps Aplicar off until something changed, then submits every value', async () => {
        const wrapper = mountDialog();
        expect(button(wrapper, 'Aplicar').attributes('disabled')).toBeDefined();

        await wrapper.get('input[type="text"]:not([disabled])').setValue('8');
        await wrapper.get('select').setValue('suspended');
        expect(
            button(wrapper, 'Aplicar').attributes('disabled'),
        ).toBeUndefined();

        await button(wrapper, 'Aplicar').trigger('click');
        expect(wrapper.emitted('submit')).toEqual([
            [{ id: '2', period: '8', state: 'suspended', arrival: '0' }],
        ]);
    });

    it('shows the refusal on its field and keeps what the user typed', async () => {
        const wrapper = mountDialog();
        await wrapper.get('input[type="text"]:not([disabled])').setValue('0');

        await wrapper.setProps({
            errors: { period: 'O período deve ser pelo menos 1.' },
        });

        expect(wrapper.get('[role="alert"]').text()).toBe(
            'O período deve ser pelo menos 1.',
        );
        expect(
            (
                wrapper.get('input[type="text"]:not([disabled])')
                    .element as HTMLInputElement
            ).value,
        ).toBe('0');
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('shows the notice about discarding the future and a form-level message', () => {
        const wrapper = mountDialog({
            notice: {
                title: 'Editando no tick 8 de 13',
                message:
                    'Ao aplicar, os ticks 9–13 do histórico são descartados.',
            },
            message: 'Item 1 (addTask): ingresso anterior ao tick.',
        });
        expect(wrapper.text()).toContain('Editando no tick 8 de 13');
        expect(wrapper.text()).toContain(
            'os ticks 9–13 do histórico são descartados',
        );
        expect(wrapper.text()).toContain('ingresso anterior ao tick');
    });

    it('cancels without submitting and forgets the draft when reopened', async () => {
        const wrapper = mountDialog();
        await wrapper.get('input[type="text"]:not([disabled])').setValue('9');
        await button(wrapper, 'Cancelar').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
        expect(wrapper.emitted('submit')).toBeUndefined();

        await wrapper.setProps({ open: false });
        await wrapper.setProps({ open: true });

        expect(
            (
                wrapper.get('input[type="text"]:not([disabled])')
                    .element as HTMLInputElement
            ).value,
        ).toBe('15');
    });

    it('offers a danger action only when asked', async () => {
        const without = mountDialog();
        expect(without.text()).not.toContain('Remover tarefa');

        const wrapper = mountDialog({ dangerLabel: 'Remover tarefa' });
        await button(wrapper, 'Remover tarefa').trigger('click');
        expect(wrapper.emitted('danger')).toHaveLength(1);
    });
});
