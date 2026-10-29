// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiAlert from './UiAlert.vue';
import UiIcon from './UiIcon.vue';

enableAutoUnmount(afterEach);

describe('UiAlert', () => {
    it.each([
        ['danger', 'alert', 'alert'],
        ['warning', 'alert', 'warning'],
        ['success', 'status', 'check'],
        ['info', 'status', 'info'],
    ] as const)(
        'presents the %s tone with role %s and the %s icon',
        (tone, role, icon) => {
            const wrapper = mount(UiAlert, {
                props: { tone, message: 'Mensagem' },
            });
            const root = wrapper.get('.ui-alert');

            expect(root.attributes('role')).toBe(role);
            expect(root.classes()).toContain(`ui-alert--${tone}`);
            expect(
                wrapper
                    .get('.ui-alert__leading')
                    .findComponent(UiIcon)
                    .props('name'),
            ).toBe(icon);
        },
    );

    it('shows the received title and message unchanged', () => {
        const message = '  linha 4: <b>prazo</b> deve ser >= 1\n  ';
        const wrapper = mount(UiAlert, {
            props: { tone: 'danger', title: 'Configuracao invalida', message },
        });

        expect(wrapper.get('.ui-alert__title').text()).toBe(
            'Configuracao invalida',
        );
        expect(wrapper.get('.ui-alert__message').element.textContent).toBe(
            message,
        );
        expect(wrapper.find('b').exists()).toBe(false);
    });

    it('omits the title when none is given', () => {
        const wrapper = mount(UiAlert, {
            props: { tone: 'info', message: 'Mensagem' },
        });

        expect(wrapper.find('.ui-alert__title').exists()).toBe(false);
    });

    it.each([
        ['danger', 'Fechar mensagem de erro'],
        ['info', 'Fechar mensagem'],
    ] as const)(
        'emits dismiss from the %s close button',
        async (tone, label) => {
            const wrapper = mount(UiAlert, {
                props: { tone, message: 'Mensagem' },
            });
            const button = wrapper.get('button.ui-alert__dismiss');

            expect(button.attributes('type')).toBe('button');
            expect(button.attributes('aria-label')).toBe(label);
            expect(button.attributes('title')).toBeUndefined();

            await button.trigger('click');

            expect(wrapper.emitted('dismiss')).toHaveLength(1);
        },
    );

    it('does not move focus when mounted', () => {
        mount(UiAlert, {
            props: { tone: 'danger', message: 'Mensagem' },
            attachTo: document.body,
        });

        expect(document.activeElement).toBe(document.body);
    });
});
