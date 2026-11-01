// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiField from './UiField.vue';

enableAutoUnmount(afterEach);

describe('UiField', () => {
    it('labels the input and reports what the user types', async () => {
        const wrapper = mount(UiField, {
            props: { label: 'Quantum', modelValue: '5', unit: 'ticks' },
        });

        const input = wrapper.get('input');
        expect(wrapper.get('label').attributes('for')).toBe(
            input.attributes('id'),
        );
        expect(input.element.value).toBe('5');
        expect(wrapper.text()).toContain('ticks');

        await input.setValue('7');
        expect(wrapper.emitted('update:modelValue')).toEqual([['7']]);
    });

    it('ties the hint and the reason to the input, marking it invalid', () => {
        const wrapper = mount(UiField, {
            props: {
                label: 'Prazo',
                modelValue: '0',
                hint: 'Inteiro ≥ 1.',
                error: 'Deve ser maior que zero.',
            },
        });

        const input = wrapper.get('input');
        expect(input.attributes('aria-invalid')).toBe('true');
        const described = input.attributes('aria-describedby') ?? '';
        expect(described.split(' ')).toHaveLength(2);
        for (const id of described.split(' ')) {
            expect(wrapper.find(`#${id}`).exists()).toBe(true);
        }
        expect(wrapper.text()).toContain('Deve ser maior que zero.');
    });

    it('can be read only', () => {
        const wrapper = mount(UiField, {
            props: { label: 'ID', modelValue: '2', disabled: true },
        });

        expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    });
});
