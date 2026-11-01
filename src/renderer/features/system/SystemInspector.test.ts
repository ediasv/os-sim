// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SystemInspector from './SystemInspector.vue';
import type { SystemData } from './system';

enableAutoUnmount(afterEach);

function job(
    taskId: number,
    index: number,
    overrides: Partial<SystemData['ready'][number]> = {},
): SystemData['ready'][number] {
    return {
        ref: { taskId, index },
        activation: 0,
        absoluteDeadline: 4,
        executed: 0,
        duration: 3,
        color: 'F0E0D0',
        state: 'ready',
        deadlineMissed: false,
        ...overrides,
    };
}

function data(overrides: Partial<SystemData> = {}): SystemData {
    return {
        inspectedTick: 8,
        parameters: { algorithm: 'RM', quantum: 5, cpuCount: 3 },
        cpus: [
            {
                id: 1,
                condition: 'running',
                since: 6,
                job: job(1, 1, { state: 'running', executed: 2 }),
                sliceElapsed: 1,
                quantum: 5,
                offIntervals: [{ start: 2, end: 4 }],
                totalOff: 2,
            },
            {
                id: 2,
                condition: 'off',
                since: 6,
                job: null,
                sliceElapsed: 0,
                quantum: 5,
                offIntervals: [{ start: 6, end: null }],
                totalOff: 2,
            },
            {
                id: 3,
                condition: 'off',
                since: 8,
                job: null,
                sliceElapsed: 0,
                quantum: 5,
                offIntervals: [{ start: 8, end: null }],
                totalOff: 0,
            },
        ],
        ready: [job(2, 0)],
        pending: [job(3, 1, { state: 'ready', deadlineMissed: true })],
        ...overrides,
    };
}

describe('SystemInspector', () => {
    it('shows the snapshot tick as the panel header', () => {
        const wrapper = mount(SystemInspector, { props: { data: data() } });

        expect(wrapper.text()).toContain('Estado do sistema');
        expect(wrapper.text()).toContain('snapshot t = 8');
        expect(wrapper.text()).not.toContain('Tick inspecionado');
    });

    it('renders one row per CPU with only the occupied and off conditions', () => {
        const rows = mount(SystemInspector, {
            props: { data: data() },
        }).findAll('[data-testid="cpu-row"]');

        expect(rows).toHaveLength(3);
        expect(rows[0]?.text()).toContain('CPU 1');
        expect(rows[0]?.text()).toContain('Ocupada');
        expect(rows[0]?.text()).toContain('Tarefa 1 · job 2');
        expect(rows[1]?.text()).toContain('Desligada');
        expect(rows[2]?.text()).toContain('Desligada');
        expect(rows[2]?.text()).not.toContain('Ociosa');
    });

    it('shows the tick since which each CPU has its condition', () => {
        const rows = mount(SystemInspector, {
            props: { data: data() },
        }).findAll('[data-testid="cpu-row"]');

        expect(rows[0]?.text()).toContain('desde t = 6');
        expect(rows[1]?.text()).toContain('desde t = 6');
        expect(rows[2]?.text()).toContain('desde t = 8');
    });

    it('labels the slice consumption and the job progress as different measures', () => {
        const row = mount(SystemInspector, {
            props: { data: data() },
        }).find('[data-testid="cpu-row"]');

        expect(row.text()).toContain('Fatia: 1 de 5 ticks');
        expect(row.text()).toContain('Progresso: 2 de 3 ticks');
    });

    it('keeps the slice consumption out of the off CPU rows', () => {
        const rows = mount(SystemInspector, {
            props: { data: data() },
        }).findAll('[data-testid="cpu-row"]');

        expect(rows[1]?.text()).not.toContain('Fatia');
    });

    it('shows each CPU off interval and its total, with an open interval marked', () => {
        const rows = mount(SystemInspector, {
            props: { data: data() },
        }).findAll('[data-testid="cpu-row"]');

        expect(rows[0]?.text()).toContain('2 a 4');
        expect(rows[0]?.text()).toContain('Total desligado: 2');
        expect(rows[1]?.text()).toContain('6 em aberto');
        expect(rows[2]?.text()).toContain('Total desligado: 0');
    });

    it('shows the ready queue and pending jobs in two separate lists with their state and deadline loss', () => {
        const wrapper = mount(SystemInspector, { props: { data: data() } });
        const ready = wrapper.find('[data-testid="ready-list"]');
        const pending = wrapper.find('[data-testid="pending-list"]');

        expect(ready.text()).toContain('Tarefa 2 · job 1');
        expect(pending.text()).toContain('Tarefa 3 · job 2');
        expect(pending.text()).toContain('Prazo perdido: Sim');
    });

    it('uses the prototype headings and empty messages for both lists', () => {
        const wrapper = mount(SystemInspector, {
            props: { data: data({ ready: [], pending: [] }) },
        });

        expect(wrapper.text()).toContain('FILA GLOBAL DE PRONTOS');
        expect(wrapper.text()).toContain('PENDENTES (DEC-02)');
        expect(wrapper.find('[data-testid="ready-list"]').text()).toContain(
            'Vazia — nenhum job elegível esperando CPU.',
        );
        expect(wrapper.find('[data-testid="pending-list"]').text()).toContain(
            'Nenhum — cada tarefa tem no máximo um job incompleto.',
        );
    });

    it('does not announce the order of the ready queue as a priority', () => {
        const wrapper = mount(SystemInspector, { props: { data: data() } });

        expect(wrapper.text()).not.toMatch(/prioridade|ranking/i);
    });

    it('renders every CPU and job without a cap, inside scrollable lists', () => {
        const many = Array.from({ length: 40 }, (_, index) =>
            job(100 + index, 0),
        );
        const cpus = Array.from({ length: 24 }, (_, index) => ({
            ...data().cpus[1]!,
            id: index + 1,
        }));
        const wrapper = mount(SystemInspector, {
            props: { data: data({ cpus, ready: many, pending: many }) },
        });

        expect(wrapper.findAll('[data-testid="cpu-row"]')).toHaveLength(24);
        expect(
            wrapper.find('[data-testid="ready-list"]').findAll('li'),
        ).toHaveLength(40);
        expect(
            wrapper.find('[data-testid="pending-list"]').findAll('li'),
        ).toHaveLength(40);
        for (const id of ['cpu-list', 'ready-list', 'pending-list']) {
            expect(wrapper.find(`[data-testid="${id}"]`).classes()).toContain(
                'system-inspector__scroll',
            );
        }
    });
});
