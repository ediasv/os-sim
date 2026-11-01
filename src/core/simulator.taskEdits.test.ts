import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import { createSimulator } from './createSimulator';
import { findInconsistencies } from './consistency';
import { EditRefusal } from './refusal';

const task = (
    id = 1,
    changes: Partial<TaskDefinition> = {},
): TaskDefinition => ({
    id,
    color: id === 1 ? '112233' : '445566',
    arrival: 0,
    duration: 5,
    period: 2,
    deadline: 3,
    rawEvents: '',
    ...changes,
});
const make = () => createSimulator({ ...DEFAULT_CONFIG, tasks: [task()] });

describe('task color edit in the engine', () => {
    it('replaces the definition without events or mutation of earlier snapshots', () => {
        const sim = make();
        sim.tick();
        const before = sim.getCurrentSnapshot();
        const eventCount = before.events.length;
        sim.edit([{ kind: 'taskColor', taskId: 1, color: 'aabbcc' }]);
        const after = sim.getCurrentSnapshot();
        expect(after.tasks[0].definition.color).toBe('AABBCC');
        expect(after.events).toHaveLength(eventCount);
        expect(findInconsistencies(after)).toEqual([]);
        expect(before.tasks[0].definition.color).toBe('112233');
    });
    it('leaves the definition untouched when the color returns to the original', () => {
        const sim = make();
        const original = sim.getCurrentSnapshot().tasks[0].definition;
        sim.edit([
            { kind: 'taskColor', taskId: 1, color: 'aabbcc' },
            { kind: 'taskColor', taskId: 1, color: '112233' },
        ]);
        expect(sim.getCurrentSnapshot().tasks[0].definition).toEqual(original);
    });
});

describe('task duration and deadline edit in the engine', () => {
    it('keeps the duration of a job already activated', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { period: 20, deadline: 30 })],
        });
        sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 2 }]);
        // The lowered duration (2) would be reached at clock 2; a job judged
        // by the definition would complete there, but it keeps its own 5.
        for (let step = 0; step < 2; step++) sim.tick();
        const midway = sim.getCurrentSnapshot().tasks[0].jobs[0];
        expect(midway.executed).toBe(3);
        expect(midway.state).not.toBe('completed');
        expect(midway.completedAt).toBeNull();
        for (let step = 0; step < 3; step++) sim.tick();
        const snapshot = sim.getCurrentSnapshot();
        const job = snapshot.tasks[0].jobs[0];
        expect(job.duration).toBe(5);
        expect(job.completedAt).toBe(5);
        expect(snapshot.tasks[0].definition.duration).toBe(2);
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('does not complete a job early when the duration is raised', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { duration: 2, period: 20, deadline: 30 })],
        });
        sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 5 }]);
        for (let step = 0; step < 2; step++) sim.tick();
        const job = sim.getCurrentSnapshot().tasks[0].jobs[0];
        expect(job.duration).toBe(2);
        expect(job.completedAt).toBe(2);
    });
    it('gives the new duration only to later jobs', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { period: 4, deadline: 4, duration: 1 })],
        });
        sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 3 }]);
        for (let step = 0; step < 5; step++) sim.tick();
        const { jobs } = sim.getCurrentSnapshot().tasks[0];
        expect(jobs.map((job) => job.duration)).toEqual([1, 3]);
    });
    it('keeps the absolute deadline of jobs already activated', () => {
        const sim = make();
        sim.tick();
        sim.edit([{ kind: 'taskDeadline', taskId: 1, deadline: 10 }]);
        for (let step = 0; step < 3; step++) sim.tick();
        const snapshot = sim.getCurrentSnapshot();
        const { jobs } = snapshot.tasks[0];
        expect(jobs[0].absoluteDeadline).toBe(3);
        expect(jobs[0].deadlineMissed).toBe(true);
        expect(jobs[1].activation).toBe(2);
        expect(jobs[1].absoluteDeadline).toBe(12);
        expect(
            snapshot.events.filter((event) => event.kind === 'deadline-miss'),
        ).toMatchObject([{ time: 3, job: { taskId: 1, index: 0 } }]);
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('records no event for the edit', () => {
        const sim = make();
        sim.tick();
        const count = sim.getCurrentSnapshot().events.length;
        sim.edit([
            { kind: 'taskDuration', taskId: 1, duration: 2 },
            { kind: 'taskDeadline', taskId: 1, deadline: 9 },
        ]);
        expect(sim.getCurrentSnapshot().events).toHaveLength(count);
    });
});

