import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import {
    DEFAULT_CONFIG,
    type AlgorithmId,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { EditItem } from './edit';
import { DEFAULT_POLICIES, rmPolicy } from './policies';
import { EditRefusal, SimulationRefusal } from './refusal';
import { Simulator } from './simulator';

function task(
    id: number,
    color: string,
    fields: Pick<
        TaskDefinition,
        'arrival' | 'duration' | 'period' | 'deadline'
    >,
): TaskDefinition {
    return { id, color, rawEvents: '', ...fields };
}

function run(sim: Simulator, ticks: number): void {
    for (let i = 0; i < ticks; i++) sim.tick();
}

const q = (quantum: number): EditItem => ({ kind: 'quantum', quantum });
const alg = (algorithm: string): EditItem => ({
    kind: 'algorithm',
    algorithm: algorithm as AlgorithmId,
});

/** Edits and checks the state after the edit is consistent (DEC-12). */
function edit(sim: Simulator, items: readonly EditItem[]): void {
    sim.edit(items);
    expect(findInconsistencies(sim.getCurrentSnapshot())).toEqual([]);
}

function quantumExpiries(sim: Simulator): number[] {
    return sim
        .getCurrentSnapshot()
        .events.filter((event) => event.kind === 'quantum-expired')
        .map((event) => event.time);
}

/** Scenario Q: one long job on one CPU, so only the quantum shapes events. */
const quantumConfig = (quantum: number): SystemConfig => ({
    ...DEFAULT_CONFIG,
    cpuCount: 1,
    quantum,
    tasks: [
        task(1, 'F0E0D0', {
            arrival: 0,
            duration: 6,
            period: 20,
            deadline: 20,
        }),
    ],
});

/** Scenario A: RM runs task 2 (shorter period), EDF task 1 (earlier deadline). */
const algorithmConfig: SystemConfig = {
    ...DEFAULT_CONFIG,
    cpuCount: 1,
    quantum: 5,
    tasks: [
        task(1, 'F0E0D0', { arrival: 0, duration: 3, period: 10, deadline: 3 }),
        task(2, 'AABBCC', { arrival: 0, duration: 3, period: 5, deadline: 5 }),
    ],
};
const registry = { policies: DEFAULT_POLICIES };
const job = (taskId: number) => ({ taskId, index: 0 });

describe('Simulator.edit: quantum', () => {
    it('expires the running slice at t when the new quantum is already used up', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        run(sim, 2);
        edit(sim, [q(2)]);
        const at2 = sim.getCurrentSnapshot();
        expect(at2.clock).toBe(2);
        expect(at2.config.quantum).toBe(2);
        expect(at2.events).toContainEqual({
            kind: 'quantum-expired',
            time: 2,
            cpuId: 1,
            job: job(1),
        });
        expect(at2.cpus[0].sliceElapsed).toBe(0);
        expect(at2.cpus[0].running).toEqual(job(1));
        run(sim, 4);
        expect(quantumExpiries(sim)).toEqual([2, 4]);
        expect(sim.getCurrentSnapshot().events).toContainEqual({
            kind: 'completion',
            time: 6,
            job: job(1),
        });
    });

    it('avoids an expiry the old quantum would cause', () => {
        const sim = new Simulator(quantumConfig(2), rmPolicy);
        run(sim, 2);
        expect(quantumExpiries(sim)).toEqual([2]);
        edit(sim, [q(3)]);
        expect(quantumExpiries(sim)).toEqual([]);
        run(sim, 4);
        expect(quantumExpiries(sim)).toEqual([3]);
    });

    it("keeps the slice's consumption", () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        run(sim, 1);
        edit(sim, [q(3)]);
        expect(sim.getCurrentSnapshot().cpus[0].sliceElapsed).toBe(1);
        run(sim, 5);
        expect(quantumExpiries(sim)).toEqual([3]);
    });

    it('edits at tick 0 recompute from the initial state', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        edit(sim, [q(2)]);
        const fresh = new Simulator(quantumConfig(2), rmPolicy);
        expect(sim.getCurrentSnapshot()).toEqual(fresh.getCurrentSnapshot());
    });
});

