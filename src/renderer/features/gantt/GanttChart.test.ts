// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import type { SimulationSnapshot, SystemConfig } from '../../../core/domain';
import GanttChart from './GanttChart.vue';
import { buildGanttModel } from './ganttModel';
import { TICK } from './geometry';

enableAutoUnmount(afterEach);

function task(id: string, color: string, duration: number, period: number) {
    return {
        id,
        color,
        arrival: 0,
        duration,
        period,
        deadline: period,
        rawEvents: '',
    };
}

const SMALL: SystemConfig = {
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 1,
    tasks: [task('1', 'FF0000', 3, 5), task('2', '0000FF', 4, 8)],
};

function run(config: SystemConfig, ticks: number): SimulationSnapshot {
    const sim = createSimulator(config);
    for (let i = 0; i < ticks; i++) sim.tick();
    return sim.getLatestSnapshot();
}

/** T1 suspended on [2, 4) and forced from 4; CPU 2 gone on [4, 5); T2 ends at 5. */
function editedRun(): SimulationSnapshot {
    const sim = createSimulator({
        ...SMALL,
        cpuCount: 2,
        tasks: [task('1', 'FF0000', 6, 20), task('2', '0000FF', 6, 20)],
    });
    sim.tick();
    sim.tick();
    sim.edit([{ kind: 'taskState', taskId: '1', state: 'suspended' }]);
    sim.tick();
    sim.tick();
    sim.edit([
        { kind: 'taskState', taskId: '1', state: 'forced' },
        { kind: 'cpuCount', cpuCount: 1 },
    ]);
    sim.tick();
    sim.edit([
        { kind: 'taskState', taskId: '2', state: 'concluded' },
        { kind: 'cpuCount', cpuCount: 2 },
    ]);
    sim.tick();
    sim.tick();
    return sim.getLatestSnapshot();
}

const chart = (snapshot: SimulationSnapshot, extra = {}) =>
    mount(GanttChart, {
        props: { snapshot, cursor: snapshot.clock, ...extra },
    });