describe('task arrival edit in the engine', () => {
    const later = () =>
        createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { arrival: 5, period: 20, deadline: 30 })],
        });
    const activations = (sim: ReturnType<typeof later>) =>
        sim
            .getCurrentSnapshot()
            .events.filter((event) => event.kind === 'activation');

    it('moves the first activation later', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 8 }]);
        while (sim.getCurrentSnapshot().clock < 9) sim.tick();
        expect(activations(sim)).toMatchObject([{ time: 8 }]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs[0].activation).toBe(8);
    });
    it('activates and dispatches in the same tick when moved to the clock', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 2 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(activations(sim)).toMatchObject([{ time: 2 }]);
        expect(snapshot.tasks[0].jobs).toHaveLength(1);
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('activates and dispatches at tick 0', () => {
        const sim = later();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 0 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(activations(sim)).toMatchObject([{ time: 0 }]);
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(findInconsistencies(snapshot)).toEqual([]);
    });
    it('refuses an arrival before the clock', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 1 }]),
        ).toThrow(/maior ou igual ao tick atual \(2\)/);
    });
    it('refuses after the first activation, even at the arrival tick', () => {
        const sim = make();
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 0 }]),
        ).toThrow(
            'O ingresso não pode ser alterado pois a tarefa já ingressou.',
        );
    });
    it('gives a suspended task its job without CPU', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        sim.edit([
            { kind: 'taskState', taskId: 1, state: 'suspended' },
            { kind: 'taskArrival', taskId: 1, arrival: 2 },
        ]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.tasks[0].status).toBe('suspended');
        expect(snapshot.tasks[0].jobs).toHaveLength(1);
        expect(snapshot.cpus[0].running).toBeNull();
        expect(
            snapshot.events
                .filter((event) => event.time === 2)
                .map((event) => event.kind),
        ).toEqual(['suspension', 'activation']);
    });
    it('leaves no trace when the arrival returns to the original', () => {
        const sim = later();
        sim.tick();
        sim.tick();
        const count = sim.getCurrentSnapshot().events.length;
        sim.edit([
            { kind: 'taskArrival', taskId: 1, arrival: 8 },
            { kind: 'taskArrival', taskId: 1, arrival: 5 },
        ]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.events).toHaveLength(count);
        expect(snapshot.tasks[0].jobs).toEqual([]);
        while (sim.getCurrentSnapshot().clock < 6) sim.tick();
        expect(activations(sim)).toMatchObject([{ time: 5 }]);
    });
});