describe('Simulator.edit: algorithm', () => {
    it('switches the algorithm already in the selection of t', () => {
        const sim = new Simulator(algorithmConfig, registry);
        run(sim, 1);
        edit(sim, [alg('EDF')]);
        const at1 = sim.getCurrentSnapshot();
        expect(at1.config.algorithm).toBe('EDF');
        expect(at1.cpus[0].running).toEqual(job(1));
        expect(at1.events).toContainEqual({
            kind: 'preemption',
            time: 1,
            cpuId: 1,
            preempted: job(2),
            by: job(1),
        });
        sim.backward();
        expect(sim.getCurrentSnapshot().config.algorithm).toBe('RM');
        sim.forward();
        sim.tick();
        expect(sim.getCurrentSnapshot().config.algorithm).toBe('EDF');
    });

    it('an algorithm edit at tick 0 equals starting with that algorithm', () => {
        const sim = new Simulator(algorithmConfig, registry);
        edit(sim, [alg('EDF')]);
        const fresh = new Simulator(
            { ...algorithmConfig, algorithm: 'EDF' },
            registry,
        );
        expect(sim.getCurrentSnapshot()).toEqual(fresh.getCurrentSnapshot());
    });

    it('a plain injected policy runs for any algorithm', () => {
        const sim = new Simulator(algorithmConfig, rmPolicy);
        edit(sim, [alg('EDF')]);
        expect(sim.getCurrentSnapshot().config.algorithm).toBe('EDF');
        expect(sim.getCurrentSnapshot().cpus[0].running).toEqual(job(2));
    });
});

describe('Simulator.edit: refusals and recorded edits', () => {
    it('refuses quantum below 1 and an algorithm without a policy with EditRefusal', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        let refusal: unknown;
        try {
            sim.edit([q(0)]);
        } catch (error) {
            refusal = error;
        }
        expect(refusal).toBeInstanceOf(EditRefusal);
        expect((refusal as EditRefusal).items[0].kind).toBe('quantum');

        const partial = new Simulator(algorithmConfig, {
            policies: { RM: rmPolicy },
        });
        try {
            partial.edit([alg('EDF')]);
        } catch (error) {
            refusal = error;
        }
        expect(refusal).toBeInstanceOf(EditRefusal);
        expect((refusal as EditRefusal).items[0].reason).toBe(
            'Nenhuma política de escalonamento está registrada para o algoritmo EDF.',
        );
    });

    it('refuses an empty edit', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        let refusal: unknown;
        try {
            sim.edit([]);
        } catch (error) {
            refusal = error;
        }
        expect(refusal).toBeInstanceOf(SimulationRefusal);
        expect(refusal).not.toBeInstanceOf(EditRefusal);
        expect((refusal as Error).message).toBe(
            'Uma edição precisa de pelo menos um item.',
        );
    });

    it("accumulates the tick's edits and records them", () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        run(sim, 2);
        edit(sim, [q(4)]);
        edit(sim, [q(2)]);
        expect(sim.getEdits(2)).toEqual([
            [{ kind: 'quantum', quantum: 4 }],
            [{ kind: 'quantum', quantum: 2 }],
        ]);
        const twin = new Simulator(quantumConfig(5), rmPolicy);
        run(twin, 2);
        edit(twin, [q(2)]);
        expect(sim.getCurrentSnapshot()).toEqual(twin.getCurrentSnapshot());
    });

    it('builds on the edits recorded at t-1', () => {
        const sim = new Simulator(algorithmConfig, registry);
        edit(sim, [q(2)]);
        sim.tick();
        edit(sim, [alg('EDF')]);
        expect(sim.getCurrentSnapshot().config).toMatchObject({
            algorithm: 'EDF',
            quantum: 2,
        });
    });

    it('edits a simulator with no tasks and no policy', () => {
        const sim = new Simulator();
        edit(sim, [q(3)]);
        edit(sim, [alg('EDF')]);
        expect(sim.getCurrentSnapshot().config).toMatchObject({
            algorithm: 'EDF',
            quantum: 3,
        });
    });

    it('tick after an edit uses the edited parameters and starts with no edits', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        run(sim, 2);
        edit(sim, [q(2)]);
        sim.tick();
        expect(sim.getEdits(3)).toEqual([]);
        expect(sim.getCurrentSnapshot().config.quantum).toBe(2);
    });

    it('stores a copy the caller cannot change', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        run(sim, 2);
        const item = { kind: 'quantum' as const, quantum: 2 };
        const items: EditItem[] = [item];
        edit(sim, items);
        item.quantum = 9;
        items.push(q(7));
        expect(sim.getEdits(2)).toEqual([[{ kind: 'quantum', quantum: 2 }]]);
        edit(sim, [alg('RM')]);
        expect(sim.getCurrentSnapshot().config.quantum).toBe(2);
    });

    it('getEdits refuses an unrecorded step', () => {
        const sim = new Simulator(quantumConfig(5), rmPolicy);
        expect(() => sim.getEdits(99)).toThrow(RangeError);
    });
});

