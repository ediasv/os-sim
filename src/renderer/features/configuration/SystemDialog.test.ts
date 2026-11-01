// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigIssue } from '../../../core/config';
import SystemDialog from './SystemDialog.vue';

enableAutoUnmount(afterEach);

const initial = { algorithm: 'EDF', quantum: 3, cpuCount: 2 };

function field(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper.findAll('label').find((l) => l.text() === label)!.element
        .control as HTMLInputElement | HTMLSelectElement;
}

describe('SystemDialog', () => {
    it('opens with the current values and the defaults explained', () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Configuração do sistema',
        );
        expect(wrapper.text()).toContain('RM · quantum 5 · 1 CPU');
        expect(field(wrapper, 'Algoritmo de escalonamento').value).toBe('EDF');
        expect(field(wrapper, 'Quantum').value).toBe('3');
        expect(field(wrapper, 'Processadores').value).toBe('2');
    });

    it('offers only the two policies of the assignment', () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        expect(
            wrapper.findAll('option').map((o) => o.attributes('value')),
        ).toEqual(['RM', 'EDF']);
    });

    it('applies the typed values as numbers', async () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        await wrapper.get('select').setValue('RM');
        await wrapper.findAll('input')[0].setValue('8');
        await wrapper.findAll('input')[1].setValue('4');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Aplicar')!
            .trigger('click');

        expect(wrapper.emitted('apply')).toEqual([
            [{ algorithm: 'RM', quantum: 8, cpuCount: 4 }],
        ]);
    });

    it('sends a blank field as NaN so the core, not the form, refuses it', async () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        await wrapper.findAll('input')[0].setValue('  ');
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Aplicar')!
            .trigger('click');

        const [[values]] = wrapper.emitted('apply') as [[{ quantum: number }]];
        expect(values.quantum).toBeNaN();
    });

    it('shows the core reasons next to their field and keeps the typed values', async () => {
        const issues: ConfigIssue[] = [
            { field: 'quantum', message: 'O campo quantum deve ser ≥ 1.' },
        ];
        const wrapper = mount(SystemDialog, { props: { initial, issues } });

        expect(wrapper.text()).toContain('O campo quantum deve ser ≥ 1.');
        expect(field(wrapper, 'Quantum').getAttribute('aria-invalid')).toBe(
            'true',
        );
        expect(
            field(wrapper, 'Processadores').getAttribute('aria-invalid'),
        ).toBeNull();
        expect(field(wrapper, 'Quantum').value).toBe('3');
    });

    it('restores the defaults in the form without applying them', async () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Restaurar padrões')!
            .trigger('click');

        expect(field(wrapper, 'Algoritmo de escalonamento').value).toBe('RM');
        expect(field(wrapper, 'Quantum').value).toBe('5');
        expect(field(wrapper, 'Processadores').value).toBe('1');
        expect(wrapper.emitted('apply')).toBeUndefined();
    });

    it('cancels with the button, the close button and Escape', async () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Cancelar')!
            .trigger('click');
        await wrapper.get('button[aria-label="Fechar"]').trigger('click');
        await wrapper
            .get('[role="dialog"]')
            .trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('cancel')).toHaveLength(3);
        expect(wrapper.emitted('apply')).toBeUndefined();
    });

    it('applies with Enter in a field', async () => {
        const wrapper = mount(SystemDialog, { props: { initial } });

        await wrapper.get('form').trigger('submit');

        expect(wrapper.emitted('apply')).toHaveLength(1);
    });
});
