import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import type { SimulationSnapshot, SystemConfig } from '../../../core/domain';
import { buildGanttModel, isFinalSnapshot } from './ganttModel';

function task(
    id: string,
    color: string,
    duration: number,
    period: number,
    deadline = period,
) {
    return { id, color, arrival: 0, duration, period, deadline, rawEvents: '' };
}

function run(config: SystemConfig, ticks: number): SimulationSnapshot {
    const sim = createSimulator(config);
    for (let i = 0; i < ticks && sim.getProgress().kind !== 'finished'; i++) {
        sim.tick();
    }
    return sim.getLatestSnapshot();
}

// RM, one CPU: T1 (3 of 5) runs first, T2 (4 of 8) waits.
const SMALL: SystemConfig = {
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 1,
    tasks: [task('1', 'FF0000', 3, 5), task('2', '0000FF', 4, 8)],
};

describe('buildGanttModel', () => {
    it('orders task lanes by descending natural ID, lowest last (A.2.5, DEC-48)', () => {
        const config = {
            ...SMALL,
            tasks: [
                task('2', 'FF0000', 1, 10),
                task('10', '00FF00', 1, 10),
                task('A', '0000FF', 1, 10),
                task('1', 'FFFF00', 1, 10),
            ],
        };
        const model = buildGanttModel(run(config, 3));

        expect(model.taskLanes.map((lane) => lane.id)).toEqual([
            'A',
            '10',
            '2',
            '1',
        ]);
    });

    it('carries the task color and one running segment per execution slice', () => {
        const snapshot = run(SMALL, 12);
        const model = buildGanttModel(snapshot);
        const lane = (id: string) => model.taskLanes.find((l) => l.id === id)!;

        expect(lane('1').color).toBe('FF0000');
        expect(model.taskLanes.reduce((n, l) => n + l.running.length, 0)).toBe(
            snapshot.executions.length,
        );
        expect(lane('1').running[0]).toMatchObject({
            start: 0,
            end: 3,
            cpuId: 1,
            job: { taskId: '1', index: 0 },
        });
        expect(lane('2').running[0]).toMatchObject({ start: 3, end: 5 });
    });

    it('gives a ready segment only to the ticks a job waits', () => {
        const model = buildGanttModel(run(SMALL, 12));
        const lane = (id: string) => model.taskLanes.find((l) => l.id === id)!;

        expect(lane('2').ready[0]).toMatchObject({
            start: 0,
            end: 3,
            job: { taskId: '2', index: 0 },
        });
        expect(lane('1').ready.filter((s) => s.job.index === 0)).toEqual([]);
    });

    it('gives no ready segment to a job behind an older incomplete one (DEC-02)', () => {
        // T1 needs 6 of every 4 ticks: job 2 is active while job 1 still runs.
        const behind: SystemConfig = {
            algorithm: 'RM',
            quantum: 10,
            cpuCount: 1,
            tasks: [task('1', 'FF0000', 6, 4, 20)],
        };
        const lane = buildGanttModel(run(behind, 5)).taskLanes[0];

        expect(lane.ready.filter((s) => s.job.index === 1)).toEqual([]);
        expect(
            lane.markers.some((m) => m.kind === 'activation' && m.time === 4),
        ).toBe(true);
    });

    it('has one marker per task event, none for CPU events, in event order', () => {
        const snapshot = run(SMALL, 12);
        const model = buildGanttModel(snapshot);
        const taskEvents = snapshot.events.filter(
            (e) => e.kind !== 'cpu-off' && e.kind !== 'cpu-on',
        );
        const markers = model.taskLanes.flatMap((l) => l.markers);

        expect(markers).toHaveLength(taskEvents.length);
        expect(markers.map((m) => m.sequence).sort((a, b) => a - b)).toEqual(
            snapshot.events
                .map((e, index) =>
                    e.kind !== 'cpu-off' && e.kind !== 'cpu-on' ? index : -1,
                )
                .filter((index) => index >= 0),
        );
        const activation = model.taskLanes
            .find((l) => l.id === '1')!
            .markers.find((m) => m.kind === 'activation' && m.time === 5)!;
        expect(activation.description).toBe(
            'Ingresso / ativação: tarefa 1 #2, t = 5',
        );
    });

    it('stacks markers sharing a lane and instant, and sizes the lane depth', () => {
        // 5 of every 5 ticks: job 1 completes at t = 5, the very tick job 2
        // activates, so two markers of the same lane share that instant.
        const full: SystemConfig = {
            algorithm: 'RM',
            quantum: 10,
            cpuCount: 1,
            tasks: [task('1', 'FF0000', 5, 5)],
        };
        const lane = buildGanttModel(run(full, 6)).taskLanes[0];
        const atFive = lane.markers.filter((m) => m.time === 5);

        expect(atFive.map((m) => m.kind).sort()).toEqual([
            'activation',
            'completion',
        ]);
        expect(atFive.map((m) => m.level)).toEqual([0, 1]);
        expect(lane.depth).toBe(2);
        expect(
            buildGanttModel(run(SMALL, 12)).taskLanes.every(
                (l) => l.depth >= 1,
            ),
        ).toBe(true);
    });

    it('describes a missed deadline at its instant', () => {
        const overload: SystemConfig = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [task('1', '00FF00', 4, 5), task('2', 'FFFF00', 4, 5)],
        };
        const lane = buildGanttModel(run(overload, 6)).taskLanes.find(
            (l) => l.id === '1',
        )!;

        expect(
            lane.markers.find((m) => m.kind === 'deadline-miss')!.description,
        ).toBe('Perda de prazo: tarefa 1 #1, t = 5');
    });

    it('lists CPU lanes with off intervals closed at the clock', () => {
        const idle: SystemConfig = {
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 2,
            tasks: [task('1', 'FF0000', 2, 10)],
        };
        const model = buildGanttModel(run(idle, 4));

        expect(model.cpuLanes.map((l) => l.cpuId)).toEqual([1, 2]);
        expect(model.cpuLanes[1].off).toEqual([{ start: 0, end: 4 }]);
    });

    it('spans ticks 0..clock, at least one tick, and flags a final result', () => {
        const empty = buildGanttModel(run(SMALL, 0));
        const partial = buildGanttModel(run(SMALL, 3));

        expect(empty.ticks).toBe(1);
        expect(partial.ticks).toBe(3);
        expect(partial.final).toBe(false);
        expect(isFinalSnapshot(run(SMALL, 3))).toBe(false);
    });
});
