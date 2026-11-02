import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import type { SimulationSnapshot, SystemConfig } from '../../../core/domain';
import { buildGanttSvg } from './ganttSvg';

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

const TWO_TASKS: SystemConfig = {
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 2,
    tasks: [task('1', 'FF0000', 6, 20), task('2', '0000FF', 6, 20)],
};

const count = (svg: string, pattern: string) => svg.split(pattern).length - 1;

/**
 * T1 suspended on [2, 4), forced from 4; CPU 2 removed on [4, 5); T2
 * concluded at 5 with its job interrupted. Clock 7 (same as the model tests).
 */
function editedRun(): SimulationSnapshot {
    const sim = createSimulator(TWO_TASKS);
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

describe('buildGanttSvg with edited states (DEC-37)', () => {
    const svg = buildGanttSvg(editedRun());

    it('draws a suspended segment from suspension to resumption, on a dark hatch', () => {
        expect(count(svg, 'data-state="suspended"')).toBe(1);
        expect(svg).toContain('Suspensa: tarefa 1, [2, 4)');
        expect(svg).toMatch(/<pattern id="suspended-hatch"/);
        expect(svg).toContain('fill="url(#suspended-hatch)"');
    });

    it('draws a forced segment, distinct from a normal running bar', () => {
        expect(count(svg, 'data-state="forced"')).toBe(1);
        expect(svg).toContain('Forçada: tarefa 1, [4, 7)');
    });

    it('leaves a gap on the CPU lane between removal and addition, not an off bar', () => {
        expect(count(svg, 'data-state="cpu-absent"')).toBe(1);
        expect(svg).toContain('CPU 2 removida: [4, 5)');
        expect(svg).not.toContain('CPU 2 desligada: [4, 5)');
    });

    it('draws no ready outline while suspended or after the task end', () => {
        expect(svg).not.toContain('Pronta: tarefa 1 #1, [2, 4)');
        expect(svg).not.toContain('Pronta: tarefa 2 #1, [5');
        expect(svg).toContain('Pronta: tarefa 2 #1, [4, 5)');
    });

    it('marks an interrupted end apart from a natural one', () => {
        expect(count(svg, 'data-event="task-terminated"')).toBe(2); // marker + legend
        expect(svg).toContain(
            'Encerramento da tarefa: tarefa 2, jobs interrompidos: #1, t = 5',
        );
    });

    it('lists the edited states in the legend', () => {
        for (const label of [
            'Suspensa (hachura escura)',
            'Forçada',
            'CPU removida',
            'Encerramento (jobs interrompidos)',
        ]) {
            expect(svg).toContain(`>${label}</text>`);
        }
    });

    it('keeps the legend and defs unchanged when no edit was made', () => {
        const plain = createSimulator(TWO_TASKS);
        plain.tick();
        const out = buildGanttSvg(plain.getLatestSnapshot());

        for (const absent of [
            'Suspensa',
            'Forçada',
            'CPU removida',
            'Encerramento',
            'suspended-hatch',
            'absent-hatch',
        ]) {
            expect(out).not.toContain(absent);
        }
    });
});
