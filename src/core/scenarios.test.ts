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

/** Figure 2.6: A and B with deadline equal to period; utilization is 100%. */
const FIG_2_6 = {
    tasks: [
        periodic(1, { duration: 10, period: 20 }),
        periodic(2, { duration: 25, period: 50 }),
    ],
    end: 55,
};

describe('Figure 2.6 (#21)', () => {
    // Quantum 25 is the largest duration, so no slice expires (option C).
    const run = (algorithm: 'RM' | 'EDF') =>
        simulate(
            { algorithm, quantum: 25, cpuCount: 1, tasks: FIG_2_6.tasks },
            FIG_2_6.end,
        );

    it('meets every deadline under EDF up to t=55', () => {
        const s = run('EDF');

        // At t=40, B0's deadline (50) beats A2's (60), so B0 keeps the CPU.
        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(1, 0), start: 0, end: 10 },
            { cpuId: 1, job: ref(2, 0), start: 10, end: 20 },
            { cpuId: 1, job: ref(1, 1), start: 20, end: 30 },
            { cpuId: 1, job: ref(2, 0), start: 30, end: 45 },
            { cpuId: 1, job: ref(1, 2), start: 45, end: 55 },
        ]);
        expect(eventsUntil(s, FIG_2_6.end)).toEqual([
            act(0, 1, 0),
            act(0, 2, 0),
            done(10, 1, 0),
            act(20, 1, 1),
            preempt(20, ref(2, 0), ref(1, 1)),
            done(30, 1, 1),
            act(40, 1, 2),
            done(45, 2, 0),
            act(50, 2, 1),
            done(55, 1, 2),
        ]);
        expect(eventsOf(s, 'deadline-miss')).toEqual([]);
        expect(s.tasks.map((tcb) => tcb.jobs.length)).toEqual([3, 2]);
    });

    it("misses B's deadline at t=50 under RM and keeps running it", () => {
        const s = run('RM');

        // DEC-09 runs a late job to completion, as the B [50, 55) drawn in
        // the figure; the miss precedes the activation at t=50 (DEC-22).
        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(1, 0), start: 0, end: 10 },
            { cpuId: 1, job: ref(2, 0), start: 10, end: 20 },
            { cpuId: 1, job: ref(1, 1), start: 20, end: 30 },
            { cpuId: 1, job: ref(2, 0), start: 30, end: 40 },
            { cpuId: 1, job: ref(1, 2), start: 40, end: 50 },
            { cpuId: 1, job: ref(2, 0), start: 50, end: 55 },
        ]);
        expect(eventsUntil(s, FIG_2_6.end)).toEqual([
            act(0, 1, 0),
            act(0, 2, 0),
            done(10, 1, 0),
            act(20, 1, 1),
            preempt(20, ref(2, 0), ref(1, 1)),
            done(30, 1, 1),
            act(40, 1, 2),
            preempt(40, ref(2, 0), ref(1, 2)),
            done(50, 1, 2),
            { kind: 'deadline-miss', time: 50, job: ref(2, 0) },
            act(50, 2, 1),
            done(55, 2, 0),
        ]);
        expect(s.tasks.map((tcb) => tcb.jobs.length)).toEqual([3, 2]);
    });
});

describe('Quantum on the figure schedules (#21, DEC-18)', () => {
    // RM and EDF consult the policy every tick (DEC-07), so an expired slice
    // only renews and logs `quantum-expired`. Quantum 1 expires on every
    // boundary; quantum 7, counted from each dispatch, expires between them.
    const figures = [
        { name: 'figure 2.5 RM', algorithm: 'RM', quantum: 100, ...FIG_2_5 },
        { name: 'figure 2.6 EDF', algorithm: 'EDF', quantum: 25, ...FIG_2_6 },
        { name: 'figure 2.6 RM', algorithm: 'RM', quantum: 25, ...FIG_2_6 },
    ] as const;
    const cases = figures.flatMap((figure) =>
        [1, 7].map((small) => [figure.name, small, figure] as const),
    );

    it.each(cases)(
        'changes only quantum-expired events: %s with quantum %i',
        (_name, small, { algorithm, quantum, tasks, end }) => {
            const baseline = simulate(
                { algorithm, quantum, cpuCount: 1, tasks },
                end,
            );
            const sliced = simulate(
                { algorithm, quantum: small, cpuCount: 1, tasks },
                end,
            );

            expect(sliced.executions).toEqual(baseline.executions);
            expect(
                eventsUntil(sliced, end).filter(
                    (event) => event.kind !== 'quantum-expired',
                ),
            ).toEqual(eventsUntil(baseline, end));
            expect(eventsOf(sliced, 'quantum-expired')).not.toEqual([]);
        },
    );
});

describe('DEC-18 example (#21)', () => {
    it('keeps J on the CPU when its slice expires in a tie: J [0, 4), K [4, 6)', () => {
        // Same period: an RM priority tie that criterion (1) decides at t=1
        // and again at t=2, when J's slice expires. At t=4 J completes on the
        // boundary where the slice would expire, so only the completion is
        // logged (DEC-03).
        const J = ref(1, 0);
        const K = ref(2, 0);
        const s = simulate(
            {
                algorithm: 'RM',
                quantum: 2,
                cpuCount: 1,
                tasks: [
                    periodic(1, { duration: 4, period: 10 }),
                    periodic(2, {
                        arrival: 1,
                        duration: 2,
                        period: 10,
                        deadline: 8,
                    }),
                ],
            },
            6,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: J, start: 0, end: 4 },
            { cpuId: 1, job: K, start: 4, end: 6 },
        ]);
        expect(eventsOf(s, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 2, cpuId: 1, job: J },
        ]);
        expect(eventsOf(s, 'preemption')).toEqual([]);
        expect(eventsOf(s, 'tie-break')).toEqual([]);
        expect(eventsOf(s, 'completion')).toEqual([
            done(4, 1, 0),
            done(6, 2, 0),
        ]);
    });
});

