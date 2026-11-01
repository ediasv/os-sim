// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ConfirmDialog from './ConfirmDialog.vue';

enableAutoUnmount(afterEach);

const props = {
    title: 'Remover Tarefa 2?',
    message: 'A tarefa sai da configuração.',
    confirmLabel: 'Remover',
};

describe('ConfirmDialog', () => {
    it('shows the question and both answers', () => {
        const wrapper = mount(ConfirmDialog, { props });

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Remover Tarefa 2?',
        );
        expect(wrapper.text()).toContain('A tarefa sai da configuração.');
        expect(wrapper.findAll('footer button').map((b) => b.text())).toEqual([
            'Cancelar',
            'Remover',
        ]);
    });

    it('confirms and cancels through their own buttons', async () => {
        const wrapper = mount(ConfirmDialog, { props });
        const [cancel, confirm] = wrapper.findAll('footer button');

        await confirm.trigger('click');
        await cancel.trigger('click');

        expect(wrapper.emitted('confirm')).toHaveLength(1);
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('treats Escape and the close button as cancel', async () => {
        const wrapper = mount(ConfirmDialog, { props });

        await wrapper
            .get('[role="dialog"]')
            .trigger('keydown', { key: 'Escape' });
        await wrapper.get('button[aria-label="Fechar"]').trigger('click');

        expect(wrapper.emitted('cancel')).toHaveLength(2);
        expect(wrapper.emitted('confirm')).toBeUndefined();
    });

    it('marks a destructive confirmation', () => {
        const wrapper = mount(ConfirmDialog, {
            props: { ...props, destructive: true },
        });

        expect(wrapper.findAll('footer button')[1].classes()).toContain(
            'ui-button--danger',
        );
    });
});
