import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { Simulator } from './simulator';

const periodicTask: TaskDefinition = {
    id: 1,
    color: 'F0E0D0',
    arrival: 1,
    duration: 2,
    period: 3,
    deadline: 2,
    rawEvents: '',
};

describe('Simulator', () => {
    it('publishes snapshot 0 built from the default configuration', () => {
        const snapshot = new Simulator().getLatestSnapshot();

        expect(snapshot.clock).toBe(0);
        expect(snapshot.config).toEqual(DEFAULT_CONFIG);
        expect(snapshot.cpus.map((cpu) => cpu.id)).toEqual([1]);
        expect(snapshot.tasks).toEqual([]);
    });

    it('advances the clock by exactly one tick per step (DEC-11)', () => {
        const sim = new Simulator();
        sim.tick();
        sim.tick();
        expect(sim.getLatestSnapshot().clock).toBe(2);
    });

    it('keeps earlier snapshots unchanged and frozen after later ticks', () => {
        const sim = new Simulator();
        const first = sim.getLatestSnapshot();

        sim.tick();

        expect(first.clock).toBe(0);
        expect(Object.isFrozen(first)).toBe(true);
        expect(sim.getLatestSnapshot()).not.toBe(first);
    });

    it('activates jobs at their arrival and period boundaries with individual deadlines', () => {
        const sim = new Simulator({
            ...DEFAULT_CONFIG,
            tasks: [periodicTask],
        });

        expect(sim.getLatestSnapshot().tasks[0].jobs).toEqual([]);
        sim.tick();
        expect(sim.getLatestSnapshot().tasks[0].jobs).toEqual([
            expect.objectContaining({
                taskId: 1,
                index: 0,
                activation: 1,
                absoluteDeadline: 3,
            }),
        ]);
        sim.tick();
        sim.tick();
        expect(sim.getLatestSnapshot().tasks[0].jobs).toHaveLength(1);
        sim.tick();
        expect(sim.getLatestSnapshot().tasks[0].jobs[1]).toMatchObject({
            index: 1,
            activation: 4,
            absoluteDeadline: 6,
        });
        expect(sim.getLatestSnapshot().events).toEqual([
            { kind: 'activation', time: 1, job: { taskId: 1, index: 0 } },
            { kind: 'activation', time: 4, job: { taskId: 1, index: 1 } },
        ]);
    });

    it('activates tick-zero tasks in snapshot 0 and limits periodic and aperiodic activations', () => {
        const config: SystemConfig = {
            ...DEFAULT_CONFIG,
            tasks: [
                { ...periodicTask, arrival: 0 },
                {
                    ...periodicTask,
                    id: 2,
                    color: 'AABBCC',
                    arrival: 0,
                    period: 0,
                },
            ],
        };
        const sim = new Simulator(config);

        expect(sim.getLatestSnapshot().tasks.map((tcb) => tcb.jobs)).toEqual([
            [expect.objectContaining({ activation: 0, index: 0 })],
            [expect.objectContaining({ activation: 0, index: 0 })],
        ]);
        for (let tick = 0; tick < 30; tick++) {
            sim.tick();
        }
        const snapshot = sim.getLatestSnapshot();
        expect(snapshot.tasks[0].jobs).toHaveLength(10);
        expect(snapshot.tasks[1].jobs).toHaveLength(1);
        expect(
            snapshot.events.filter((event) => event.kind === 'activation'),
        ).toHaveLength(11);
    });

    it('makes only the oldest incomplete job of each task eligible', () => {
        const sim = new Simulator({
            ...DEFAULT_CONFIG,
            tasks: [{ ...periodicTask, arrival: 0, period: 1 }],
        });
        sim.tick();
        sim.tick();

        expect(sim.getEligibleJobs()).toEqual([{ taskId: 1, index: 0 }]);
    });
});
