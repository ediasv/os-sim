// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
import UiIcon from './UiIcon.vue';
import UiIconButton from './UiIconButton.vue';

enableAutoUnmount(afterEach);

const slots = { default: () => h(UiIcon, { name: 'close' }) };

describe('UiIconButton', () => {
    it('exposes the label as accessible name without a tooltip', () => {
        const wrapper = mount(UiIconButton, {
            props: { label: 'Aumentar zoom' },
            slots,
        });
        const button = wrapper.get('button');

        expect(button.attributes('type')).toBe('button');
        expect(button.attributes('aria-label')).toBe('Aumentar zoom');
        expect(button.attributes('title')).toBeUndefined();
        expect(button.text()).toBe('');
    });

    it('hides the slotted icon from assistive technology', () => {
        const wrapper = mount(UiIconButton, {
            props: { label: 'Fechar' },
            slots,
        });
        const icon = wrapper.get('.ui-icon');

        expect(icon.element.parentElement?.getAttribute('aria-hidden')).toBe(
            'true',
        );
    });

    it('emits click when enabled', async () => {
        const wrapper = mount(UiIconButton, { props: { label: 'Fechar' } });

        await wrapper.get('button').trigger('click');

        expect(wrapper.emitted('click')).toHaveLength(1);
    });

    it('does not emit click when disabled', async () => {
        const wrapper = mount(UiIconButton, {
            props: { label: 'Fechar', disabled: true },
        });
        const button = wrapper.get('button');

        await button.trigger('click');

        expect(button.attributes('disabled')).toBeDefined();
        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('is focusable by keyboard unless disabled', async () => {
        const enabled = mount(UiIconButton, {
            props: { label: 'Fechar' },
            attachTo: document.body,
        });
        const element = enabled.get('button').element;
        element.focus();
        expect(document.activeElement).toBe(element);

        const disabled = mount(UiIconButton, {
            props: { label: 'Fechar', disabled: true },
            attachTo: document.body,
        });
        const disabledElement = disabled.get('button').element;
        disabledElement.focus();
        expect(document.activeElement).not.toBe(disabledElement);
    });
});
