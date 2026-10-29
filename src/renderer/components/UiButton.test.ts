// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiButton from './UiButton.vue';

enableAutoUnmount(afterEach);

describe('UiButton', () => {
    it('renders the label and a button of type button', () => {
        const wrapper = mount(UiButton, {
            slots: { default: 'Avancar tick' },
        });
        const button = wrapper.get('button');

        expect(button.attributes('type')).toBe('button');
        expect(button.text()).toBe('Avancar tick');
    });

    it.each(['primary', 'secondary', 'accent', 'danger'] as const)(
        'applies the %s variant class',
        (variant) => {
            const wrapper = mount(UiButton, { props: { variant } });

            expect(wrapper.get('button').classes()).toContain(
                `ui-button--${variant}`,
            );
        },
    );

    it('defaults to the secondary variant', () => {
        const wrapper = mount(UiButton);

        expect(wrapper.get('button').classes()).toContain(
            'ui-button--secondary',
        );
    });

    it('emits click with the event when enabled', async () => {
        const wrapper = mount(UiButton);

        await wrapper.get('button').trigger('click');

        const clicks = wrapper.emitted('click');
        expect(clicks).toHaveLength(1);
        expect(clicks?.[0]?.[0]).toBeInstanceOf(MouseEvent);
    });

    it('does not emit click when disabled', async () => {
        const wrapper = mount(UiButton, { props: { disabled: true } });
        const button = wrapper.get('button');

        await button.trigger('click');

        expect(button.attributes('disabled')).toBeDefined();
        expect(wrapper.emitted('click')).toBeUndefined();
    });

    it('renders the icon slot hidden from assistive technology', () => {
        const wrapper = mount(UiButton, {
            slots: { default: 'Avancar tick', icon: '<svg></svg>' },
        });
        const icon = wrapper.get('.ui-button__icon');

        expect(icon.attributes('aria-hidden')).toBe('true');
        expect(icon.find('svg').exists()).toBe(true);
        expect(wrapper.get('button').element.firstElementChild).toBe(
            icon.element,
        );
    });

    it('omits the icon wrapper without an icon slot', () => {
        const wrapper = mount(UiButton, { slots: { default: 'Pausar' } });

        expect(wrapper.find('.ui-button__icon').exists()).toBe(false);
    });

    it('has no tooltip', () => {
        const wrapper = mount(UiButton, { slots: { default: 'Pausar' } });

        expect(wrapper.get('button').attributes('title')).toBeUndefined();
    });
});
