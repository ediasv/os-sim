/**
 * End-to-end scenarios of #21: the reference schedules of section 2.4
 * (Table 2.1, figures 2.5 and 2.6) and the tie and multi-CPU cases, run
 * through `createSimulator` with the real RM and EDF policies. Expected
 * intervals and events were derived by hand from the figures and the
 * decisions, never copied from the engine.
 */
import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import { createSimulator } from './createSimulator';
import type {
    JobRef,
    SimulationEvent,
    SimulationSnapshot,
    SystemConfig,
    TaskDefinition,
} from './domain';

const ref = (taskId: number, index: number): JobRef => ({ taskId, index });

/**
 * Periodic task with deadline equal to period unless given. The color only
 * has to be unique per task (`validateConfig`), so it is derived from the ID.
 */
function periodic(
    id: number,
    fields: {
        arrival?: number;
        duration: number;
        period: number;
        deadline?: number;
    },
): TaskDefinition {
    return {
        id,
        color: id.toString(16).toUpperCase().padStart(6, '0'),
        arrival: fields.arrival ?? 0,
        duration: fields.duration,
        period: fields.period,
        deadline: fields.deadline ?? fields.period,
        rawEvents: '',
    };
}

/**
 * Runs `ticks` steps on the production path and returns the last snapshot,
 * checking `findInconsistencies` on snapshot 0 and after every step (#21).
 */
function simulate(
    config: Pick<SystemConfig, 'algorithm' | 'quantum' | 'cpuCount' | 'tasks'>,
    ticks: number,
): SimulationSnapshot {
    const sim = createSimulator(config);
    expect(findInconsistencies(sim.getLatestSnapshot())).toEqual([]);
    for (let step = 0; step < ticks; step++) {
        sim.tick();
        expect(
            findInconsistencies(sim.getLatestSnapshot()),
            `after tick ${step + 1}`,
        ).toEqual([]);
    }
    return sim.getLatestSnapshot();
}

/** Events up to and including `end`, so a completion drawn at the window edge counts. */
function eventsUntil(
    snapshot: SimulationSnapshot,
    end: number,
): SimulationEvent[] {
    return snapshot.events.filter((event) => event.time <= end);
}

function eventsOf(
    snapshot: SimulationSnapshot,
    kind: SimulationEvent['kind'],
): SimulationEvent[] {
    return snapshot.events.filter((event) => event.kind === kind);
}

const act = (time: number, taskId: number, index: number): SimulationEvent => ({
    kind: 'activation',
    time,
    job: ref(taskId, index),
});
const done = (
    time: number,
    taskId: number,
    index: number,
): SimulationEvent => ({
    kind: 'completion',
    time,
    job: ref(taskId, index),
});
const preempt = (
    time: number,
    preempted: JobRef,
    by: JobRef,
    cpuId = 1,
): SimulationEvent => ({ kind: 'preemption', time, cpuId, preempted, by });

/** Table 2.1: A, B and C with deadline equal to period, all arriving at 0. */
const FIG_2_5 = {
    tasks: [
        periodic(1, { duration: 20, period: 100 }),
        periodic(2, { duration: 40, period: 150 }),
        periodic(3, { duration: 100, period: 350 }),
    ],
    end: 360,
};

describe('Figure 2.5 (#21)', () => {
    it('reproduces the RM schedule of Table 2.1 up to t=360', () => {
        // Quantum 100 is the largest duration, so no slice expires (option C).
        const s = simulate(
            {
                algorithm: 'RM',
                quantum: 100,
                cpuCount: 1,
                tasks: FIG_2_5.tasks,
            },
            FIG_2_5.end,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(1, 0), start: 0, end: 20 },
            { cpuId: 1, job: ref(2, 0), start: 20, end: 60 },
            { cpuId: 1, job: ref(3, 0), start: 60, end: 100 },
            { cpuId: 1, job: ref(1, 1), start: 100, end: 120 },
            { cpuId: 1, job: ref(3, 0), start: 120, end: 150 },
            { cpuId: 1, job: ref(2, 1), start: 150, end: 190 },
            { cpuId: 1, job: ref(3, 0), start: 190, end: 200 },
            { cpuId: 1, job: ref(1, 2), start: 200, end: 220 },
            { cpuId: 1, job: ref(3, 0), start: 220, end: 240 },
            { cpuId: 1, job: ref(1, 3), start: 300, end: 320 },
            { cpuId: 1, job: ref(2, 2), start: 320, end: 360 },
        ]);
        expect(eventsUntil(s, FIG_2_5.end)).toEqual([
            act(0, 1, 0),
            act(0, 2, 0),
            act(0, 3, 0),
            done(20, 1, 0),
            done(60, 2, 0),
            act(100, 1, 1),
            preempt(100, ref(3, 0), ref(1, 1)),
            done(120, 1, 1),
            act(150, 2, 1),
            preempt(150, ref(3, 0), ref(2, 1)),
            done(190, 2, 1),
            act(200, 1, 2),
            preempt(200, ref(3, 0), ref(1, 2)),
            done(220, 1, 2),
            done(240, 3, 0),
            { kind: 'cpu-off', time: 240, cpuId: 1 },
            act(300, 1, 3),
            act(300, 2, 2),
            { kind: 'cpu-on', time: 300, cpuId: 1 },
            done(320, 1, 3),
            act(350, 3, 1),
            done(360, 2, 2),
        ]);
        // DEC-09: no task reached its ten-job limit inside the window.
        expect(s.tasks.map((tcb) => tcb.jobs.length)).toEqual([4, 3, 2]);
    });
});
