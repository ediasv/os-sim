// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import { DEFAULT_POLICIES } from '../../../core/policies';
import InspectionPanel from './InspectionPanel.vue';
import {
    projectFutureJob,
    projectInspection,
    type InspectionData,
} from './inspection';

enableAutoUnmount(afterEach);

const data: InspectionData = {
    inspectedTick: 8,
    tasks: [
        {
            definition: {
                id: '1',
                color: 'F0E0D0',
                arrival: 0,
                duration: 3,
                period: 5,
                deadline: 4,
                rawEvents: '',
            },
            status: 'active',
            choice: 'ready',
            nextActivation: 10,
            jobs: [
                {
                    availability: 'current',
                    ref: { taskId: '1', index: 0 },
                    activation: 0,
                    absoluteDeadline: 4,
                    duration: 3,
                    executed: 2,
                    state: 'running',
                    completedAt: null,
                    deadlineMissed: false,
                    eligible: true,
                    suspended: false,
                },
            ],
        },
        {
            definition: {
                id: '2',
                color: 'D0E0F0',
                arrival: 0,
                duration: 2,
                period: 0,
                deadline: 2,
                rawEvents: '',
            },
            status: 'completed',
            choice: 'ready',
            nextActivation: null,
            jobs: [
                {
                    availability: 'current',
                    ref: { taskId: '2', index: 0 },
                    activation: 0,
                    absoluteDeadline: 2,
                    duration: 2,
                    executed: 2,
                    state: 'completed',
                    completedAt: 2,
                    deadlineMissed: false,
                    eligible: false,
                    suspended: false,
                },
            ],
        },
    ],
    futureJobs: [
        projectFutureJob({
            taskId: '1',
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
        expect(wrapper.findAll('.task-list__status')[0]?.text()).toBe('Ativa');
        expect(wrapper.findAll('.task-list__status')[1]?.text()).toBe(
            'Terminada',
        );

        await wrapper.findAll('.task-list__item')[1]?.trigger('click');

        expect(wrapper.get('dd').text()).toBe('2');
        expect(wrapper.findAll('tbody tr')).toHaveLength(1);
        expect(wrapper.get('tbody tr').text()).toContain('Concluído');
        expect(wrapper.get('.inspection-panel__tick').text()).toContain('8');
    });

    it('reconciles the selected task when the inspection data changes', async () => {
        const wrapper = mount(InspectionPanel, { props: { data } });
        const replacementData: InspectionData = {
            ...data,
            inspectedTick: 12,
            tasks: [data.tasks[1]!],
            futureJobs: [],
        };

        await wrapper.setProps({ data: replacementData });

        expect(wrapper.get('dd').text()).toBe('2');
        expect(wrapper.findAll('tbody tr')).toHaveLength(1);
        expect(wrapper.get('.inspection-panel__tick').text()).toContain('12');
    });

    it('preserves a valid future-job selection across tick updates', async () => {
        const wrapper = mount(InspectionPanel, { props: { data } });
        await wrapper.findAll('tbody tr')[1]?.trigger('keydown', {
            key: 'Enter',
        });

        await wrapper.setProps({
            data: { ...data, inspectedTick: 9 },
        });

        expect(wrapper.findAll('tbody tr')[1]?.classes()).toContain(
            'job-table__row--selected',
        );
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

describe('InspectionPanel with edited tasks (#37, FE-09, DEC-37)', () => {
    const task = (
        id: string,
        color: string,
        duration: number,
        period: number,
    ) => ({
        id,
        color,
        arrival: 0,
        duration,
        period,
        deadline: id === '3' ? 2 : id === '1' ? 3 : 10,
        rawEvents: '',
    });

    function mountEdited(
        edit: Parameters<ReturnType<typeof createSimulator>['edit']>[0],
        ticks: number,
    ) {
        const sim = createSimulator(
            {
                algorithm: 'RM',
                quantum: 5,
                cpuCount: 2,
                tasks: [
                    task('1', 'F0E0D0', 6, 3),
                    task('2', 'D0E0F0', 2, 10),
                    task('3', 'E0F0D0', 2, 10),
                ],
            },
            DEFAULT_POLICIES,
        );
        sim.edit(edit);
        for (let i = 0; i < ticks; i++) sim.tick();
        return mount(InspectionPanel, {
            props: { data: projectInspection(sim.getCurrentSnapshot()) },
        });
    }

    async function select(wrapper: ReturnType<typeof mountEdited>, n: number) {
        await wrapper.findAll('.task-list__item')[n]?.trigger('click');
    }

    const states = [
        { kind: 'taskState', taskId: '2', state: 'forced' },
        { kind: 'taskState', taskId: '3', state: 'suspended' },
    ] as const;

    it('shows a ready task running by priority, with job duration and next activation', () => {
        const wrapper = mountEdited(states, 4);
        const details = wrapper.get('.task-details').text();
        expect(details).toContain('Pronta, executando por prioridade');
        expect(details).toContain('Próxima ativação');
        expect(details).toContain('6');
        expect(wrapper.get('thead').text()).toContain('Duração');
    });

    it('shows the job behind a late one as activated and not eligible', () => {
        const wrapper = mountEdited(states, 4);
        const rows = wrapper.findAll('tbody tr');
        expect(rows[0]?.text()).toContain('Sim');
        expect(rows[1]?.text()).toContain('Ativado, não elegível');
    });

    it('tells a forced task from a ready one', async () => {
        const wrapper = mountEdited(states, 4);
        await select(wrapper, 1);
        expect(wrapper.get('.task-details').text()).toContain('Forçada');
        expect(wrapper.get('.task-details').text()).not.toContain('prioridade');
    });

    it('shows a suspended job and its missed deadline together', async () => {
        const wrapper = mountEdited(states, 4);
        await select(wrapper, 2);
        expect(wrapper.get('.task-details').text()).toContain('Suspensa');
        const row = wrapper.get('tbody tr').text();
        expect(row).toContain('Suspensa');
        expect(row).toContain('Sim');
    });

    it('shows the jobs of a finished task as interrupted, never completed', () => {
        const wrapper = mountEdited(
            [{ kind: 'taskState', taskId: '1', state: 'concluded' }],
            2,
        );
        const text = wrapper
            .findAll('tbody tr')
            .map((row) => row.text())
            .join(' ');
        expect(text).toContain('Interrompido');
        expect(text).not.toContain('Concluído');
    });
});