describe('task period edit in the engine', () => {
    const periodic = (changes: Partial<TaskDefinition> = {}) =>
        createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [
                task(1, { period: 5, deadline: 5, duration: 1, ...changes }),
            ],
        });
    const advanceTo = (
        sim: Pick<ReturnType<typeof periodic>, 'tick' | 'getCurrentSnapshot'>,
        clock: number,
    ) => {
        while (sim.getCurrentSnapshot().clock < clock) {
            sim.tick();
            expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
        }
    };
    const activationTimes = (sim: ReturnType<typeof periodic>) =>
        sim
            .getCurrentSnapshot()
            .events.filter((event) => event.kind === 'activation')
            .map((event) => event.time);

    it('pushes the next activation to the last one plus the new period (DEC-37)', () => {
        const sim = periodic();
        advanceTo(sim, 13);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 8 }]);
        expect(sim.getCurrentSnapshot().tasks[0].nextActivation).toBe(18);
        advanceTo(sim, 20);
        expect(activationTimes(sim)).toEqual([0, 5, 10, 18]);
    });
    it('activates at the edit tick when the new period is overdue, then every period', () => {
        const sim = periodic();
        advanceTo(sim, 13);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 2 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(
            snapshot.events.filter(
                (event) => event.kind === 'activation' && event.time === 13,
            ),
        ).toMatchObject([{ kind: 'activation', job: { taskId: 1, index: 3 } }]);
        expect(snapshot.tasks[0].nextActivation).toBe(15);
        advanceTo(sim, 18);
        expect(activationTimes(sim)).toEqual([0, 5, 10, 13, 15, 17]);
    });
    it('leaves no trace when the period returns to the original in the same tick', () => {
        const sim = periodic();
        advanceTo(sim, 13);
        const before = sim.getCurrentSnapshot();
        sim.edit([
            { kind: 'taskPeriod', taskId: 1, period: 8 },
            { kind: 'taskPeriod', taskId: 1, period: 5 },
        ]);
        const after = sim.getCurrentSnapshot();
        expect(after.events).toHaveLength(before.events.length);
        expect(after.tasks[0].nextActivation).toBe(15);
        expect(after.tasks[0].jobs).toHaveLength(3);
    });
    it('keeps the arrival as the first activation, then ten at the new period', () => {
        const sim = periodic({ arrival: 4, period: 3, deadline: 3 });
        advanceTo(sim, 2);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 6 }]);
        advanceTo(sim, 70);
        expect(activationTimes(sim)).toEqual([
            4, 10, 16, 22, 28, 34, 40, 46, 52, 58,
        ]);
        expect(sim.getCurrentSnapshot().tasks[0].nextActivation).toBeNull();
    });
    it('keeps the older incomplete job as the only eligible one (DEC-02)', () => {
        const sim = periodic({ duration: 20, deadline: 100 });
        advanceTo(sim, 13);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 2 }]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.tasks[0].jobs.at(-1)).toMatchObject({
            index: 3,
            activation: 13,
            state: 'ready',
        });
        expect(snapshot.cpus[0].running).toEqual({ taskId: 1, index: 0 });
        expect(findInconsistencies(snapshot)).toEqual([]);
    });

    describe('after the ten activations', () => {
        const overloaded = (algorithm: 'RM' | 'EDF') =>
            createSimulator({
                ...DEFAULT_CONFIG,
                algorithm,
                tasks: [
                    task(1, { period: 2, deadline: 100, duration: 5 }),
                    task(2, { period: 3, deadline: 90, duration: 3 }),
                ],
            });
        const running = (sim: ReturnType<typeof overloaded>) =>
            sim.getCurrentSnapshot().cpus[0].running?.taskId;

        it('accepts the edit, keeps nextActivation null and flips the RM winner at once', () => {
            const sim = overloaded('RM');
            advanceTo(sim, 30);
            expect(
                sim.getCurrentSnapshot().tasks.map((t) => t.nextActivation),
            ).toEqual([null, null]);
            expect(running(sim)).toBe(1);
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 5 }]);
            const snapshot = sim.getCurrentSnapshot();
            expect(snapshot.tasks[0].nextActivation).toBeNull();
            expect(snapshot.tasks[0].jobs).toHaveLength(10);
            expect(running(sim)).toBe(2);
            expect(findInconsistencies(snapshot)).toEqual([]);
        });
        it('does not change the EDF selection', () => {
            const sim = overloaded('EDF');
            advanceTo(sim, 30);
            const winner = running(sim);
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 5 }]);
            expect(running(sim)).toBe(winner);
        });
    });

    it('refuses zero, an invalid value and a concluded task', () => {
        const sim = periodic();
        expect(() =>
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 0 }]),
        ).toThrow(/Projeto B/);
        expect(() =>
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 2.5 }]),
        ).toThrow(/número inteiro/);
        sim.edit([{ kind: 'taskState', taskId: 1, state: 'concluded' }]);
        expect(() =>
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 3 }]),
        ).toThrow(/concluída/);
    });
});