// Residual ties at 0, 4 and 8, so the draw state changes along the run
// (same scenario as simulator.history.test.ts).
const tied = (id: number, color: string): TaskDefinition =>
    task(id, color, { arrival: 0, duration: 1, period: 4, deadline: 4 });
const tiedConfig: SystemConfig = {
    ...DEFAULT_CONFIG,
    cpuCount: 1,
    tasks: [tied(1, 'F0E0D0'), tied(2, 'AABBCC'), tied(3, '112233')],
};

/** Partial progress: slices, preemption, quantum expiry and deadline misses. */
const progress = (
    id: number,
    color: string,
    arrival: number,
    duration: number,
    period: number,
): TaskDefinition =>
    task(id, color, { arrival, duration, period, deadline: period });
const partialConfig: SystemConfig = {
    ...DEFAULT_CONFIG,
    quantum: 2,
    cpuCount: 2,
    tasks: [
        progress(1, 'F0E0D0', 0, 3, 5),
        progress(2, 'AABBCC', 0, 4, 6),
        progress(3, '112233', 1, 2, 4),
        progress(4, '445566', 0, 5, 6),
    ],
};

/** Everything a refused edit must leave alone, by identity and by value. */
function captureAll(sim: Simulator) {
    const history = sim['history'];
    const snapshots = [];
    for (let step = 0; step <= history.latestStep; step++) {
        snapshots.push(history.at(step));
    }
    return {
        cursor: sim.getCursor(),
        latest: history.latestStep,
        current: sim.getCurrentSnapshot(),
        snapshots,
        snapshotJson: JSON.stringify(snapshots),
        edits: JSON.stringify(snapshots.map((_, step) => sim.getEdits(step))),
        state: JSON.stringify(sim['state']),
    };
}

function expectUnchanged(
    sim: Simulator,
    before: ReturnType<typeof captureAll>,
): void {
    const after = captureAll(sim);
    expect(after.cursor).toBe(before.cursor);
    expect(after.latest).toBe(before.latest);
    expect(after.current).toBe(before.current);
    after.snapshots.forEach((snapshot, step) =>
        expect(snapshot).toBe(before.snapshots[step]),
    );
    expect(after.snapshotJson).toBe(before.snapshotJson);
    expect(after.edits).toBe(before.edits);
    expect(after.state).toBe(before.state);
}

