/**
 * End-to-end scenarios of #21, run through `createSimulator` with the real RM
 * and EDF policies: the reference schedules of section 2.4 (Table 2.1,
 * figures 2.5 and 2.6), the same schedules with a small quantum, the DEC-18
 * example, ties decided by each DEC-16 criterion and by the draw, the RM
 * priority of aperiodic tasks (DEC-17), and multi-CPU cases. Expected
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
 * has to be unique and valid (6 hex digits, `validateConfig`), so it is
 * derived from the ID.
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

/** Aperiodic task (period zero, DEC-09): a single job at `arrival`. */
function aperiodic(
    id: number,
    fields: { arrival?: number; duration: number; deadline: number },
): TaskDefinition {
    return periodic(id, { ...fields, period: 0 });
}

/**
 * Runs `ticks` steps on the production path and returns the last snapshot,
 * checking `findInconsistencies` on snapshot 0 and after every step (#21).
 * The clock stops at `ticks`, so the events include those at that instant.
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
const expired = (time: number, job: JobRef, cpuId = 1): SimulationEvent => ({
    kind: 'quantum-expired',
    time,
    cpuId,
    job,
});
const cpuOff = (time: number, cpuId = 1): SimulationEvent => ({
    kind: 'cpu-off',
    time,
    cpuId,
});
const cpuOn = (time: number, cpuId = 1): SimulationEvent => ({
    kind: 'cpu-on',
    time,
    cpuId,
});

// The figures run with a quantum equal to the largest duration, so no slice
// expires inside the window; the small-quantum block below checks that
// expiries only add `quantum-expired` (#21). Each window ends at the last
// instant drawn in the figure.

/** Table 2.1: A, B and C with deadline equal to period, all arriving at 0. */
const FIG_2_5 = {
    tasks: [
        periodic(1, { duration: 20, period: 100 }),
        periodic(2, { duration: 40, period: 150 }),
        periodic(3, { duration: 100, period: 350 }),
    ],
    quantum: 100,
    end: 360,
};

/** Figure 2.6: A and B with deadline equal to period; utilization is 100%. */
const FIG_2_6 = {
    tasks: [
        periodic(1, { duration: 10, period: 20 }),
        periodic(2, { duration: 25, period: 50 }),
    ],
    quantum: 25,
    end: 55,
};

