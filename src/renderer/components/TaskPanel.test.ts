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

    describe('with the tasks being prepared', () => {
        const tasks = [
            { id: 1, color: 'F0E0D0', period: 10, duration: 3, deadline: 10 },
            { id: 2, color: 'A0B0C0', period: 15, duration: 4, deadline: 12 },
        ];
        const available = new Set<WorkspaceAction>(['add-task', 'edit-task']);

        it('lists a card per task with its numbers and marks the selected one', () => {
            const wrapper = mount(TaskPanel, {
                props: { tasks, selectedTaskId: 2, taskCount: 2, available },
            });

            const cards = wrapper.findAll('.task-panel__card');
            expect(cards.map((c) => c.text())).toEqual([
                'Tarefa 1período 10 · duração 3 · prazo 10',
                'Tarefa 2período 15 · duração 4 · prazo 12',
            ]);
            expect(cards.map((c) => c.attributes('aria-pressed'))).toEqual([
                'false',
                'true',
            ]);
        });

        it('reports the chosen task without changing anything else', async () => {
            const wrapper = mount(TaskPanel, {
                props: { tasks, selectedTaskId: 1, taskCount: 2, available },
            });

            await wrapper.findAll('.task-panel__card')[1].trigger('click');

            expect(wrapper.emitted('select')).toEqual([[2]]);
            expect(wrapper.emitted('action')).toBeUndefined();
        });

        it('offers editing the selected task, enabled only when available', async () => {
            const wrapper = mount(TaskPanel, {
                props: { tasks, selectedTaskId: 1, taskCount: 2, available },
            });
            const edit = wrapper
                .findAll('button')
                .find((b) => b.text() === 'Editar tarefa selecionada')!;

            await edit.trigger('click');
            expect(wrapper.emitted('action')).toEqual([['edit-task']]);

            await wrapper.setProps({ available: new Set() });
            expect(edit.attributes('disabled')).toBeDefined();
        });

        it('has no edit button when there is nothing to edit', () => {
            const wrapper = mount(TaskPanel, {
                props: { tasks: [], taskCount: 0 },
            });

            expect(wrapper.text()).not.toContain('Editar tarefa selecionada');
        });
    });
});
