// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PreparedWorkspace from './PreparedWorkspace.vue';

enableAutoUnmount(afterEach);

describe('PreparedWorkspace', () => {
    it('summarizes the prepared configuration and how to start', () => {
        const wrapper = mount(PreparedWorkspace, {
            props: { algorithm: 'EDF', quantum: 4, cpuCount: 2, taskCount: 3 },
        });

        expect(wrapper.text()).toContain(
            '3 tarefas · EDF · quantum 4 · 2 CPUs',
        );
        expect(wrapper.text()).toContain('Avançar tick');
    });

    it('uses the singular for one task and one CPU', () => {
        const wrapper = mount(PreparedWorkspace, {
            props: { algorithm: 'RM', quantum: 5, cpuCount: 1, taskCount: 1 },
        });

        expect(wrapper.text()).toContain('1 tarefa · RM · quantum 5 · 1 CPU.');
    });
});
