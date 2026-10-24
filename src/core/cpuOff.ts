/**
 * Periods in which each CPU was logically off (A.1.2, DEC-05), derived from
 * the `cpu-off`/`cpu-on` events of a snapshot instead of being stored
 * (DEC-21). Inspection (#37) and the Gantt (#38) are meant to read them from
 * any snapshot.
 */
import type { DeepReadonly, SimulationState } from './domain';

/**
 * A `cpu-off`/`cpu-on` history that cannot be turned into intervals. Its own
 * class lets `findInconsistencies` and the interface tell a malformed history
 * apart from a programming error.
 */
export class CpuEventSequenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CpuEventSequenceError';
    }
}

/** CPU off during [start, end); `end` is null while it is still off at the snapshot. */
export interface CpuOffInterval {
    readonly start: number;
    readonly end: number | null;
}

export interface CpuOffSummary {
    readonly cpuId: number;
    readonly intervals: readonly CpuOffInterval[];
    /**
     * Off ticks elapsed up to the snapshot clock; an open interval counts
     * `clock - start`, like `executions` holds only ticks already run.
     */
    readonly totalOff: number;
}

/**
 * Lists every off interval and the total per CPU, in `cpus` order, including
 * CPUs that were never off. Throws `CpuEventSequenceError` when the events of a
 * CPU do not alternate off/on, go back in time, come after the snapshot clock,
 * or name an unknown CPU, since the intervals would then be guesses.
 */
export function summarizeCpuOff(
    snapshot: DeepReadonly<SimulationState>,
): CpuOffSummary[] {
    const intervalsByCpu = new Map<number, CpuOffInterval[]>(
        snapshot.cpus.map((cpu) => [cpu.id, []]),
    );
    for (const event of snapshot.events) {
        if (event.kind !== 'cpu-off' && event.kind !== 'cpu-on') {
            continue;
        }
        const intervals = intervalsByCpu.get(event.cpuId);
        if (intervals === undefined) {
            throw new CpuEventSequenceError(
                `Event ${event.kind} at ${event.time} names CPU ${event.cpuId}, which does not exist.`,
            );
        }
        if (event.time > snapshot.clock) {
            throw new CpuEventSequenceError(
                `Event ${event.kind} at ${event.time} for CPU ${event.cpuId} is after the snapshot clock ${snapshot.clock}.`,
            );
        }
        const last = intervals.at(-1);
        const open = last?.end === null;
        if (event.kind === 'cpu-off') {
            if (open) {
                throw new CpuEventSequenceError(
                    `CPU ${event.cpuId} turned off at ${event.time} while already off.`,
                );
            }
            if (last?.end != null && event.time < last.end) {
                throw new CpuEventSequenceError(
                    `CPU ${event.cpuId} turned off at ${event.time}, before it turned on at ${last.end}.`,
                );
            }
            intervals.push({ start: event.time, end: null });
        } else {
            if (!open) {
                throw new CpuEventSequenceError(
                    `CPU ${event.cpuId} turned on at ${event.time} while not off.`,
                );
            }
            if (event.time < last.start) {
                throw new CpuEventSequenceError(
                    `CPU ${event.cpuId} turned on at ${event.time}, before it turned off at ${last.start}.`,
                );
            }
            intervals[intervals.length - 1] = {
                start: intervals[intervals.length - 1].start,
                end: event.time,
            };
        }
    }

    return [...intervalsByCpu].map(([cpuId, intervals]) => ({
        cpuId,
        intervals,
        totalOff: intervals.reduce(
            (total, { start, end }) => total + (end ?? snapshot.clock) - start,
            0,
        ),
    }));
}