describe('characteristic edits together (DEC-37, DEC-39)', () => {
    const periodic = (
        tasks = [task(1, { period: 5, deadline: 5, duration: 1 })],
    ) => createSimulator({ ...DEFAULT_CONFIG, tasks });
    type Sim = ReturnType<typeof periodic>;
    const advanceTo = (sim: Sim, clock: number) => {
        while (sim.getCurrentSnapshot().clock < clock) {
            sim.tick();
            expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
        }
    };
    const activationsOf = (sim: Sim, taskId = 1) =>
        sim
            .getCurrentSnapshot()
            .events.filter(
                (event) =>
                    event.kind === 'activation' && event.job.taskId === taskId,
            )
            .map((event) => event.time);
    const kindsAt = (sim: Sim, time: number) =>
        sim
            .getCurrentSnapshot()
            .events.filter((event) => event.time === time)
            .map((event) => event.kind);
    /** Every recorded snapshot and edit list, serialized, leaving the cursor. */
    const everything = (sim: Sim) => {
        const cursor = sim.getCursor();
        const out = [];
        for (let step = 0; step <= sim.getLatestSnapshot().clock; step++) {
            sim.restore(step);
            out.push({
                snapshot: sim.getCurrentSnapshot(),
                edits: sim.getEdits(step),
            });
        }
        sim.restore(cursor);
        return JSON.stringify(out);
    };

    it('applies a multi-item edit in order and in one submission', () => {
        const sim = periodic();
        advanceTo(sim, 3);
        sim.edit([
            { kind: 'taskDuration', taskId: 1, duration: 3 },
            { kind: 'taskPeriod', taskId: 1, period: 8 },
            { kind: 'taskColor', taskId: 1, color: 'abcdef' },
        ]);
        const snapshot = sim.getCurrentSnapshot();
        expect(snapshot.tasks[0].definition).toMatchObject({
            duration: 3,
            period: 8,
            color: 'ABCDEF',
        });
        expect(snapshot.tasks[0].nextActivation).toBe(8);
        expect(sim.getEdits(3)).toHaveLength(1);
        expect(sim.getEdits(3)[0]).toHaveLength(3);
        expect(findInconsistencies(snapshot)).toEqual([]);
    });

    it('refuses the whole edit, with every reason, and changes nothing (atomicity)', () => {
        const sim = periodic();
        advanceTo(sim, 3);
        const before = everything(sim);
        const cursor = sim.getCursor();
        let message = '';
        try {
            sim.edit([
                { kind: 'taskColor', taskId: 1, color: 'abcdef' },
                { kind: 'taskPeriod', taskId: 1, period: 0 },
                { kind: 'taskDuration', taskId: 1, duration: 2 },
                { kind: 'taskDeadline', taskId: 1, deadline: 0 },
            ]);
        } catch (error) {
            expect(error).toBeInstanceOf(EditRefusal);
            message = (error as Error).message;
        }
        expect(message.split('\n')).toHaveLength(2);
        expect(message).toMatch(
            /^Item 2 \(taskPeriod\): .+\nItem 4 \(taskDeadline\): .+$/,
        );
        expect(sim.getCursor()).toBe(cursor);
        expect(everything(sim)).toBe(before);
    });

    it('lets a later item see the earlier ones (arrival moved, then period)', () => {
        const sim = periodic([
            task(1, { arrival: 5, period: 20, deadline: 20, duration: 1 }),
        ]);
        advanceTo(sim, 2);
        sim.edit([
            { kind: 'taskArrival', taskId: 1, arrival: 8 },
            { kind: 'taskPeriod', taskId: 1, period: 3 },
        ]);
        expect(sim.getCurrentSnapshot().tasks[0].nextActivation).toBe(8);
        advanceTo(sim, 15);
        expect(activationsOf(sim)).toEqual([8, 11, 14]);
    });

    it('judges a period item against an earlier conclusion in the same submission', () => {
        const sim = periodic();
        advanceTo(sim, 2);
        expect(() =>
            sim.edit([
                { kind: 'taskState', taskId: 1, state: 'concluded' },
                { kind: 'taskPeriod', taskId: 1, period: 3 },
            ]),
        ).toThrow(/Item 2 \(taskPeriod\): .*concluída/);
    });

    describe('after going back with restore', () => {
        const build = () => {
            const sim = periodic();
            advanceTo(sim, 3);
            sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 4 }]);
            advanceTo(sim, 8);
            return sim;
        };

        it('discards the future and keeps nextActivation and Job.duration of the restored step', () => {
            const sim = build();
            sim.restore(6);
            const restored = sim.getCurrentSnapshot();
            expect(restored.tasks[0].nextActivation).toBe(10);
            expect(restored.tasks[0].jobs.map((j) => j.duration)).toEqual([
                1, 4,
            ]);
            const earlier = [0, 1, 2, 3, 4, 5].map((step) => {
                sim.restore(step);
                return JSON.stringify(sim.getCurrentSnapshot());
            });
            sim.restore(6);
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 3 }]);

            expect(sim.getLatestSnapshot().clock).toBe(6);
            const after = sim.getCurrentSnapshot();
            expect(after.tasks[0].nextActivation).toBe(8);
            expect(after.tasks[0].jobs.map((j) => j.duration)).toEqual([1, 4]);
            expect(sim.getEdits(3)).toHaveLength(1);
            earlier.forEach((json, step) => {
                sim.restore(step);
                expect(JSON.stringify(sim.getCurrentSnapshot())).toBe(json);
            });
            sim.restore(6);
            advanceTo(sim, 10);
            expect(activationsOf(sim)).toEqual([0, 5, 8]);
            expect(
                sim.getCurrentSnapshot().tasks[0].jobs.map((j) => j.duration),
            ).toEqual([1, 4, 4]);
        });

        it('recalculates deterministically from t-1', () => {
            const run = () => {
                const sim = build();
                sim.restore(6);
                sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 3 }]);
                advanceTo(sim, 12);
                return sim;
            };
            const first = run();
            const second = run();
            expect(first.getCurrentSnapshot()).toEqual(
                second.getCurrentSnapshot(),
            );
            expect(everything(first)).toBe(everything(second));
        });
    });

    describe('with task-state edits in the same tick (DEC-37 order)', () => {
        const busy = (count = 1) =>
            periodic(
                Array.from({ length: count }, (_, i) =>
                    task(i + 1, { period: 5, deadline: 5, duration: 1 }),
                ),
            );

        it('suspension, then the edit activation, then CPU events', () => {
            const sim = busy();
            advanceTo(sim, 13);
            sim.edit([
                { kind: 'taskPeriod', taskId: 1, period: 2 },
                { kind: 'taskState', taskId: 1, state: 'suspended' },
                { kind: 'cpuCount', cpuCount: 2 },
            ]);
            const kinds = kindsAt(sim, 13);
            expect(kinds.filter((kind) => !kind.startsWith('cpu-'))).toEqual([
                'suspension',
                'activation',
            ]);
            expect(kinds.slice(0, 2)).toEqual(['suspension', 'activation']);
            expect(kinds.slice(2)).toContain('cpu-added');
            expect(kinds.slice(2).every((k) => k.startsWith('cpu-'))).toBe(
                true,
            );
            expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
        });

        it('conclusion cancels the activation the period edit would cause', () => {
            const sim = busy();
            advanceTo(sim, 13);
            sim.edit([
                { kind: 'taskPeriod', taskId: 1, period: 2 },
                { kind: 'taskState', taskId: 1, state: 'concluded' },
            ]);
            const snapshot = sim.getCurrentSnapshot();
            expect(activationsOf(sim)).toEqual([0, 5, 10]);
            expect(snapshot.tasks[0].jobs).toHaveLength(3);
            expect(snapshot.tasks[0].status).toBe('concluded');
            expect(findInconsistencies(snapshot)).toEqual([]);
        });

        it('conclusion after an arrival edit leaves no activation', () => {
            const sim = periodic([
                task(1, { arrival: 5, period: 20, deadline: 20 }),
            ]);
            advanceTo(sim, 2);
            sim.edit([
                { kind: 'taskArrival', taskId: 1, arrival: 2 },
                { kind: 'taskState', taskId: 1, state: 'concluded' },
            ]);
            const snapshot = sim.getCurrentSnapshot();
            expect(activationsOf(sim)).toEqual([]);
            expect(snapshot.tasks[0].jobs).toEqual([]);
            expect(snapshot.tasks[0].status).toBe('concluded');
            expect(findInconsistencies(snapshot)).toEqual([]);
        });

        it('orders events per task in list order, then CPU events', () => {
            const sim = busy(2);
            advanceTo(sim, 13);
            sim.edit([
                { kind: 'taskPeriod', taskId: 2, period: 2 },
                { kind: 'taskState', taskId: 2, state: 'suspended' },
                { kind: 'taskPeriod', taskId: 1, period: 2 },
                { kind: 'taskState', taskId: 1, state: 'forced' },
                { kind: 'cpuCount', cpuCount: 2 },
            ]);
            const order = sim
                .getCurrentSnapshot()
                .events.filter((event) => event.time === 13)
                .map((event) => [
                    event.kind,
                    'taskId' in event
                        ? event.taskId
                        : 'job' in event
                          ? event.job.taskId
                          : -1,
                ]);
            expect(order.slice(0, 4)).toEqual([
                ['forced', 1],
                ['activation', 1],
                ['suspension', 2],
                ['activation', 2],
            ]);
            expect(order.slice(4).map(([kind]) => kind)).toContain('cpu-added');
            expect(
                order.slice(4).every(([kind]) => `${kind}`.startsWith('cpu-')),
            ).toBe(true);
            expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
        });
    });
});

