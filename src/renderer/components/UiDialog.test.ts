// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiDialog from './UiDialog.vue';

enableAutoUnmount(afterEach);

describe('UiDialog', () => {
    it('is a modal dialog named by its title', () => {
        const wrapper = mount(UiDialog, {
            props: { title: 'Configuração do sistema' },
            slots: { default: '<p>corpo</p>', footer: '<button>Ok</button>' },
        });

        const dialog = wrapper.get('[role="dialog"]');
        expect(dialog.attributes('aria-modal')).toBe('true');
        const labelId = dialog.attributes('aria-labelledby');
        expect(wrapper.get(`#${labelId}`).text()).toBe(
            'Configuração do sistema',
        );
        expect(wrapper.text()).toContain('corpo');
        expect(wrapper.get('footer').text()).toBe('Ok');
    });

    it('asks to close with the close button and with Escape', async () => {
        const wrapper = mount(UiDialog, { props: { title: 'T' } });

        await wrapper.get('button[aria-label="Fechar"]').trigger('click');
        await wrapper
            .get('[role="dialog"]')
            .trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('close')).toHaveLength(2);
    });

    it('does not close by a click outside, so typed values are not lost', async () => {
        const wrapper = mount(UiDialog, { props: { title: 'T' } });

        await wrapper.get('.ui-dialog__backdrop').trigger('click');

        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('moves focus inside on open and gives it back on close', async () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();

        const wrapper = mount(UiDialog, {
            props: { title: 'T' },
            slots: { default: '<input id="first" />' },
            attachTo: document.body,
        });
        await flushPromises();
        expect(document.activeElement?.id).toBe('first');

        wrapper.unmount();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });
});
