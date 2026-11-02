import { describe, expect, it } from 'vitest';
import {
    DEFAULT_CONFIG,
    type TaskDefinition,
    type TaskStatus,
    type SystemConfig,
} from './domain';
import { createSimulator } from './createSimulator';
import { findInconsistencies } from './consistency';
import type { Simulator } from './simulator';

const task = (
    id = '1',
    changes: Partial<TaskDefinition> = {},
): TaskDefinition => ({
    id,
    color: id === '1' ? '112233' : '445566',
    arrival: 0,
    duration: 5,
    period: 2,
    deadline: 3,
    rawEvents: '',
    ...changes,
});
/** A later task of its own, so ticks stay possible after task 1 is concluded (DEC-49). */
const keepAlive = () =>
    task('2', { duration: 50, period: 0, deadline: 100, arrival: 5 });
const make = (tasks = [task()], changes: Partial<SystemConfig> = {}) =>
    createSimulator({ ...DEFAULT_CONFIG, tasks, ...changes });
function edit(sim: Simulator, state: TaskStatus, taskId = '1') {
    sim.edit([{ kind: 'taskState', taskId, state }]);
    expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
}
function advance(sim: Simulator, ticks: number) {
    for (let i = 0; i < ticks; i++) {
        sim.tick();
        expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
    }
}
const at = (sim: Simulator, time = sim.getCursor()) =>
    sim.getCurrentSnapshot().events.filter((event) => event.time === time);

describe('task suspension', () => {
    it('releases the CPU without preemption, blocks pending jobs, and restarts the slice on resumption', () => {
        const sim = make();
        advance(sim, 2);
        edit(sim, 'suspended');
        expect(sim.getCurrentSnapshot().cpus[0]).toMatchObject({
            running: null,
            sliceElapsed: 0,
        });
        expect(at(sim)).toContainEqual({
            kind: 'suspension',
            time: 2,
            taskId: '1',
            cpuId: 1,
        });
        expect(at(sim).some((e) => e.kind === 'preemption')).toBe(false);
        advance(sim, 1);
        expect(
            sim.getCurrentSnapshot().tasks[0].jobs.map((j) => j.executed),
        ).toEqual([2, 0]);
        expect(at(sim)).toContainEqual({
            kind: 'deadline-miss',
            time: 3,
            job: { taskId: '1', index: 0 },
        });
        edit(sim, 'ready');
        expect(at(sim)).toContainEqual({
            kind: 'resumption',
            time: 3,
            taskId: '1',
        });
        expect(sim.getCurrentSnapshot().cpus[0]).toMatchObject({
            running: { taskId: '1', index: 0 },
            sliceElapsed: 0,
        });
    });
    it('leaves CPU, slice, events and draw unchanged when suspension cancels within a tick', () => {
        const sim = make();
        advance(sim, 2);
        const before = sim.getCurrentSnapshot();
        edit(sim, 'suspended');
        edit(sim, 'ready');
        expect(sim.getCurrentSnapshot()).toEqual(before);
    });
    it.each([
        { arrival: 3, duration: 1, period: 5, tick: 0, due: 3 },
        { arrival: 0, duration: 1, period: 5, tick: 2, due: 5 },
    ])(
        'suspends before an activation at $due without stopping its deadline',
        ({ tick, due, ...changes }) => {
            const sim = make([task('1', { ...changes, deadline: 1 })]);
            advance(sim, tick);
            edit(sim, 'suspended');
            expect(at(sim)).toContainEqual({
                kind: 'suspension',
                time: tick,
                taskId: '1',
                cpuId: null,
            });
            advance(sim, due + 1 - tick);
            const job = sim.getCurrentSnapshot().tasks[0].jobs.at(-1)!;
            expect(job).toMatchObject({
                activation: due,
                executed: 0,
                deadlineMissed: true,
            });
        },
    );
    it('resumption returns to competition without guaranteeing a CPU', () => {
        const sim = make([
            task('1', { period: 10 }),
            task('2', { arrival: 1, period: 2 }),
        ]);
        edit(sim, 'suspended');
        advance(sim, 1);
        edit(sim, 'ready');
        expect(sim.getCurrentSnapshot().cpus[0].running?.taskId).toBe('2');
        expect(sim.getCurrentSnapshot().tasks[0].jobs[0].executed).toBe(0);
    });
});