describe('Figure 2.5 (#21)', () => {
    it('reproduces the RM schedule of Table 2.1 up to t=360', () => {
        const s = simulate(
            {
                algorithm: 'RM',
                quantum: FIG_2_5.quantum,
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
        expect(s.events).toEqual([
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
            cpuOff(240),
            act(300, 1, 3),
            act(300, 2, 2),
            cpuOn(300),
            done(320, 1, 3),
            act(350, 3, 1),
            done(360, 2, 2),
        ]);
        // DEC-09: no task reached its ten-job limit inside the window.
        expect(s.tasks.map((tcb) => tcb.jobs.length)).toEqual([4, 3, 2]);
    });
});

describe('Figure 2.6 (#21)', () => {
    const run = (algorithm: 'RM' | 'EDF') =>
        simulate(
            {
                algorithm,
                quantum: FIG_2_6.quantum,
                cpuCount: 1,
                tasks: FIG_2_6.tasks,
            },
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
        expect(s.events).toEqual([
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
        expect(s.events).toEqual([
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
    type QuantumExpired = Extract<SimulationEvent, { kind: 'quantum-expired' }>;
    // RM and EDF consult the policy every tick (DEC-07), so an expired slice
    // only renews and logs `quantum-expired`. Quantum 1 expires on every
    // boundary where a job keeps running; quantum 7 expires away from the
    // switches of the schedule. Either way only those events are added.
    const figures = [
        { name: 'figure 2.5 RM', algorithm: 'RM', ...FIG_2_5 },
        { name: 'figure 2.6 EDF', algorithm: 'EDF', ...FIG_2_6 },
        { name: 'figure 2.6 RM', algorithm: 'RM', ...FIG_2_6 },
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
                sliced.events.filter(
                    (event) => event.kind !== 'quantum-expired',
                ),
            ).toEqual(baseline.events);

            // An expiry belongs to a job running on that CPU; a job completing
            // on that boundary logs only the completion (DEC-18).
            const expiries = eventsOf(
                sliced,
                'quantum-expired',
            ) as QuantumExpired[];
            expect(expiries).not.toEqual([]);
            for (const expiry of expiries) {
                const running = sliced.executions.some(
                    (execution) =>
                        execution.cpuId === expiry.cpuId &&
                        execution.job.taskId === expiry.job.taskId &&
                        execution.job.index === expiry.job.index &&
                        execution.start < expiry.time &&
                        expiry.time <= execution.end,
                );
                expect(running, `expiry at t=${expiry.time}`).toBe(true);
                expect(sliced.events).not.toContainEqual(
                    done(expiry.time, expiry.job.taskId, expiry.job.index),
                );
            }
        },
    );

    it('expires figure 2.6 EDF slices of 7 at the derived instants', () => {
        // Each dispatch or resume starts a slice, and each expiry renews it
        // (DEC-03): A0 [0,10) at 7, B0 [10,20) at 17, A1 [20,30) at 27,
        // B0 [30,45) at 37 and 44, A2 [45,55) at 52.
        const s = simulate(
            { algorithm: 'EDF', quantum: 7, cpuCount: 1, tasks: FIG_2_6.tasks },
            FIG_2_6.end,
        );

        expect(eventsOf(s, 'quantum-expired')).toEqual([
            expired(7, ref(1, 0)),
            expired(17, ref(2, 0)),
            expired(27, ref(1, 1)),
            expired(37, ref(2, 0)),
            expired(44, ref(2, 0)),
            expired(52, ref(1, 2)),
        ]);
    });
});

describe('DEC-18 example (#21)', () => {
    it('keeps J on the CPU when its slice expires in a tie: J [0, 4), K [4, 6)', () => {
        // Same period: an RM priority tie. K has the smaller absolute deadline
        // (9 < 10), so criterion (2) would pick it; J stays by criterion (1)
        // at t=1 and again at t=2, when its slice expires. At t=4 J completes
        // on the boundary where the slice would expire, so only the
        // completion is logged (DEC-18, DEC-03).
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
        expect(s.events).toEqual([
            act(0, 1, 0),
            act(1, 2, 0),
            expired(2, J),
            done(4, 1, 0),
            done(6, 2, 0),
            cpuOff(6),
        ]);
    });
});

describe.each(['RM', 'EDF'] as const)('Ties under %s (#21)', (algorithm) => {
    type TieBreak = Extract<SimulationEvent, { kind: 'tie-break' }>;
    // At t=0, equal on priority and on every DEC-16 criterion under both
    // algorithms.
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

        // The selection receives the winners in draw order, and free CPUs are
        // filled in selection order (DEC-27, DEC-07).
        expect(s.executions).toEqual([
            { cpuId: 1, job: first, start: 0, end: 2 },
            { cpuId: 2, job: second, start: 0, end: 2 },
            { cpuId: 1, job: loser, start: 2, end: 4 },
        ]);
        expect(s.events).toContainEqual(cpuOff(2, 2));
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

    it('breaks a tie by the shorter task duration before any draw', () => {
        // Equal on priority, deadline and activation at t=0; the shorter
        // duration wins (DEC-16 criterion 4) and belongs to the higher ID. With
        // equal activations the longer task never runs ahead of the shorter,
        // so duration and remaining work cannot be told apart end to end;
        // `policies.test.ts` covers that difference.
        const s = simulate(
            config(1, [
                periodic(1, { duration: 4, period: 10 }),
                periodic(2, { duration: 2, period: 10 }),
            ]),
            6,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(2, 0), start: 0, end: 2 },
            { cpuId: 1, job: ref(1, 0), start: 2, end: 6 },
        ]);
        expect(eventsOf(s, 'tie-break')).toEqual([]);
    });
});

describe('RM tie by deadline (#21, DEC-16)', () => {
    it('breaks an RM priority tie by the earlier absolute deadline', () => {
        // Same period, so same RM priority; the earlier absolute deadline (6)
        // wins by criterion (2) and belongs to the higher ID. Durations are
        // equal, so without criterion (2) the tie would reach the draw. Under
        // EDF the deadline is the priority itself, so this is RM only.
        const s = simulate(
            {
                algorithm: 'RM',
                quantum: 10,
                cpuCount: 1,
                tasks: [
                    periodic(1, { duration: 2, period: 10 }),
                    periodic(2, { duration: 2, period: 10, deadline: 6 }),
                ],
            },
            4,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(2, 0), start: 0, end: 2 },
            { cpuId: 1, job: ref(1, 0), start: 2, end: 4 },
        ]);
        expect(eventsOf(s, 'tie-break')).toEqual([]);
    });
});

describe('RM priority of an aperiodic task (#21, DEC-17)', () => {
    it('runs the aperiodic job only after the periodic one', () => {
        // Period zero ranks below every periodic task, as if the period were
        // infinite; reading it as the smallest period, or falling back to the
        // lower ID, would run the aperiodic task first. Its single job is the
        // last one, so its completion is followed by `task-finished` (DEC-09,
        // DEC-22).
        const s = simulate(
            {
                algorithm: 'RM',
                quantum: 10,
                cpuCount: 1,
                tasks: [
                    aperiodic(1, { duration: 2, deadline: 20 }),
                    periodic(2, { duration: 3, period: 10 }),
                ],
            },
            5,
        );

        expect(s.executions).toEqual([
            { cpuId: 1, job: ref(2, 0), start: 0, end: 3 },
            { cpuId: 1, job: ref(1, 0), start: 3, end: 5 },
        ]);
        expect(s.events).toEqual([
            act(0, 1, 0),
            act(0, 2, 0),
            done(3, 2, 0),
            done(5, 1, 0),
            { kind: 'task-finished', time: 5, taskId: 1 },
            cpuOff(5),
        ]);
    });
});

describe.each(['RM', 'EDF'] as const)(
    'Two CPUs under %s (#21)',
    (algorithm) => {
        // Task 2 has the lowest priority under both algorithms, so task 3
        // preempts it on CPU 2 while task 1 keeps CPU 1 (DEC-07). Under EDF
        // tasks 3 and 1 share deadline 12 at t=2, but both fit the two CPUs,
        // so no tie crosses the cut.
        const run = () =>
            simulate(
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

        it('distributes jobs over both CPUs', () => {
            // At t=4 both CPUs are free and task 2, preempted on CPU 2, resumes
            // on CPU 1, the free CPU with the lowest ID (DEC-07; no migration
            // cost, DEC-04).
            expect(run().executions).toEqual([
                { cpuId: 1, job: ref(1, 0), start: 0, end: 4 },
                { cpuId: 2, job: ref(2, 0), start: 0, end: 2 },
                { cpuId: 2, job: ref(3, 0), start: 2, end: 4 },
                { cpuId: 1, job: ref(2, 0), start: 4, end: 8 },
                { cpuId: 1, job: ref(3, 1), start: 12, end: 14 },
                { cpuId: 2, job: ref(1, 1), start: 12, end: 16 },
            ]);
        });

        it('preempts on the CPU of the lowest-priority job', () => {
            expect(eventsOf(run(), 'preemption')).toEqual([
                preempt(2, ref(2, 0), ref(3, 0), 2),
            ]);
        });

        it('powers CPUs off when idle and on again at t=12', () => {
            expect(run().events).toEqual([
                act(0, 1, 0),
                act(0, 2, 0),
                act(2, 3, 0),
                preempt(2, ref(2, 0), ref(3, 0), 2),
                done(4, 1, 0),
                done(4, 3, 0),
                cpuOff(4, 2),
                done(8, 2, 0),
                cpuOff(8, 1),
                act(12, 1, 1),
                act(12, 3, 1),
                cpuOn(12, 1),
                cpuOn(12, 2),
                done(14, 3, 1),
                cpuOff(14, 1),
                done(16, 1, 1),
                cpuOff(16, 2),
            ]);
        });

        it('preempts on CPU 1 when the lowest-priority job runs there', () => {
            // Task 1 (lowest priority) starts alone on CPU 1, task 2 takes the
            // idle CPU 2 at t=1, and at t=2 task 3 preempts task 1 on CPU 1
            // while task 2 keeps CPU 2 (DEC-07). Task 1 resumes on CPU 1 at
            // t=4. EDF deadlines (30, 11, 14) keep the RM order.
            const s = simulate(
                {
                    algorithm,
                    quantum: 10,
                    cpuCount: 2,
                    tasks: [
                        periodic(1, { duration: 6, period: 30 }),
                        periodic(2, { arrival: 1, duration: 4, period: 10 }),
                        periodic(3, { arrival: 2, duration: 2, period: 12 }),
                    ],
                },
                8,
            );

            expect(s.executions).toEqual([
                { cpuId: 1, job: ref(1, 0), start: 0, end: 2 },
                { cpuId: 2, job: ref(2, 0), start: 1, end: 5 },
                { cpuId: 1, job: ref(3, 0), start: 2, end: 4 },
                { cpuId: 1, job: ref(1, 0), start: 4, end: 8 },
            ]);
            expect(s.events).toEqual([
                act(0, 1, 0),
                cpuOff(0, 2),
                act(1, 2, 0),
                cpuOn(1, 2),
                act(2, 3, 0),
                preempt(2, ref(1, 0), ref(3, 0), 1),
                done(4, 3, 0),
                done(5, 2, 0),
                cpuOff(5, 2),
                done(8, 1, 0),
                cpuOff(8, 1),
            ]);
        });
    },
);
