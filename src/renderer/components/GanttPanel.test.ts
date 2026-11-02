// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import GanttPanel from './GanttPanel.vue';
import type { WorkspaceAction } from './workspaceActions';

enableAutoUnmount(afterEach);

describe('GanttPanel', () => {
    it('renders the title and the static zoom readout', () => {
        const wrapper = mount(GanttPanel);

        expect(wrapper.get('h2').text()).toBe('Diagrama de Gantt');
        expect(wrapper.text()).toContain('100%');
    });

    it('disables zoom and export by default without emitting', async () => {
        const wrapper = mount(GanttPanel);
        const buttons = wrapper.findAll('button');

        expect(
            buttons.map((b) => b.attributes('aria-label') ?? b.text()),
        ).toEqual(['Diminuir zoom', 'Aumentar zoom', 'Exportar SVG']);
        for (const button of buttons) {
            expect(button.attributes('disabled')).toBeDefined();
            await button.trigger('click');
        }
        expect(wrapper.emitted('action')).toBeUndefined();
    });

    it('emits the intent of each available control', async () => {
        const wrapper = mount(GanttPanel, {
            props: {
                available: new Set<WorkspaceAction>([
                    'zoom-out',
                    'zoom-in',
                    'export-svg',
                ]),
            },
        });

        for (const button of wrapper.findAll('button')) {
            await button.trigger('click');
        }

        expect(wrapper.emitted('action')).toEqual([
            ['zoom-out'],
            ['zoom-in'],
            ['export-svg'],
        ]);
    });

    it('renders the default slot in the body', () => {
        const wrapper = mount(GanttPanel, {
            slots: { default: '<p class="chart">grafico</p>' },
        });

        expect(wrapper.get('.chart').text()).toBe('grafico');
    });
});