describe('Simulator.edit: atomic refusal and net change', () => {
    it('a refused edit changes neither state, cursor nor history', () => {
        const sim = new Simulator(tiedConfig, { policies: { RM: rmPolicy } });
        run(sim, 8);
        sim.restore(4);
        sim.edit([q(3)]);
        sim.restore(4);
        const before = captureAll(sim);
        for (const items of [[q(0)], [alg('EDF')], [q(3), q(0)]]) {
            expect(() => sim.edit(items)).toThrow(EditRefusal);
            expectUnchanged(sim, before);
        }

        const twin = new Simulator(tiedConfig, { policies: { RM: rmPolicy } });
        run(twin, 4);
        twin.edit([q(3)]);
        sim.tick();
        twin.tick();
        expect(sim.getCurrentSnapshot()).toEqual(twin.getCurrentSnapshot());
    });

    it('a policy failure while recomputing changes nothing (DEC-14)', () => {
        let failNow = false;
        const failing = {
            select: (view: Parameters<typeof rmPolicy.select>[0]) => {
                if (failNow && view.clock === 3)
                    throw new Error('policy failure');
                return rmPolicy.select(view);
            },
        };
        const sim = new Simulator(partialConfig, failing);
        run(sim, 5);
        sim.restore(3);
        const before = captureAll(sim);
        failNow = true;
        let thrown: unknown;
        try {
            sim.edit([q(3)]);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(Error);
        expect(thrown).not.toBeInstanceOf(SimulationRefusal);
        expectUnchanged(sim, before);
    });

    it('repeating or undoing edits in a tick equals the net change, including the draw', () => {
        const unedited = new Simulator(tiedConfig, rmPolicy);
        run(unedited, 4);
        const recorded = unedited.getCurrentSnapshot();
        expect(
            recorded.events.some(
                (event) => event.kind === 'tie-break' && event.time === 4,
            ),
        ).toBe(true);

        const undone = new Simulator(tiedConfig, rmPolicy);
        run(undone, 4);
        edit(undone, [q(2)]);
        edit(undone, [q(5)]);
        // Deep equality: recomputing from a restored state may order keys
        // differently, which carries no meaning.
        expect(undone.getCurrentSnapshot()).toEqual(recorded);

        const inOneEdit = new Simulator(tiedConfig, rmPolicy);
        run(inOneEdit, 4);
        edit(inOneEdit, [q(3), q(5)]);
        expect(inOneEdit.getCurrentSnapshot()).toEqual(recorded);

        const repeated = new Simulator(tiedConfig, rmPolicy);
        run(repeated, 4);
        edit(repeated, [q(3)]);
        edit(repeated, [q(4)]);
        const once = new Simulator(tiedConfig, rmPolicy);
        run(once, 4);
        edit(once, [q(4)]);
        expect(repeated.getCurrentSnapshot()).toEqual(
            once.getCurrentSnapshot(),
        );

        unedited.tick();
        for (const sim of [undone, inOneEdit]) {
            sim.tick();
            expect(sim.getCurrentSnapshot()).toEqual(
                unedited.getCurrentSnapshot(),
            );
        }
    });
});

describe('Simulator.edit: editing the past', () => {
    /** Run 10, edit at 10, run to 15, go back to 8 and edit there. */
    function editedInThePast() {
        const sim = new Simulator(partialConfig, rmPolicy);
        run(sim, 10);
        edit(sim, [q(1)]);
        run(sim, 5);
        sim.restore(8);
        const recorded = [];
        for (let step = 0; step <= 8; step++) {
            recorded.push(sim['history'].at(step));
        }
        const copies = JSON.parse(JSON.stringify(recorded));
        edit(sim, [q(3)]);
        return { sim, recorded, copies };
    }

    it('an edit before the latest step discards later steps and their edits', () => {
        const { sim } = editedInThePast();
        expect(sim.getLatestSnapshot().clock).toBe(8);
        expect(sim.getCursor()).toBe(8);
        expect(sim.canForward()).toBe(false);
        expect(() => sim.restore(9)).toThrow(RangeError);
        expect(() => sim.getEdits(9)).toThrow(RangeError);
        expect(sim.getEdits(8)).toEqual([[{ kind: 'quantum', quantum: 3 }]]);
        sim.tick();
        sim.tick();
        expect(sim.getEdits(10)).toEqual([]);
        expect(sim.getCurrentSnapshot().config.quantum).toBe(3);
    });

    it('going back after a past edit shows the history up to the edit unchanged', () => {
        const { sim, recorded, copies } = editedInThePast();
        for (let step = 7; step >= 0; step--) {
            sim.backward();
            expect(sim.getCurrentSnapshot()).toBe(recorded[step]);
            expect(sim.getCurrentSnapshot()).toEqual(copies[step]);
        }
    });

    it('the recomputed future equals a run edited there directly', () => {
        const { sim: a } = editedInThePast();
        run(a, 4);
        const b = new Simulator(partialConfig, rmPolicy);
        run(b, 8);
        edit(b, [q(3)]);
        run(b, 4);
        expect(a.getLatestSnapshot()).toEqual(b.getLatestSnapshot());
    });

    it('an accepted no-op edit on a past tick still discards the future', () => {
        const sim = new Simulator(tiedConfig, rmPolicy);
        run(sim, 10);
        sim.restore(3);
        const copy = JSON.parse(JSON.stringify(sim.getCurrentSnapshot()));
        edit(sim, [q(5)]);
        expect(sim.getLatestSnapshot().clock).toBe(3);
        expect(sim.canForward()).toBe(false);
        expect(sim.getCurrentSnapshot()).toEqual(copy);
    });
});
