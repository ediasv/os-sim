// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiField from './UiField.vue';

enableAutoUnmount(afterEach);

const slot =
    '<template #default="{ id, describedBy, invalid }"><input :id="id" :aria-describedby="describedBy" :aria-invalid="invalid" /></template>';

function mountField(props: Record<string, unknown>) {
    return mount(UiField, {
        props: { label: 'Período', ...props },
        slots: { default: slot },
        attachTo: document.body,
    });
}

describe('UiField', () => {
    it('ties the label to the control', () => {
        const wrapper = mountField({});
        const input = wrapper.get('input');
        expect(wrapper.get('label').attributes('for')).toBe(
            input.attributes('id'),
        );
    });

    it('shows the hint and links it to the control', () => {
        const wrapper = mountField({ hint: 'Ticks entre ativações.' });
        const described = wrapper.get('input').attributes('aria-describedby')!;
        expect(
            document.getElementById(described.split(' ')[0])?.textContent,
        ).toBe('Ticks entre ativações.');
    });

    it('announces an error and marks the control invalid', () => {
        const wrapper = mountField({
            hint: 'Dica',
            error: 'O período deve ser pelo menos 1.',
        });
        const error = wrapper.get('[role="alert"]');
        expect(error.text()).toBe('O período deve ser pelo menos 1.');
        expect(wrapper.get('input').attributes('aria-invalid')).toBe('true');
        expect(wrapper.get('input').attributes('aria-describedby')).toContain(
            error.attributes('id'),
        );
    });

    it('shows why a field is blocked, as text and as title', () => {
        const wrapper = mountField({
            disabledReason: 'O ingresso não pode ser alterado.',
        });
        expect(wrapper.text()).toContain('O ingresso não pode ser alterado.');
        expect(wrapper.attributes('title')).toBe(
            'O ingresso não pode ser alterado.',
        );
    });
});
