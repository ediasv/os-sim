import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import type { SimulationSnapshot, SystemConfig } from '../../../core/domain';
import { buildGanttModel } from './ganttModel';

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

/**
 * Two CPUs, T1 and T2 of 6 ticks. Edits chosen between ticks (DEC-37):
 * T1 suspended at 2 and resumed at 4, when it is also forced and CPU 2 is
 * removed; at 5 T2 is concluded (its only job is interrupted) and CPU 2 is
 * added back. The history ends at clock 7.
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

describe('buildGanttModel with edited states (DEC-37, DEC-43)', () => {
    const lane = (id: string) =>
        buildGanttModel(editedRun()).taskLanes.find((l) => l.id === id)!;

    it('suspends from the suspension event to the resumption', () => {
        expect(lane('1').suspended).toEqual([{ start: 2, end: 4 }]);
        expect(lane('2').suspended).toEqual([]);
    });

    it('runs a suspension to the end of the history when never resumed', () => {
        const sim = createSimulator({
            ...TWO_TASKS,
            tasks: [task('1', 'FF0000', 6, 20)],
        });
        sim.tick();
        sim.tick();
        sim.edit([{ kind: 'taskState', taskId: '1', state: 'suspended' }]);
        sim.tick();
        sim.tick();
        const model = buildGanttModel(sim.getLatestSnapshot());

        expect(model.taskLanes[0].suspended).toEqual([{ start: 2, end: 4 }]);
    });

    it('forces from the forced event to the end of the history while it lasts', () => {
        expect(lane('1').forced).toEqual([{ start: 4, end: 7 }]);
        expect(lane('2').forced).toEqual([]);
    });

    it('ends a suspension or forcing at the task end', () => {
        const sim = createSimulator(TWO_TASKS);
        sim.tick();
        sim.edit([
            { kind: 'taskState', taskId: '1', state: 'forced' },
            { kind: 'taskState', taskId: '2', state: 'suspended' },
        ]);
        sim.tick();
        sim.edit([
            { kind: 'taskState', taskId: '1', state: 'concluded' },
            { kind: 'taskState', taskId: '2', state: 'concluded' },
        ]);
        const lanes = buildGanttModel(sim.getLatestSnapshot()).taskLanes;
        const get = (id: string) => lanes.find((l) => l.id === id)!;

        expect(get('1').forced).toEqual([{ start: 1, end: 2 }]);
        expect(get('2').suspended).toEqual([{ start: 1, end: 2 }]);
    });

    it('draws no ready segment while the task is suspended', () => {
        // T1 is eligible but not running during [2, 4): suspended, not ready.
        expect(lane('1').ready.filter((s) => s.start < 4 && s.end > 2)).toEqual(
            [],
        );
    });

    it('stops the ready segments of a concluded task at its end', () => {
        // T2 waits on [4, 5) with CPU 2 removed, then the task is concluded at
        // 5: its interrupted job has no completion, but it is not ready after.
        expect(lane('2').ready).toEqual([
            { start: 4, end: 5, job: { taskId: '2', index: 0 } },
        ]);
    });

    it('marks a concluded task with interrupted jobs apart from a natural finish', () => {
        const finish = lane('2').markers.find(
            (m) => m.kind === 'task-terminated',
        )!;

        expect(finish.time).toBe(5);
        expect(finish.description).toBe(
            'Encerramento da tarefa: tarefa 2, jobs interrompidos: #1, t = 5',
        );
        expect(lane('2').markers.some((m) => m.kind === 'task-finished')).toBe(
            false,
        );
    });

    it('keeps the plain finish marker for a natural end', () => {
        const sim = createSimulator({
            ...TWO_TASKS,
            tasks: [task('1', 'FF0000', 2, 20)],
        });
        while (sim.getProgress().kind !== 'finished') sim.tick();
        const markers = buildGanttModel(sim.getLatestSnapshot()).taskLanes[0]
            .markers;

        expect(markers.some((m) => m.kind === 'task-finished')).toBe(true);
        expect(markers.some((m) => m.kind === 'task-terminated')).toBe(false);
    });

    it('leaves a gap on a CPU between its removal and its addition', () => {
        const cpus = buildGanttModel(editedRun()).cpuLanes;

        expect(cpus.find((c) => c.cpuId === 2)!.absent).toEqual([
            { start: 4, end: 5 },
        ]);
        expect(cpus.find((c) => c.cpuId === 1)!.absent).toEqual([]);
    });

    it('does not count the gap as a CPU-off interval', () => {
        const cpu2 = buildGanttModel(editedRun()).cpuLanes.find(
            (c) => c.cpuId === 2,
        )!;

        expect(cpu2.off.some((i) => i.start < 5 && i.end > 4)).toBe(false);
    });

    it('lists the edited states in the legend only when they were drawn', () => {
        expect(buildGanttModel(editedRun()).extraLegend).toEqual([
            'suspended',
            'forced',
            'cpu-absent',
            'task-terminated',
        ]);
        const plain = createSimulator(TWO_TASKS);
        plain.tick();
        expect(buildGanttModel(plain.getLatestSnapshot()).extraLegend).toEqual(
            [],
        );
    });
});