describe.each(['RM', 'EDF'] as const)('Ties under %s (#21)', (algorithm) => {
    type TieBreak = Extract<SimulationEvent, { kind: 'tie-break' }>;
    // Equal on priority and on every A.4.3 criterion under both algorithms.
    const twin = (id: number) => periodic(id, { duration: 2, period: 10 });
    const config = (cpuCount: number, tasks: TaskDefinition[]) => ({
        algorithm,
        quantum: 10,
        cpuCount,
        tasks,
    });

    it('does not draw when the tied jobs fit the CPUs', () => {
        const s = simulate(config(2, [twin(1), twin(2)]), 2);

        expect(eventsOf(s, 'tie-break')).toEqual([]);
        const byTask = [...s.executions].sort(
            (a, b) => a.job.taskId - b.job.taskId,
        );
        expect(byTask).toMatchObject([
            { job: ref(1, 0), start: 0, end: 2 },
            { job: ref(2, 0), start: 0, end: 2 },
        ]);
        expect(byTask[0].cpuId).not.toBe(byTask[1].cpuId);
    });

    it('draws at the CPU cut and records one tie-break per winner', () => {
        const s = simulate(config(2, [twin(1), twin(2), twin(3)]), 4);
        const all = [ref(1, 0), ref(2, 0), ref(3, 0)];

        // The winner depends on DRAW_SEED, so it is read from the events.
        const draws = eventsOf(s, 'tie-break') as TieBreak[];
        expect(draws).toHaveLength(2);
        for (const draw of draws) {
            expect(draw.time).toBe(0);
            expect(draw.candidates).toEqual(all);
        }
        const [first, second] = draws.map((draw) => draw.winner);
        expect(first).not.toEqual(second);
        const loser = all.find(
            (job) =>
                job.taskId !== first.taskId && job.taskId !== second.taskId,
        );

        // Winners take the free CPUs in draw order (DEC-27, DEC-07).
        expect(s.executions).toEqual([
            { cpuId: 1, job: first, start: 0, end: 2 },
            { cpuId: 2, job: second, start: 0, end: 2 },
            { cpuId: 1, job: loser, start: 2, end: 4 },
        ]);
        expect(s.events).toContainEqual({ kind: 'cpu-off', time: 2, cpuId: 2 });
    });

    it('breaks a tie by earlier activation before any draw', () => {
        // At t=4, tasks 1 and 2 tie on priority (RM: same period; EDF: same
        // absolute deadline 20) and on deadline; neither ran before, so the
        // earlier activation wins (DEC-16 criterion 3). It belongs to the
        // higher ID, so falling back to ID or file order would fail (DEC-13).
        const s = simulate(
            config(1, [
                periodic(1, {
                    arrival: 1,
                    duration: 2,
                    period: 20,
                    deadline: 19,
                }),
                periodic(2, { duration: 2, period: 20 }),
                periodic(3, { duration: 4, period: 10, deadline: 5 }),
            ]),
            8,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(3, 0), start: 0, end: 4 },
            { cpuId: 1, job: ref(2, 0), start: 4, end: 6 },
            { cpuId: 1, job: ref(1, 0), start: 6, end: 8 },
        ]);
        expect(eventsOf(s, 'tie-break')).toEqual([]);
    });
});

describe.each(['RM', 'EDF'] as const)(
    'Two CPUs under %s (#21)',
    (algorithm) => {
        it('distributes jobs, preempts on the right CPU, and powers CPUs off and on', () => {
            // Task 2 has the lowest priority under both algorithms, so task 3
            // preempts it on CPU 2 while task 1 keeps CPU 1 (DEC-07). Under
            // EDF tasks 3 and 1 share deadline 12 at t=2, but both fit the two
            // CPUs, so no tie crosses the cut. At t=4 task 2 resumes on the
            // first free CPU.
            const s = simulate(
                {
                    algorithm,
                    quantum: 10,
                    cpuCount: 2,
                    tasks: [
                        periodic(1, { duration: 4, period: 12 }),
                        periodic(2, { duration: 6, period: 30 }),
                        periodic(3, { arrival: 2, duration: 2, period: 10 }),
                    ],
                },
                16,
            );

            expect(s.executions).toEqual([
                { cpuId: 1, job: ref(1, 0), start: 0, end: 4 },
                { cpuId: 2, job: ref(2, 0), start: 0, end: 2 },
                { cpuId: 2, job: ref(3, 0), start: 2, end: 4 },
                { cpuId: 1, job: ref(2, 0), start: 4, end: 8 },
                { cpuId: 1, job: ref(3, 1), start: 12, end: 14 },
                { cpuId: 2, job: ref(1, 1), start: 12, end: 16 },
            ]);
            expect(s.events).toEqual([
                act(0, 1, 0),
                act(0, 2, 0),
                act(2, 3, 0),
                preempt(2, ref(2, 0), ref(3, 0), 2),
                done(4, 1, 0),
                done(4, 3, 0),
                { kind: 'cpu-off', time: 4, cpuId: 2 },
                done(8, 2, 0),
                { kind: 'cpu-off', time: 8, cpuId: 1 },
                act(12, 1, 1),
                act(12, 3, 1),
                { kind: 'cpu-on', time: 12, cpuId: 1 },
                { kind: 'cpu-on', time: 12, cpuId: 2 },
                done(14, 3, 1),
                { kind: 'cpu-off', time: 14, cpuId: 1 },
                done(16, 1, 1),
                { kind: 'cpu-off', time: 16, cpuId: 2 },
            ]);
        });
    },
);