describe('edits to one task across submissions of the same tick (DEC-45)', () => {
    const arrivalSim = () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { arrival: 5, period: 20, deadline: 20 })],
        });
        for (let step = 0; step < 3; step++) sim.tick();
        return sim;
    };
    const periodSim = () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { duration: 1, period: 5, deadline: 20 })],
        });
        for (let step = 0; step < 7; step++) sim.tick();
        return sim;
    };

    it('refuses to move the arrival of a job the earlier submission created', () => {
        const sim = arrivalSim();
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 3 }]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs).toHaveLength(1);
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 6 }]),
        ).toThrow(EditRefusal);
        const kept = sim.getCurrentSnapshot().tasks[0];
        expect(kept.jobs).toHaveLength(1);
        expect(kept.definition.arrival).toBe(3);
    });

    it('refuses a duration that would change a job the earlier submission created', () => {
        const sim = periodSim();
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 1 }]);
        expect(() =>
            sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 3 }]),
        ).toThrow(EditRefusal);
        expect(
            sim.getCurrentSnapshot().tasks[0].jobs.map((j) => j.duration),
        ).toEqual([1, 1, 1]);
    });

    it('refuses a deadline or a different period after such a job, but accepts equal values and colors', () => {
        const sim = periodSim();
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 1 }]);
        expect(() =>
            sim.edit([{ kind: 'taskDeadline', taskId: 1, deadline: 9 }]),
        ).toThrow(EditRefusal);
        expect(() =>
            sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 2 }]),
        ).toThrow(EditRefusal);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 1 }]);
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 1 }]);
        sim.edit([{ kind: 'taskColor', taskId: 1, color: 'aabbcc' }]);
        const task1 = sim.getCurrentSnapshot().tasks[0];
        expect(task1.definition.color).toBe('AABBCC');
        expect(task1.jobs.map((j) => j.duration)).toEqual([1, 1, 1]);
    });

    it('judges the third submission against the net of the first two', () => {
        const sim = periodSim();
        sim.edit([{ kind: 'taskColor', taskId: 1, color: 'aabbcc' }]);
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 1 }]);
        expect(() =>
            sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 3 }]),
        ).toThrow(EditRefusal);
    });

    it('applies the same rule at tick 0', () => {
        const sim = createSimulator({
            ...DEFAULT_CONFIG,
            tasks: [task(1, { arrival: 4, period: 20, deadline: 20 })],
        });
        sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 0 }]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs).toHaveLength(1);
        expect(() =>
            sim.edit([{ kind: 'taskArrival', taskId: 1, arrival: 6 }]),
        ).toThrow(EditRefusal);
    });

    it('keeps refusing after stepping back and forward and replaying the recorded edits', () => {
        const sim = periodSim();
        sim.edit([{ kind: 'taskPeriod', taskId: 1, period: 1 }]);
        sim.tick();
        sim.backward();
        expect(() =>
            sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 3 }]),
        ).toThrow(EditRefusal);
        sim.edit([{ kind: 'taskColor', taskId: 1, color: 'aabbcc' }]);
        expect(sim.getCurrentSnapshot().tasks[0].jobs).toHaveLength(3);
    });
});