describe('forced task dispatch', () => {
    it.each(['RM', 'EDF'] as const)(
        'reserves a CPU before %s selects the remaining work',
        (algorithm) => {
            const sim = make(
                [
                    task('1', { period: 1, deadline: 1 }),
                    task('2', { period: 2, deadline: 2 }),
                    task('3', { color: '778899', period: 10, deadline: 10 }),
                ],
                { algorithm, cpuCount: 2 },
            );
            advance(sim, 1);
            edit(sim, 'forced', '3');
            expect(
                sim.getCurrentSnapshot().cpus.map((c) => c.running?.taskId),
            ).toEqual(['1', '3']);
            expect(at(sim)).toContainEqual({
                kind: 'preemption',
                time: 1,
                cpuId: 2,
                preempted: { taskId: '2', index: 0 },
                by: { taskId: '3', index: 0 },
            });
        },
    );
    it('records the preemption of previously running work by a forced job', () => {
        const sim = make([task('1', { period: 1 }), task('2', { period: 10 })]);
        advance(sim, 1);
        edit(sim, 'forced', '2');
        expect(at(sim)).toContainEqual({
            kind: 'preemption',
            time: 1,
            cpuId: 1,
            preempted: { taskId: '1', index: 0 },
            by: { taskId: '2', index: 0 },
        });
    });
    it('never expires a forced slice and starts a fresh slice when unforced', () => {
        const sim = make([task('1', { duration: 10 })], { quantum: 1 });
        edit(sim, 'forced');
        advance(sim, 3);
        expect(
            sim
                .getCurrentSnapshot()
                .events.some((e) => e.kind === 'quantum-expired'),
        ).toBe(false);
        edit(sim, 'ready');
        expect(sim.getCurrentSnapshot().cpus[0].sliceElapsed).toBe(0);
        expect(at(sim)).toContainEqual({
            kind: 'unforced',
            time: 3,
            taskId: '1',
        });
        expect(at(sim).some((e) => e.kind === 'quantum-expired')).toBe(false);
        advance(sim, 1);
        expect(at(sim).some((e) => e.kind === 'quantum-expired')).toBe(true);
    });
    it('cancels forcing within the tick without events or a changed draw', () => {
        const sim = make();
        advance(sim, 1);
        const before = sim.getCurrentSnapshot();
        edit(sim, 'forced');
        edit(sim, 'ready');
        expect(sim.getCurrentSnapshot()).toEqual(before);
    });
    it.each([0, 4])(
        'keeps forcing through future activations (arrival %s)',
        (arrival) => {
            const sim = make([
                task('1', { arrival, duration: 1, period: 3 }),
                task('2', { duration: 20, period: 1 }),
            ]);
            edit(sim, 'forced');
            advance(sim, arrival);
            expect(sim.getCurrentSnapshot().cpus[0].running).toEqual({
                taskId: '1',
                index: 0,
            });
            advance(sim, 3);
            expect(sim.getCurrentSnapshot().cpus[0].running).toEqual({
                taskId: '1',
                index: 1,
            });
            expect(sim.getCurrentSnapshot().tasks[0].status).toBe('forced');
        },
    );
    it('orders unforced before suspension and resumption before forced', () => {
        const sim = make();
        edit(sim, 'forced');
        advance(sim, 1);
        edit(sim, 'suspended');
        expect(
            at(sim).filter((e) => ['unforced', 'suspension'].includes(e.kind)),
        ).toEqual([
            { kind: 'unforced', time: 1, taskId: '1' },
            { kind: 'suspension', time: 1, taskId: '1', cpuId: 1 },
        ]);
        advance(sim, 1);
        edit(sim, 'forced');
        expect(
            at(sim).filter((e) => ['resumption', 'forced'].includes(e.kind)),
        ).toEqual([
            { kind: 'resumption', time: 2, taskId: '1' },
            { kind: 'forced', time: 2, taskId: '1' },
        ]);
    });
    it('preserves the first tie-break when a job stops being forced', () => {
        const sim = make([task(), task('2')]);
        edit(sim, 'forced', '2');
        advance(sim, 1);
        edit(sim, 'ready', '2');
        expect(sim.getCurrentSnapshot().cpus[0].running?.taskId).toBe('2');
        expect(at(sim).some((e) => e.kind === 'tie-break')).toBe(false);
    });
});

