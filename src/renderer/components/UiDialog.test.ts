// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiDialog from './UiDialog.vue';

enableAutoUnmount(afterEach);

function mountDialog(open: boolean) {
    return mount(UiDialog, {
        props: { open, title: 'Editar Tarefa 2' },
        slots: { default: '<p>Corpo</p>', actions: '<button>Aplicar</button>' },
        attachTo: document.body,
    });
}

describe('UiDialog', () => {
    it('is hidden until opened and named by its title', async () => {
        const wrapper = mountDialog(false);
        const dialog = wrapper.get('dialog').element as HTMLDialogElement;
        expect(dialog.open).toBe(false);

        await wrapper.setProps({ open: true });

        expect(dialog.open).toBe(true);
        const titleId = dialog.getAttribute('aria-labelledby')!;
        expect(document.getElementById(titleId)?.textContent?.trim()).toBe(
            'Editar Tarefa 2',
        );
    });

    it('closes when the owner turns open off', async () => {
        const wrapper = mountDialog(true);
        const dialog = wrapper.get('dialog').element as HTMLDialogElement;
        expect(dialog.open).toBe(true);

        await wrapper.setProps({ open: false });

        expect(dialog.open).toBe(false);
    });

    it('renders the body and the actions slots', () => {
        const wrapper = mountDialog(true);
        expect(wrapper.text()).toContain('Corpo');
        expect(wrapper.text()).toContain('Aplicar');
    });

    it('asks the owner to close on Esc instead of closing itself', async () => {
        const wrapper = mountDialog(true);
        const dialog = wrapper.get('dialog');

        await dialog.trigger('cancel');

        expect(wrapper.emitted('close')).toHaveLength(1);
        expect((dialog.element as HTMLDialogElement).open).toBe(true);
    });

    it('gives the focus back to what opened it, also when the owner removes it', () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();

        const wrapper = mountDialog(true);
        (document.activeElement as HTMLElement).blur();
        wrapper.unmount();

        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it('asks the owner to close with the close button', async () => {
        const wrapper = mountDialog(true);
        await wrapper.get('button[aria-label="Fechar"]').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
