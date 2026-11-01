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

        expect(
            svg.startsWith(
                '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns=',
            ),
        ).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).not.toMatch(/<script|href=|<image|url\((?!#)/);
    });

    it('orders task rows by descending ID, lowest next to the CPU lanes', () => {
        const svg = buildGanttSvg(run(SMALL, 6));
        const labelY = (text: string) =>
            Number(
                svg.match(new RegExp(`y="([0-9.]+)"[^>]*>${text}</text>`))![1],
            );

        expect(labelY('Tarefa 2')).toBeLessThan(labelY('Tarefa 1'));
        expect(labelY('Tarefa 1')).toBeLessThan(labelY('PROCESSADORES'));
        expect(labelY('PROCESSADORES')).toBeLessThan(labelY('CPU 1'));
    });

    it('puts the tick axis above the lanes, each number centered in its cell', () => {
        const svg = buildGanttSvg(run(SMALL, 6));
        const axis = svg.match(
            /<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="middle"[^>]*>0<\/text>/,
        )!;
        const lane = svg.match(/y="([\d.]+)"[^>]*>Tarefa 2<\/text>/)!;

        // 32 outer + 17 card inset + 90 labels, plus half a 73 px cell.
        expect(Number(axis[1])).toBe(32 + 17 + 90 + 36.5);
        expect(Number(axis[2])).toBeLessThan(Number(lane[1]));
    });

    it('sizes the image from the data only: 98 + 90 + 9 + ticks x 73', () => {
        const svg = buildGanttSvg(run(SMALL, 12));

        expect(svg).toContain(`width="${197 + 12 * 73}"`);
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
        // [0, 3): x = tick 0 + 1, width = 3 x 73 - 2, as the Figma bars.
        expect(svg).toContain(`x="${139 + 1}" y="`);
        expect(svg).toContain('width="217" height="28"');
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
        const x = 32 + 17 + 90 + 5 * 73 - 6;
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
                /translate\((\d+) ([\d.]+)\)" data-event="[^"]+"><title>[^<]*tarefa 1[^<]*t = 0</g,
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
            'Executando (cor da tarefa)',
            'Pronto (contorno tracejado)',
            'Ingresso / ativação',
            'Término do job',
            'Perda de prazo',
            'Sorteio (desempate)',
            'Preempção',
            'Quantum vencido',
            'Fim da tarefa (último job)',
            'CPU desligada',
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
        expect(atEnd).toContain('ticks 0–10');
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
        expect(svg).toContain(`width="${197 + snapshot.clock * 73}"`);
        expect(svg).toContain('resultado parcial');
    }, 60_000); // the simulation, not the SVG, dominates the time

    it('identifies a partial result and a final one from the snapshot alone', () => {
        const partial = run(SMALL, 5);
        const final = run(SMALL, 400);

        expect(isFinalSnapshot(partial)).toBe(false);
        expect(buildGanttSvg(partial)).toContain('resultado parcial');
        expect(isFinalSnapshot(final)).toBe(true);
        expect(buildGanttSvg(final)).not.toContain('resultado parcial');
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

    it('draws the grid with one repeating pattern, not a line per tick', () => {
        const lanes = (svg: string) => count(svg, 'fill="url(#tick-grid)"');
        const shortRun = buildGanttSvg(run(SMALL, 10));
        const longRun = buildGanttSvg(run(SMALL, 200));

        expect(count(shortRun, '<pattern id="tick-grid"')).toBe(1);
        expect(lanes(shortRun)).toBe(3); // 2 tasks + 1 CPU
        expect(lanes(longRun)).toBe(lanes(shortRun));
        // Per lane: closing boundary only; no line per tick.
        expect(count(longRun, '<line ')).toBe(count(shortRun, '<line '));
    });

    it('clips bar and CPU-off labels to their box', () => {
        const svg = buildGanttSvg(run(SMALL, 12));

        // Each label sits in a nested <svg> exactly as wide as its bar.
        expect(svg).toMatch(
            /<svg x="\d+" y="\d+" width="217" height="28"><text[^>]*>CPU 1 · #1<\/text><\/svg>/,
        );
    });

    it('has no current-instant line and no suspended entry (left for #26)', () => {
        const svg = buildGanttSvg(run(SMALL, 12));

        expect(svg).not.toContain('data-current');
        expect(svg).not.toContain('Instante atual');
        expect(svg).not.toContain('Suspenso');
    });

    it('labels every CPU-off interval "Desligada", even a one-tick one', () => {
        const idle: SystemConfig = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 2,
            tasks: [task(1, 'FF0000', 2, 10)],
        };
        const svg = buildGanttSvg(run(idle, 4));

        expect(svg).toContain('>Desligada</text>');
        expect(buildGanttSvg(run(idle, 1))).toContain('>Desligada</text>');
        expect(buildGanttSvg(run(idle, 1))).not.toContain('>Off</text>');
    });

    it('shows the file name and the export instant in the header when given', () => {
        const snapshot = run(SMALL, 12);
        const svg = buildGanttSvg(snapshot, {
            fileName: 'tarefas.txt',
            exportedAt: new Date(2026, 9, 17, 14, 32),
        });

        expect(svg).toContain('>os-sim — tarefas.txt</text>');
        expect(svg).toContain(
            'RM  ·  quantum 5  ·  1 CPU  ·  2 tarefas  ·  ticks 0–12',
        );
        expect(svg).toContain('exportado em 17/10/2026 14:32');
        expect(buildGanttSvg(snapshot)).toContain('>os-sim</text>');
        expect(buildGanttSvg(snapshot)).not.toContain('exportado em');
    });

    it('renders an empty simulation at t = 0', () => {
        const svg = buildGanttSvg(run(SMALL, 0));

        expect(svg).toContain('ticks 0–0');
        expect(count(svg, 'data-state="running"')).toBe(0);
    });
});
