/**
 * Pseudo-random draw for residual ties (A.4.3, DEC-06, DEC-27). The generator
 * is a pure function of a 32-bit state that lives in `SimulationState`, so
 * every snapshot carries it and replaying from a snapshot repeats the same
 * draws (REQ-04). Only the engine calls it; policies never see it (DEC-13).
 */
import type { DeepReadonly, JobRef } from './domain';
import { compareJobRefs } from './helpers/key';

/**
 * Generator state at tick 0. Fixed, so the same configuration always yields
 * the same draws without adding a field to the configuration file (DEC-27).
 */
export const DRAW_SEED = 0x5eed2026;

/** One mulberry32 step: a value in [0, 1) and the state for the next call. */
export function nextRandom(state: number): { value: number; state: number } {
    const next = (state + 0x6d2b79f5) >>> 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/**
 * Picks `slots` distinct winners from the tied jobs, in draw order, as plain
 * `{ taskId, index }` copies, and returns the group as plain copies sorted by
 * task ID and job index. Drawing from that sorted group makes the result
 * depend only on its members and the state, never on the order the policy
 * listed them in; the engine logs the same order. Throws unless `slots` is an
 * integer that fills at least one CPU and leaves at least one job out (DEC-27).
 */
export function drawWinners(
    tied: readonly DeepReadonly<JobRef>[],
    slots: number,
    state: number,
): { winners: JobRef[]; group: JobRef[]; state: number } {
    if (!Number.isInteger(slots) || slots < 1 || slots >= tied.length) {
        throw new RangeError(
            `Cannot draw ${slots} winners from ${tied.length} tied jobs.`,
        );
    }
    const group = tied
        .map(({ taskId, index }) => ({ taskId, index }))
        .sort(compareJobRefs);
    const remaining = [...group];
    const winners: JobRef[] = [];
    let current = state;
    for (let drawn = 0; drawn < slots; drawn++) {
        const next = nextRandom(current);
        current = next.state;
        const [winner] = remaining.splice(
            Math.floor(next.value * remaining.length),
            1,
        );
        winners.push(winner);
    }
    return { winners, group, state: current };
}