describe('GanttChart', () => {
    it('shows one row per task, highest ID first, then one per CPU', () => {
        const wrapper = chart(run(SMALL, 6));

        expect(
            wrapper
                .findAll('[data-task]')
                .map((row) => row.attributes('data-task')),
        ).toEqual(['2', '1']);
        expect(
            wrapper
                .findAll('[data-cpu]')
                .map((row) => row.attributes('data-cpu')),
        ).toEqual(['1']);
        const text = wrapper.text();
        expect(text.indexOf('Tarefa 2')).toBeLessThan(text.indexOf('Tarefa 1'));
        expect(text.indexOf('Tarefa 1')).toBeLessThan(
            text.indexOf('PROCESSADORES'),
        );
    });

    it('numbers every tick of the axis', () => {
        const wrapper = chart(run(SMALL, 6));

        expect(wrapper.findAll('[data-tick]').map((t) => t.text())).toEqual([
            '0',
            '1',
            '2',
            '3',
            '4',
            '5',
        ]);
    });

    it('draws one running segment per execution slice with CPU and job', () => {
        const snapshot = run(SMALL, 12);
        const wrapper = chart(snapshot);
        const segments = wrapper.findAll('[data-state="running"]');

        expect(segments).toHaveLength(snapshot.executions.length);
        expect(wrapper.text()).toContain('CPU 1 · #1');
        const first = wrapper
            .get('[data-task="1"] [data-state="running"] rect')
            .attributes();
        expect(Number(first.x)).toBe(1);
        expect(Number(first.width)).toBe(3 * TICK - 2);
    });

    it('draws a ready outline while a job waits, none for a job that never waits', () => {
        const wrapper = chart(run(SMALL, 12));

        expect(
            wrapper.find('[data-task="2"] [data-state="ready"]').exists(),
        ).toBe(true);
        const first = wrapper
            .findAll('[data-task="1"] [data-state="ready"]')
            .map((el) => el.attributes('data-job'));
        expect(first).not.toContain('0');
    });

    it('draws one marker per recorded task event, on the tick boundary', () => {
        const snapshot = run(SMALL, 12);
        const wrapper = chart(snapshot);
        const model = buildGanttModel(snapshot);
        const expected = model.taskLanes.reduce(
            (n, l) => n + l.markers.length,
            0,
        );

        expect(wrapper.findAll('[data-task] [data-event]')).toHaveLength(
            expected,
        );
        const activation = wrapper
            .findAll('[data-task="1"] [data-event="activation"]')
            .find((m) => m.get('title').text().includes('t = 5'))!;
        expect(activation.attributes('transform')).toMatch(
            new RegExp(`translate\\(${5 * TICK - 6} `),
        );
    });

    it('stacks markers sharing a lane and an instant', () => {
        const wrapper = chart(
            run(
                { ...SMALL, quantum: 10, tasks: [task('1', 'FF0000', 5, 5)] },
                6,
            ),
        );
        const atFive = wrapper
            .findAll('[data-task="1"] [data-event]')
            .filter((m) => m.get('title').text().includes('t = 5'));

        expect(atFive).toHaveLength(2);
        const ys = atFive.map((m) => m.attributes('transform')!.split(' ')[1]);
        expect(new Set(ys).size).toBe(2);
    });

    it('marks the current instant at the cursor, not at the end of the history', () => {
        const snapshot = run(SMALL, 6);
        const wrapper = chart(snapshot, { cursor: 2 });

        const lines = wrapper.findAll('[data-current]');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0].attributes('x1')).toBe(String(2 * TICK));
        expect(wrapper.text()).toContain('Instante atual');
    });

    it('scales every width with the zoom', () => {
        const snapshot = run(SMALL, 6);
        const base = chart(snapshot, { scale: 1 });
        const half = chart(snapshot, { scale: 0.5 });
        const widthOf = (w: typeof base) =>
            Number(w.get('[data-task="1"] svg').attributes('width'));

        expect(widthOf(base)).toBe(6 * TICK);
        expect(widthOf(half)).toBe(3 * TICK);
    });

    it('draws suspended, forced and removed-CPU states from the events', () => {
        const wrapper = chart(editedRun());

        expect(wrapper.findAll('[data-state="suspended"]')).toHaveLength(1);
        expect(wrapper.get('[data-state="suspended"] title').text()).toBe(
            'Suspensa: tarefa 1, [2, 4)',
        );
        expect(wrapper.findAll('[data-state="forced"]')).toHaveLength(1);
        expect(
            wrapper
                .get('[data-cpu="2"] [data-state="cpu-absent"] title')
                .text(),
        ).toBe('CPU 2 removida: [4, 5)');
        expect(wrapper.find('[data-event="task-terminated"]').exists()).toBe(
            true,
        );
    });

    it('lists the edit states in the legend only when they were drawn', () => {
        const edited = chart(editedRun()).get('.gantt-chart__legend').text();
        const plain = chart(run(SMALL, 6)).get('.gantt-chart__legend').text();

        for (const label of [
            'Suspensa',
            'Forçada',
            'CPU removida',
            'Encerramento',
        ]) {
            expect(edited).toContain(label);
            expect(plain).not.toContain(label);
        }
        for (const label of [
            'Executando',
            'Pronto',
            'Ingresso / ativação',
            'Término do job',
            'Perda de prazo',
            'Sorteio',
            'Preempção',
            'Quantum vencido',
            'Fim da tarefa',
            'CPU desligada',
            'Instante atual',
        ]) {
            expect(plain).toContain(label);
        }
    });

    it('renders an empty simulation at t = 0', () => {
        const wrapper = chart(run(SMALL, 0));

        expect(wrapper.findAll('[data-task]')).toHaveLength(2);
        expect(wrapper.findAll('[data-state="running"]')).toHaveLength(0);
    });

    it('shows a long task ID cut, with the whole ID in the title', () => {
        const long = 'A'.repeat(30);
        const wrapper = chart(
            run({ ...SMALL, tasks: [task(long, 'FF0000', 3, 5)] }, 2),
        );

        expect(
            wrapper.get('[data-task] .gantt-chart__label').attributes('title'),
        ).toBe(`Tarefa ${long}`);
    });
});
