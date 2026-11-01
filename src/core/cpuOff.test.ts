import { describe, expect, it } from 'vitest';
import { findInconsistencies } from './consistency';
import { CpuEventSequenceError, summarizeCpuOff } from './cpuOff';
import {
    DEFAULT_CONFIG,
    type SimulationSnapshot,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import type { SchedulingPolicy } from './policy';
import { Simulator } from './simulator';
import { createInitialState } from './snapshot';

const aperiodic: Omit<TaskDefinition, 'id' | 'color' | 'arrival' | 'duration'> =
    { period: 0, deadline: 10, rawEvents: '' };

const firstAvailable: SchedulingPolicy = {
    select: (view) => ({
        selected: view.candidates
            .slice(0, view.cpuCount)
            .map(({ job }) => ({ taskId: job.taskId, index: job.index })),
    }),
};

/** Runs `steps` ticks and returns snapshots 0..steps, each checked for consistency. */
function runSnapshots(
    config: SystemConfig,
    steps: number,
): SimulationSnapshot[] {
    const sim = new Simulator(config, firstAvailable);
    const snapshots = [sim.getLatestSnapshot()];
    expect(findInconsistencies(snapshots[0])).toEqual([]);
    for (let step = 0; step < steps; step++) {
        sim.tick();
        const snapshot = sim.getLatestSnapshot();
        expect(findInconsistencies(snapshot)).toEqual([]);
        snapshots.push(snapshot);
    }
    return snapshots;
}

describe('summarizeCpuOff (DEC-21)', () => {
    it('keeps a CPU that never turns on in one open interval since tick 0', () => {
        const snapshots = runSnapshots(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    {
                        ...aperiodic,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 0,
                        duration: 3,
                    },
                ],
            },
            5,
        );

        for (const snapshot of snapshots) {
            expect(summarizeCpuOff(snapshot)[1]).toEqual({
                cpuId: 2,
                intervals: [{ start: 0, end: null }],
                totalOff: snapshot.clock,
            });
        }
    });

    it('reports no interval while a CPU has always had work', () => {
        const snapshots = runSnapshots(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...aperiodic,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 0,
                        duration: 3,
                    },
                ],
            },
            2,
        );

        for (const snapshot of snapshots) {
            expect(summarizeCpuOff(snapshot)).toEqual([
                { cpuId: 1, intervals: [], totalOff: 0 },
            ]);
        }
    });

    it('closes and reopens intervals as a CPU turns off and on several times', () => {
        const snapshots = runSnapshots(
            {
                ...DEFAULT_CONFIG,
                tasks: [
                    {
                        ...aperiodic,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 2,
                        duration: 1,
                    },
                    {
                        ...aperiodic,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 5,
                        duration: 1,
                    },
                ],
            },
            8,
        );

        const expected = [
            { clock: 0, intervals: [{ start: 0, end: null }], totalOff: 0 },
            { clock: 1, intervals: [{ start: 0, end: null }], totalOff: 1 },
            { clock: 2, intervals: [{ start: 0, end: 2 }], totalOff: 2 },
            {
                clock: 3,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: null },
                ],
                totalOff: 2,
            },
            {
                clock: 4,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: null },
                ],
                totalOff: 3,
            },
            {
                clock: 5,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: 5 },
                ],
                totalOff: 4,
            },
            {
                clock: 6,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: 5 },
                    { start: 6, end: null },
                ],
                totalOff: 4,
            },
            {
                clock: 8,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 3, end: 5 },
                    { start: 6, end: null },
                ],
                totalOff: 6,
            },
        ];
        // Earlier snapshots are queried after later ticks: the result depends
        // only on the snapshot passed in.
        for (const { clock, intervals, totalOff } of expected) {
            expect(summarizeCpuOff(snapshots[clock])).toEqual([
                { cpuId: 1, intervals, totalOff },
            ]);
        }
    });

    it('keeps the last interval open when a CPU stays off after all tasks finish', () => {
        const snapshots = runSnapshots(
            {
                ...DEFAULT_CONFIG,
                cpuCount: 2,
                tasks: [
                    {
                        ...aperiodic,
                        id: 1,
                        color: 'F0E0D0',
                        arrival: 0,
                        duration: 2,
                    },
                    {
                        ...aperiodic,
                        id: 2,
                        color: 'AABBCC',
                        arrival: 0,
                        duration: 3,
                    },
                ],
            },
            10,
        );

        const last = snapshots[10];
        expect(
            last.events.filter((event) => event.kind === 'task-finished'),
        ).toHaveLength(2);
        expect(summarizeCpuOff(last)).toEqual([
            { cpuId: 1, intervals: [{ start: 2, end: null }], totalOff: 8 },
            { cpuId: 2, intervals: [{ start: 3, end: null }], totalOff: 7 },
        ]);
    });

    describe('malformed event sequences', () => {
        /** Two CPUs at clock 5, so events up to tick 5 are not in the future. */
        function idleState() {
            const state = createInitialState({
                ...DEFAULT_CONFIG,
                cpuCount: 2,
            });
            state.clock = 5;
            return state;
        }

        /** The error `summarizeCpuOff` throws, so its class can be checked. */
        function thrownBy(state: ReturnType<typeof idleState>): unknown {
            try {
                summarizeCpuOff(state);
            } catch (error) {
                return error;
            }
            return undefined;
        }

        it('rejects turning on a CPU that is not off', () => {
            const state = idleState();
            state.events.push({ kind: 'cpu-on', time: 1, cpuId: 1 });

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /CPU 1 turned on at 1 while not off/,
            );
        });

        it('rejects turning off a CPU that is already off', () => {
            const state = idleState();
            state.events.push(
                { kind: 'cpu-off', time: 0, cpuId: 2 },
                { kind: 'cpu-off', time: 1, cpuId: 2 },
            );

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /CPU 2 turned off at 1 while already off/,
            );
        });

        it('rejects an event for a CPU that does not exist', () => {
            const state = idleState();
            state.events.push({ kind: 'cpu-off', time: 0, cpuId: 3 });

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /names CPU 3, which does not exist/,
            );
        });

        it('rejects turning on a CPU before it turned off', () => {
            const state = idleState();
            state.events.push(
                { kind: 'cpu-off', time: 3, cpuId: 1 },
                { kind: 'cpu-on', time: 2, cpuId: 1 },
            );

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /CPU 1 turned on at 2, before it turned off at 3/,
            );
        });

        it('rejects turning off a CPU before it last turned on', () => {
            const state = idleState();
            state.events.push(
                { kind: 'cpu-off', time: 0, cpuId: 2 },
                { kind: 'cpu-on', time: 4, cpuId: 2 },
                { kind: 'cpu-off', time: 3, cpuId: 2 },
            );

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /CPU 2 turned off at 3, before it turned on at 4/,
            );
        });

        it('rejects an event after the snapshot clock', () => {
            const state = idleState();
            state.events.push({ kind: 'cpu-off', time: 6, cpuId: 1 });

            expect(thrownBy(state)).toBeInstanceOf(CpuEventSequenceError);
            expect(() => summarizeCpuOff(state)).toThrow(
                /cpu-off at 6 .* after the snapshot clock 5/,
            );
        });

        it('accepts turning on in the same tick it turned off', () => {
            const state = idleState();
            state.events.push(
                { kind: 'cpu-off', time: 2, cpuId: 1 },
                { kind: 'cpu-on', time: 2, cpuId: 1 },
            );

            expect(summarizeCpuOff(state)[0]).toEqual({
                cpuId: 1,
                intervals: [{ start: 2, end: 2 }],
                totalOff: 0,
            });
        });
    });
});