describe('task conclusion', () => {
    it('interrupts current and pending jobs, retaining deadline misses but producing no completion or future activation', () => {
        const sim = make([task(), keepAlive()]);
        advance(sim, 3);
        edit(sim, 'concluded');
        const state = sim.getCurrentSnapshot();
        expect(
            state.tasks[0].jobs.map((j) => [
                j.state,
                j.executed,
                j.completedAt,
            ]),
        ).toEqual([
            ['interrupted', 3, null],
            ['interrupted', 0, null],
        ]);
        expect(state.cpus[0].running).toBeNull();
        expect(at(sim)).toContainEqual({
            kind: 'task-finished',
            time: 3,
            taskId: '1',
            interrupted: [
                { taskId: '1', index: 0 },
                { taskId: '1', index: 1 },
            ],
        });
        expect(
            at(sim).some(
                (e) => e.kind === 'preemption' || e.kind === 'completion',
            ),
        ).toBe(false);
        advance(sim, 10);
        expect(sim.getCurrentSnapshot().tasks[0].jobs).toEqual(
            state.tasks[0].jobs,
        );
        expect(
            sim
                .getCurrentSnapshot()
                .events.filter((e) => e.kind === 'deadline-miss'),
        ).toEqual([
            { kind: 'deadline-miss', time: 3, job: { taskId: '1', index: 0 } },
        ]);
    });
    it.each([
        { arrival: 5, period: 4, tick: 0 },
        { arrival: 0, period: 4, tick: 2 },
    ])(
        'concludes with no incomplete jobs at tick $tick',
        ({ tick, ...changes }) => {
            const sim = make([
                task('1', { ...changes, duration: 1 }),
                keepAlive(),
            ]);
            advance(sim, tick);
            edit(sim, 'concluded');
            expect(at(sim)).toContainEqual({
                kind: 'task-finished',
                time: tick,
                taskId: '1',
                interrupted: [],
            });
            const jobs = sim.getCurrentSnapshot().tasks[0].jobs;
            advance(sim, 10);
            expect(sim.getCurrentSnapshot().tasks[0].jobs).toEqual(jobs);
        },
    );
    it('accepts conclusion of a naturally finished task without duplicating task-finished', () => {
        const sim = make([task('1', { period: 0, duration: 1 }), keepAlive()]);
        advance(sim, 1);
        edit(sim, 'concluded');
        expect(sim.getCurrentSnapshot().tasks[0].status).toBe('concluded');
        expect(
            sim
                .getCurrentSnapshot()
                .events.filter((e) => e.kind === 'task-finished'),
        ).toEqual([
            { kind: 'task-finished', time: 1, taskId: '1', interrupted: [] },
        ]);
        advance(sim, 1);
        edit(sim, 'concluded');
        expect(
            sim
                .getCurrentSnapshot()
                .events.filter((e) => e.kind === 'task-finished'),
        ).toHaveLength(1);
    });
    it.each(['forced', 'suspended'] as const)(
        'concludes a %s task and frees forced capacity',
        (status) => {
            const sim = make([task(), task('2')]);
            edit(sim, status);
            advance(sim, 1);
            edit(sim, 'concluded');
            expect(
                at(sim).filter((e) =>
                    ['unforced', 'resumption'].includes(e.kind),
                ),
            ).toEqual([]);
            edit(sim, 'forced', '2');
            expect(sim.getCurrentSnapshot().cpus[0].running?.taskId).toBe('2');
            expect(sim.getCurrentSnapshot().tasks[0].jobs[0].state).toBe(
                'interrupted',
            );
        },
    );
});

