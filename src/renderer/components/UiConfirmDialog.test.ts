// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiConfirmDialog from './UiConfirmDialog.vue';

enableAutoUnmount(afterEach);

function mountConfirm() {
    return mount(UiConfirmDialog, {
        props: {
            open: true,
            title: 'Encerrar Tarefa 2?',
            message: 'Os jobs incompletos são interrompidos.',
            confirmLabel: 'Encerrar',
        },
        attachTo: document.body,
    });
}

describe('UiConfirmDialog', () => {
    it('shows the question and what confirming does', () => {
        const wrapper = mountConfirm();
        expect(wrapper.text()).toContain('Encerrar Tarefa 2?');
        expect(wrapper.text()).toContain(
            'Os jobs incompletos são interrompidos.',
        );
    });

    it('confirms only on the confirm button', async () => {
        const wrapper = mountConfirm();
        await wrapper.get('.ui-button--danger').trigger('click');
        expect(wrapper.emitted('confirm')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toBeUndefined();
    });

    it('cancels with Cancelar, the close button and Esc', async () => {
        const wrapper = mountConfirm();
        const cancel = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Cancelar')!;
        await cancel.trigger('click');
        await wrapper.get('button[aria-label="Fechar"]').trigger('click');
        await wrapper.get('dialog').trigger('cancel');
        expect(wrapper.emitted('cancel')).toHaveLength(3);
        expect(wrapper.emitted('confirm')).toBeUndefined();
    });
});