describe('CPU existence intervals (DEC-37)', () => {
    const stateAt = (clock = 7) => {
        const state = createInitialState({ ...DEFAULT_CONFIG, cpuCount: 2 });
        state.clock = clock;
        return state;
    };

    it('closes off time on removal and excludes absence on ID reuse', () => {
        const state = stateAt();
        state.events.push(
            { kind: 'cpu-off', time: 0, cpuId: 2 },
            { kind: 'cpu-removed', time: 2, cpuId: 2 },
            { kind: 'cpu-added', time: 5, cpuId: 2 },
            { kind: 'cpu-off', time: 5, cpuId: 2 },
        );
        expect(summarizeCpuOff(state)).toEqual([
            { cpuId: 1, intervals: [], totalOff: 0 },
            {
                cpuId: 2,
                intervals: [
                    { start: 0, end: 2 },
                    { start: 5, end: null },
                ],
                totalOff: 4,
            },
        ]);
    });

    it('keeps a removed CPU as it was while absent', () => {
        const state = stateAt(4);
        state.config = { ...state.config, cpuCount: 1 };
        state.cpus.pop();
        state.events.push(
            { kind: 'cpu-off', time: 0, cpuId: 2 },
            { kind: 'cpu-removed', time: 2, cpuId: 2 },
        );
        expect(summarizeCpuOff(state)[1]).toEqual({
            cpuId: 2,
            intervals: [{ start: 0, end: 2 }],
            totalOff: 2,
        });
    });

    it('keeps removed CPUs that never went off, including removal at zero', () => {
        const state = stateAt(0);
        state.cpus.pop();
        state.config = { ...state.config, cpuCount: 1 };
        state.events.push({ kind: 'cpu-removed', time: 0, cpuId: 2 });
        expect(summarizeCpuOff(state)[1]).toEqual({
            cpuId: 2,
            intervals: [],
            totalOff: 0,
        });
    });

    it('starts added CPUs at their addition, across multiple existence periods', () => {
        const state = stateAt(9);
        state.events.push(
            { kind: 'cpu-added', time: 2, cpuId: 2 },
            { kind: 'cpu-removed', time: 3, cpuId: 2 },
            { kind: 'cpu-added', time: 5, cpuId: 2 },
            { kind: 'cpu-off', time: 5, cpuId: 2 },
            { kind: 'cpu-removed', time: 6, cpuId: 2 },
            { kind: 'cpu-added', time: 8, cpuId: 2 },
            { kind: 'cpu-off', time: 8, cpuId: 2 },
        );
        expect(summarizeCpuOff(state)[1]).toEqual({
            cpuId: 2,
            intervals: [
                { start: 5, end: 6 },
                { start: 8, end: null },
            ],
            totalOff: 2,
        });
    });

    it('gives an added CPU no intervals until it goes off', () => {
        const state = stateAt(9);
        state.events.push({ kind: 'cpu-added', time: 2, cpuId: 2 });
        expect(summarizeCpuOff(state)[1]).toEqual({
            cpuId: 2,
            intervals: [],
            totalOff: 0,
        });
    });

    it.each(['cpu-off', 'cpu-on'] as const)(
        'rejects %s while the CPU is absent',
        (kind) => {
            const state = stateAt();
            state.events.push(
                { kind: 'cpu-removed', time: 2, cpuId: 2 },
                { kind, time: 3, cpuId: 2 },
                { kind: 'cpu-added', time: 5, cpuId: 2 },
            );
            expect(() => summarizeCpuOff(state)).toThrow(CpuEventSequenceError);
        },
    );

    it.each([
        [
            { kind: 'cpu-added', time: 2, cpuId: 2 },
            { kind: 'cpu-added', time: 3, cpuId: 2 },
        ],
        [
            { kind: 'cpu-removed', time: 2, cpuId: 2 },
            { kind: 'cpu-removed', time: 3, cpuId: 2 },
        ],
        [{ kind: 'cpu-added', time: 8, cpuId: 2 }],
        [
            { kind: 'cpu-added', time: 3, cpuId: 2 },
            { kind: 'cpu-removed', time: 2, cpuId: 2 },
        ],
    ] as const)('rejects malformed existence sequence %#', (...events) => {
        const state = stateAt();
        state.events.push(...events);
        expect(() => summarizeCpuOff(state)).toThrow(CpuEventSequenceError);
    });

    it('reports an addition for a CPU that is not in the final CPUs', () => {
        const state = stateAt();
        state.events.push({ kind: 'cpu-added', time: 3, cpuId: 3 });
        expect(() => summarizeCpuOff(state)).toThrow(
            'CPU 3 has an unmatched addition at 3.',
        );
    });

    it('reports a removal for a CPU that is still in the final CPUs', () => {
        const state = stateAt();
        state.events.push({ kind: 'cpu-removed', time: 2, cpuId: 1 });
        expect(() => summarizeCpuOff(state)).toThrow(
            'CPU 1 has an unmatched removal at 2.',
        );
    });

    it('rejects an existence event after the snapshot clock', () => {
        const state = stateAt(7);
        state.events.push({ kind: 'cpu-added', time: 8, cpuId: 2 });
        expect(() => summarizeCpuOff(state)).toThrow(
            /is after the snapshot clock 7/,
        );
    });

    it.each([-1, Number.NaN, 1.5])(
        'rejects an existence event at invalid time %s',
        (time) => {
            const state = stateAt();
            state.config = { ...state.config, cpuCount: 1 };
            state.cpus.pop();
            state.events.push({ kind: 'cpu-removed', time, cpuId: 2 });
            expect(() => summarizeCpuOff(state)).toThrow(/has an invalid time/);
        },
    );

    it('keeps a removal and a re-addition in the same tick apart', () => {
        const state = stateAt(5);
        state.events.push(
            { kind: 'cpu-off', time: 1, cpuId: 2 },
            { kind: 'cpu-removed', time: 3, cpuId: 2 },
            { kind: 'cpu-added', time: 3, cpuId: 2 },
        );
        expect(summarizeCpuOff(state)[1]).toEqual({
            cpuId: 2,
            intervals: [{ start: 1, end: 3 }],
            totalOff: 2,
        });
    });
});