describe('task state history and boundaries', () => {
    it('folds forcing then suspension to only suspension, including the draw', () => {
        const a = make([task(), task('2')]);
        const b = make([task(), task('2')]);
        advance(a, 2);
        advance(b, 2);
        edit(a, 'forced');
        edit(a, 'suspended');
        edit(b, 'suspended');
        expect(a.getCurrentSnapshot()).toEqual(b.getCurrentSnapshot());
    });
    it.each([0, 2])(
        'edits tick %s without changing the past and discards future edits',
        (tick) => {
            const sim = make();
            advance(sim, 4);
            edit(sim, 'forced');
            sim.restore(0);
            const first = sim.getCurrentSnapshot();
            sim.restore(tick);
            edit(sim, 'suspended');
            expect(sim.getLatestSnapshot().clock).toBe(tick);
            expect(sim.canForward()).toBe(false);
            expect(() => sim.getEdits(4)).toThrow(RangeError);
            if (tick > 0) {
                sim.restore(0);
                expect(sim.getCurrentSnapshot()).toBe(first);
                sim.restore(tick);
            }
            advance(sim, 1);
            expect(sim.getCurrentSnapshot().tasks[0].jobs[0].executed).toBe(
                tick,
            );
        },
    );
    it('refuses an entire edit without changing state, future, cursor or recorded edits', () => {
        const sim = make();
        advance(sim, 4);
        const latest = sim.getLatestSnapshot();
        sim.restore(2);
        const current = sim.getCurrentSnapshot();
        const edits = sim.getEdits(2);
        expect(() =>
            sim.edit([
                { kind: 'taskState', taskId: '1', state: 'suspended' },
                { kind: 'taskState', taskId: '9', state: 'forced' },
            ]),
        ).toThrow('Não existe a tarefa 9.');
        expect(sim.getCurrentSnapshot()).toBe(current);
        expect(sim.getLatestSnapshot()).toBe(latest);
        expect(sim.getCursor()).toBe(2);
        expect(sim.getEdits(2)).toBe(edits);
    });
    it.each(['forced', 'suspended'] as const)(
        'applies %s to the next pending job when the previous job completes at the edited boundary',
        (status) => {
            const sim = make([task('1', { duration: 2, period: 1 })]);
            advance(sim, 2);
            edit(sim, status);
            const state = sim.getCurrentSnapshot();
            expect(state.tasks[0].jobs.map((j) => j.executed)).toEqual([
                2, 0, 0,
            ]);
            expect(state.tasks[0].jobs[0].state).toBe('completed');
            expect(state.cpus[0].running).toEqual(
                status === 'forced' ? { taskId: '1', index: 1 } : null,
            );
            advance(sim, 1);
            expect(sim.getCurrentSnapshot().tasks[0].jobs[2].executed).toBe(0);
        },
    );
});

describe('review follow-ups: forced dispatch order', () => {
    it('gives forced jobs the free CPUs before the policy fills the rest (DEC-37 5.3)', () => {
        const sim = make(
            [
                task('1', { period: 4, deadline: 4 }),
                task('2', { period: 8, deadline: 8 }),
            ],
            { cpuCount: 2 },
        );
        edit(sim, 'forced', '2');
        expect(
            sim.getCurrentSnapshot().cpus.map((cpu) => cpu.running?.taskId),
        ).toEqual(['2', '1']);
    });

    it('keeps a higher-priority forced job out of the policy view so the other task still runs', () => {
        const sim = make(
            [
                task('1', { period: 5, deadline: 5 }),
                task('2', { period: 10, deadline: 10 }),
            ],
            { cpuCount: 2 },
        );
        edit(sim, 'forced', '1');
        expect(
            sim.getCurrentSnapshot().cpus.map((cpu) => cpu.running?.taskId),
        ).toEqual(['1', '2']);
    });
});

describe('review follow-ups: identity edits and event order', () => {
    const stateEvents = (sim: Simulator) =>
        at(sim).filter((event) =>
            ['suspension', 'resumption', 'forced', 'unforced'].includes(
                event.kind,
            ),
        );

    it.each(['ready', 'forced', 'suspended'] as const)(
        'editing a %s task to the same state later records no event and changes nothing',
        (status) => {
            const sim = make([task('1', { duration: 10, period: 20 })]);
            if (status !== 'ready') edit(sim, status);
            advance(sim, 1);
            const before = sim.getCurrentSnapshot();
            edit(sim, status);
            expect(stateEvents(sim)).toEqual([]);
            expect(sim.getCurrentSnapshot()).toEqual(before);
        },
    );

    it('editing a concluded task to concluded again records nothing', () => {
        const sim = make([task(), keepAlive()]);
        edit(sim, 'concluded');
        advance(sim, 1);
        const before = sim.getCurrentSnapshot();
        edit(sim, 'concluded');
        expect(sim.getCurrentSnapshot()).toEqual(before);
    });

    it('ready to forced records only forced, never a resumption', () => {
        const sim = make([task('1', { duration: 10, period: 20 })]);
        advance(sim, 1);
        edit(sim, 'forced');
        expect(stateEvents(sim)).toEqual([
            { kind: 'forced', time: 1, taskId: '1' },
        ]);
    });

    it('lists task events in task-list order, then CPU events (DEC-22, DEC-37)', () => {
        const sim = make(
            [
                task('1', { duration: 10, period: 20, deadline: 20 }),
                task('2', { duration: 10, period: 20, deadline: 20 }),
            ],
            { cpuCount: 1 },
        );
        advance(sim, 1);
        sim.edit([
            { kind: 'taskState', taskId: '2', state: 'suspended' },
            { kind: 'taskState', taskId: '1', state: 'forced' },
            { kind: 'cpuCount', cpuCount: 2 },
        ]);
        const order = at(sim)
            .filter((event) =>
                ['suspension', 'forced', 'cpu-added'].includes(event.kind),
            )
            .map((event) => [
                event.kind,
                'taskId' in event
                    ? event.taskId
                    : 'cpuId' in event
                      ? event.cpuId
                      : -1,
            ]);
        expect(order).toEqual([
            ['forced', '1'],
            ['suspension', '2'],
            ['cpu-added', 2],
        ]);
    });

    it('reports in suspension.cpuId the CPU that ran the job even when it just completed', () => {
        const sim = make([task('1', { duration: 2, period: 5, deadline: 5 })]);
        advance(sim, 2);
        edit(sim, 'suspended');
        expect(stateEvents(sim)).toEqual([
            { kind: 'suspension', time: 2, taskId: '1', cpuId: 1 },
        ]);
    });
});

