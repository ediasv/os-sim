// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import TaskPanel from './TaskPanel.vue';
import type { WorkspaceAction } from './workspaceActions';

enableAutoUnmount(afterEach);

describe('TaskPanel', () => {
    it('renders title and side-panel copy', () => {
        const wrapper = mount(TaskPanel);

        expect(wrapper.get('h2').text()).toBe('Tarefas');
        expect(wrapper.text()).toContain(
            'Nenhuma tarefa. Carregue um arquivo de configuração ou adicione tarefas manualmente.',
        );
    });

    it('shows the task count instead of the empty copy when tasks exist', () => {
        const one = mount(TaskPanel, { props: { taskCount: 1 } });
        const many = mount(TaskPanel, { props: { taskCount: 3 } });

        expect(one.text()).toContain('1 tarefa configurada.');
        expect(many.text()).toContain('3 tarefas configuradas.');
        expect(one.text()).not.toContain('Nenhuma tarefa');
    });

    it('keeps "Adicionar tarefa" disabled by default', async () => {
        const wrapper = mount(TaskPanel);
        const button = wrapper.get('button');

        expect(button.text()).toBe('Adicionar tarefa');
        expect(button.classes()).toContain('ui-button--secondary');
        expect(button.attributes('disabled')).toBeDefined();
        await button.trigger('click');
        expect(wrapper.emitted('action')).toBeUndefined();
    });

    it('emits add-task when available', async () => {
        const wrapper = mount(TaskPanel, {
            props: { available: new Set<WorkspaceAction>(['add-task']) },
        });

        await wrapper.get('button').trigger('click');

        expect(wrapper.emitted('action')).toEqual([['add-task']]);
    });
});
