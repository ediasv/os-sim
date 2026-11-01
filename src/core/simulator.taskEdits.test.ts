import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';
import { createSimulator } from './createSimulator';
import { findInconsistencies } from './consistency';

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
        for (let step = 0; step < 4; step++) sim.tick();
        sim.edit([{ kind: 'taskDuration', taskId: 1, duration: 2 }]);
        for (let step = 0; step < 3; step++) sim.tick();
        const snapshot = sim.getCurrentSnapshot();
        const job = snapshot.tasks[0].jobs[0];
        expect(job.duration).toBe(5);
        expect(job.completedAt).toBe(5);
        expect(snapshot.tasks[0].definition.duration).toBe(2);
        expect(findInconsistencies(snapshot)).toEqual([]);
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