describe('review follow-ups: refusals through the simulator', () => {
    it('refuses leaving the concluded state and keeps the step and its edits', () => {
        const sim = make([task(), keepAlive()]);
        edit(sim, 'concluded');
        advance(sim, 1);
        const current = sim.getCurrentSnapshot();
        const edits = sim.getEdits(1);
        expect(() =>
            sim.edit([{ kind: 'taskState', taskId: '1', state: 'ready' }]),
        ).toThrow('A tarefa 1 está concluída e não pode mudar de estado.');
        expect(sim.getCurrentSnapshot()).toEqual(current);
        expect(sim.getEdits(1)).toEqual(edits);
    });

    it.each(['ready', 'suspended'] as const)(
        'refuses forcing a task that already finished while it is %s',
        (status) => {
            const sim = make([task('1', { period: 0, duration: 1 })]);
            advance(sim, 1);
            if (status === 'suspended') edit(sim, 'suspended');
            const current = sim.getCurrentSnapshot();
            expect(() =>
                sim.edit([{ kind: 'taskState', taskId: '1', state: 'forced' }]),
            ).toThrow('A tarefa 1 já terminou e não pode ser forçada.');
            expect(sim.getCurrentSnapshot()).toEqual(current);
        },
    );

    it('still allows forcing a periodic task between jobs', () => {
        const sim = make([task('1', { duration: 1, period: 5, deadline: 5 })]);
        advance(sim, 2);
        edit(sim, 'forced');
        expect(sim.getCurrentSnapshot().tasks[0].status).toBe('forced');
    });
});

describe('forced limit ignores finished tasks', () => {
    const finishedForced = () => {
        const sim = make(
            [
                task('1', { period: 0, duration: 1 }),
                task('2', { duration: 10, period: 20, deadline: 20 }),
            ],
            { cpuCount: 1 },
        );
        edit(sim, 'forced', '1');
        advance(sim, 1);
        expect(sim.getCurrentSnapshot().tasks[0].status).toBe('forced');
        return sim;
    };

    it('lets another task be forced once the forced one has finished', () => {
        const sim = finishedForced();
        edit(sim, 'forced', '2');
        expect(sim.getCurrentSnapshot().cpus[0].running?.taskId).toBe('2');
    });

    it('lets the CPU count drop below the forced tasks when some have finished', () => {
        const sim = make(
            [
                task('1', { period: 0, duration: 1 }),
                task('2', { duration: 10, period: 20, deadline: 20 }),
            ],
            { cpuCount: 2 },
        );
        edit(sim, 'forced', '1');
        edit(sim, 'forced', '2');
        advance(sim, 1);
        sim.edit([{ kind: 'cpuCount', cpuCount: 1 }]);
        expect(sim.getCurrentSnapshot().config.cpuCount).toBe(1);
    });

    it('still refuses forcing beyond the CPUs while the forced task is unfinished', () => {
        const sim = make(
            [
                task('1', { duration: 10, period: 20, deadline: 20 }),
                task('2', { duration: 10, period: 20, deadline: 20 }),
            ],
            { cpuCount: 1 },
        );
        edit(sim, 'forced', '1');
        expect(() =>
            sim.edit([{ kind: 'taskState', taskId: '2', state: 'forced' }]),
        ).toThrow('Não há CPUs para forçar a tarefa 2');
    });
});
