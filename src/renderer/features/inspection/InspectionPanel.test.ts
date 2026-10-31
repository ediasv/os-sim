// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import InspectionPanel from './InspectionPanel.vue';
import { projectFutureJob, type InspectionData } from './inspection';

enableAutoUnmount(afterEach);

const data: InspectionData = {
    inspectedTick: 8,
    tasks: [
        {
            definition: {
                id: 1,
                color: 'F0E0D0',
                arrival: 0,
                duration: 3,
                period: 5,
                deadline: 4,
                rawEvents: '',
            },
            status: 'active',
            jobs: [
                {
                    availability: 'current',
                    ref: { taskId: 1, index: 0 },
                    activation: 0,
                    absoluteDeadline: 4,
                    executed: 2,
                    state: 'running',
                    completedAt: null,
                    deadlineMissed: false,
                    eligible: true,
                },
            ],
        },
        {
            definition: {
                id: 2,
                color: 'D0E0F0',
                arrival: 0,
                duration: 2,
                period: 0,
                deadline: 2,
                rawEvents: '',
            },
            status: 'completed',
            jobs: [
                {
                    availability: 'current',
                    ref: { taskId: 2, index: 0 },
                    activation: 0,
                    absoluteDeadline: 2,
                    executed: 2,
                    state: 'completed',
                    completedAt: 2,
                    deadlineMissed: false,
                    eligible: false,
                },
            ],
        },
    ],
    futureJobs: [
        projectFutureJob({
            taskId: 1,
            index: 1,
            activation: 10,
            absoluteDeadline: 14,
        }),
    ],
    cpuOff: [],
};

describe('InspectionPanel', () => {
    it('keeps task, details and jobs selection consistent', async () => {
        const wrapper = mount(InspectionPanel, { props: { data } });

        expect(wrapper.get('.inspection-panel__tick').text()).toContain('8');
        expect(wrapper.get('dd').text()).toBe('1');
        expect(wrapper.findAll('tbody tr')).toHaveLength(2);

        await wrapper.findAll('.task-list__item')[1]?.trigger('click');

        expect(wrapper.get('dd').text()).toBe('2');
        expect(wrapper.findAll('tbody tr')).toHaveLength(1);
        expect(wrapper.get('tbody tr').text()).toContain('Concluído');
        expect(wrapper.get('.inspection-panel__tick').text()).toContain('8');
    });

    it('selects a future job with the keyboard without changing the tick', async () => {
        const wrapper = mount(InspectionPanel, { props: { data } });
        const futureRow = wrapper.findAll('tbody tr')[1];

        await futureRow?.trigger('keydown', { key: 'Enter' });

        const selectedRow = wrapper.findAll('tbody tr')[1];
        expect(selectedRow?.classes()).toContain('job-table__row--selected');
        expect(selectedRow?.text()).toContain('Ainda não ativado no tick 8.');
        expect(selectedRow?.text()).toContain(
            'Ativação registrada no tick 10.',
        );
        expect(wrapper.get('.inspection-panel__tick').text()).toContain('8');
        expect(selectedRow?.text()).toContain('Não disponível');
    });
});
