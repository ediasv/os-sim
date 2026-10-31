// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import EmptyWorkspace from './EmptyWorkspace.vue';
import type { WorkspaceAction } from './workspaceActions';

enableAutoUnmount(afterEach);

const props = { algorithm: 'RM', quantum: 5, cpuCount: 1 };

describe('EmptyWorkspace', () => {
    it('renders title and default-values body without DEC ids', () => {
        const wrapper = mount(EmptyWorkspace, { props });

        expect(wrapper.get('h3').text()).toBe('Nenhuma tarefa configurada');
        expect(wrapper.get('p').text()).toBe(
            'Usando os valores padrão: RM · quantum 5 · 1 CPU. Carregue um arquivo .txt de qualquer pasta ou disco, ou adicione tarefas e ajuste o sistema manualmente.',
        );
        expect(wrapper.text()).not.toMatch(/DEC-/);
    });

    it('pluralizes CPUs', () => {
        const wrapper = mount(EmptyWorkspace, {
            props: { ...props, cpuCount: 2 },
        });

        expect(wrapper.get('p').text()).toContain('2 CPUs');
    });

    it('renders the three disabled actions with Figma variants', async () => {
        const wrapper = mount(EmptyWorkspace, { props });
        const buttons = wrapper.findAll('button');

        expect(buttons.map((b) => b.text())).toEqual([
            'Carregar configuração',
            'Adicionar tarefa',
            'Sistema',
        ]);
        ['accent', 'secondary', 'secondary'].forEach((variant, i) =>
            expect(buttons[i].classes()).toContain(`ui-button--${variant}`),
        );
        for (const button of buttons) {
            expect(button.attributes('disabled')).toBeDefined();
            await button.trigger('click');
        }
        expect(wrapper.emitted('action')).toBeUndefined();
    });

    it('emits the intent of available actions', async () => {
        const wrapper = mount(EmptyWorkspace, {
            props: {
                ...props,
                available: new Set<WorkspaceAction>([
                    'load-config',
                    'add-task',
                    'configure-system',
                ]),
            },
        });

        for (const button of wrapper.findAll('button')) {
            await button.trigger('click');
        }

        expect(wrapper.emitted('action')).toEqual([
            ['load-config'],
            ['add-task'],
            ['configure-system'],
        ]);
    });
});
