import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import type { SimulationSnapshot, SystemConfig } from '../../../core/domain';
import { buildGanttSvg, isFinalSnapshot } from './ganttSvg';

function task(
    id: number,
    color: string,
    duration: number,
    period: number,
    deadline = period,
) {
    return { id, color, arrival: 0, duration, period, deadline, rawEvents: '' };
}

function run(config: SystemConfig, ticks: number): SimulationSnapshot {
    const sim = createSimulator(config);
    for (let i = 0; i < ticks; i++) sim.tick();
    return sim.getLatestSnapshot();
}

const count = (svg: string, pattern: string) => svg.split(pattern).length - 1;

const markersOf = (snapshot: SimulationSnapshot) =>
    snapshot.events.filter((e) => e.kind !== 'cpu-off' && e.kind !== 'cpu-on')
        .length;

/** The legend holds one sample of each of the 7 marker kinds. */
const LEGEND_SAMPLES = 7;

// RM, one CPU: T1 (3 of 5) runs first, T2 (4 of 8) waits.
const SMALL: SystemConfig = {
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 1,
    tasks: [task(1, 'FF0000', 3, 5), task(2, '0000FF', 4, 8)],
};

describe('buildGanttSvg', () => {
    it('is a standalone SVG document with no script or external reference', () => {
        const svg = buildGanttSvg(run(SMALL, 12));

        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
            true,
        );
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).not.toMatch(/<script|href=|<image|url\(/);
    });

    it('orders task rows by descending ID, lowest next to the axis', () => {
        const svg = buildGanttSvg(run(SMALL, 6));
        const rows = [
            ...svg.matchAll(/<g data-task="(\d+)">\n<rect x="\d+" y="(\d+)"/g),
        ].map((m) => ({ id: Number(m[1]), y: Number(m[2]) }));
        const axisY = Number(
            svg.match(
                /<line x1="\d+" y1="(\d+)" x2="\d+" y2="\d+" stroke="#3d404f"/,
            )![1],
        );

        expect(rows.map((r) => r.id)).toEqual([2, 1]);
        expect(rows[0].y).toBeLessThan(rows[1].y);
        expect(rows[1].y).toBeLessThan(axisY);
    });

    it('draws one running bar per execution slice, labelled with CPU and job', () => {
        const snapshot = run(SMALL, 12);
        const svg = buildGanttSvg(snapshot);

        expect(count(svg, 'data-state="running"')).toBe(
            snapshot.executions.length,
        );
        expect(svg).toContain('Execução: tarefa 1 #1 na CPU 1, [0, 3)');
        expect(svg).toContain('Execução: tarefa 2 #1 na CPU 1, [3, 5)');
        expect(svg).toContain('fill="#FF0000"');
        expect(svg).toContain('>CPU 1 · #1</text>');
    });

    it('draws a ready outline while a job waits, and none for a job that never waits', () => {
        const svg = buildGanttSvg(run(SMALL, 12));

        expect(svg).toContain('Pronta: tarefa 2 #1, [0, 3)');
        expect(svg).not.toContain('Pronta: tarefa 1 #1');
    });

    it('shows only the activation of a job behind an older incomplete one (DEC-02)', () => {
        // T1 needs 6 of every 4 ticks: job 2 is active while job 1 still runs.
        const behind: SystemConfig = {
            algorithm: 'RM',
            quantum: 10,
            cpuCount: 1,
            tasks: [task(1, 'FF0000', 6, 4, 20)],
        };
        const svg = buildGanttSvg(run(behind, 5));

        expect(svg).toContain('Ingresso / ativação: tarefa 1 #2, t = 4');
        expect(svg).not.toContain('Pronta: tarefa 1 #2');
    });

    it('draws one marker per recorded event, at the exact instant', () => {
        const snapshot = run(SMALL, 12);
        const svg = buildGanttSvg(snapshot);

        expect(count(svg, 'data-event="')).toBe(
            markersOf(snapshot) + LEGEND_SAMPLES,
        );
        // Activation of T1 job 2 at t = 5 sits on boundary 5: x0 + 5 * 28.
        const x = 16 + 96 + 5 * 28;
        expect(svg).toMatch(
            new RegExp(
                `translate\\(${x} [\\d.]+\\)"[^>]*data-event="activation"><title>Ingresso / ativação: tarefa 1 #2, t = 5`,
            ),
        );
    });

    it('stacks markers sharing a row and instant at the same x', () => {
        const svg = buildGanttSvg(run(SMALL, 12));
        const atZero = [
            ...svg.matchAll(
                /translate\((\d+) ([\d.]+)\)"[^>]*data-event="[^"]+"><title>[^<]*tarefa 1[^<]*t = 0</g,
            ),
        ];

        // Activation and draw (or similar) of T1 at t = 0.
        expect(atZero.length).toBeGreaterThanOrEqual(1);
        expect(new Set(atZero.map((m) => m[1])).size).toBe(1);
        expect(new Set(atZero.map((m) => m[2])).size).toBe(atZero.length);
    });

    it('marks a missed deadline at its instant', () => {
        const overload: SystemConfig = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [task(1, '00FF00', 4, 5), task(2, 'FFFF00', 4, 5)],
        };
        const svg = buildGanttSvg(run(overload, 6));

        expect(svg).toContain('Perda de prazo: tarefa 1 #1, t = 5');
    });

    it('draws CPU-off bands per CPU, ending at the clock when still off', () => {
        const idle: SystemConfig = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 2,
            tasks: [task(1, 'FF0000', 2, 10)],
        };
        const svg = buildGanttSvg(run(idle, 4));

        expect(count(svg, '<g data-cpu="')).toBe(2);
        expect(svg).toContain('CPU 2 desligada: [0, 4)');
    });

    it('lists every marker kind and the drawn states in the legend', () => {
        const svg = buildGanttSvg(run(SMALL, 3));

        for (const label of [
            'Ingresso / ativação',
            'Término do job',
            'Fim da tarefa',
            'Perda de prazo',
            'Sorteio',
            'Preempção',
            'Quantum vencido',
            'Execução (cor da tarefa, CPU · job)',
            'Pronta (contorno tracejado)',
            'CPU desligada',
            'Instante atual',
        ]) {
            expect(svg).toContain(`>${label}</text>`);
        }
    });

    it('depends only on the latest snapshot, not on the history cursor', () => {
        const sim = createSimulator(SMALL);
        for (let i = 0; i < 10; i++) sim.tick();
        const atEnd = buildGanttSvg(sim.getLatestSnapshot());
        sim.backward();
        sim.backward();
        sim.backward();

        expect(buildGanttSvg(sim.getLatestSnapshot())).toBe(atEnd);
        expect(atEnd).toContain('t = 0 a 10');
    });

    it('covers a long simulation with every slice, event and tick', () => {
        const long: SystemConfig = {
            algorithm: 'EDF',
            quantum: 3,
            cpuCount: 3,
            tasks: [
                task(1, 'E41A1C', 40, 300),
                task(2, '377EB8', 70, 250),
                task(3, '4DAF4A', 90, 400),
                task(4, '984EA3', 120, 320),
                task(5, 'FF7F00', 150, 280),
            ],
        };
        const snapshot = run(long, 2400);
        const svg = buildGanttSvg(snapshot);

        expect(snapshot.clock).toBe(2400);
        expect(count(svg, 'data-state="running"')).toBe(
            snapshot.executions.length,
        );
        expect(count(svg, 'data-event="')).toBe(
            markersOf(snapshot) + LEGEND_SAMPLES,
        );
        expect(svg).toContain(`>${snapshot.clock - 1}</text>`);
        expect(svg).toContain(`width="${96 + snapshot.clock * 28 + 32}"`);
        expect(svg).toContain('· parcial</text>');
    }, 60_000); // the simulation, not the SVG, dominates the time

    it('identifies a partial result and a final one from the snapshot alone', () => {
        const partial = run(SMALL, 5);
        const final = run(SMALL, 400);

        expect(isFinalSnapshot(partial)).toBe(false);
        expect(buildGanttSvg(partial)).toContain('· parcial</text>');
        expect(isFinalSnapshot(final)).toBe(true);
        expect(buildGanttSvg(final)).toContain('· final</text>');
    });

    it('chooses black or white text for contrast with the task color', () => {
        const svg = buildGanttSvg(
            run(
                {
                    algorithm: 'RM',
                    quantum: 5,
                    cpuCount: 2,
                    tasks: [task(1, 'FFFF00', 4, 10), task(2, '000080', 4, 10)],
                },
                4,
            ),
        );

        expect(svg).toMatch(/fill="#000000">CPU \d · #1/);
        expect(svg).toMatch(/fill="#ffffff">CPU \d · #1/);
    });

    it('renders an empty simulation at t = 0', () => {
        const svg = buildGanttSvg(run(SMALL, 0));

        expect(svg).toContain('t = 0 a 0');
        expect(count(svg, 'data-state="running"')).toBe(0);
    });
});
