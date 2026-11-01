import type { SimulationSnapshot } from './domain';
import type { Edit } from './edit';
import { freezeCopy } from './helpers/freezeCopy';

/**
 * Recorded steps of a simulation, the edits accepted at each step and the
 * cursor that marks the current step (REQ-04, REQ-05, DEC-35, DEC-39). Step
 * `k` is stored at index `k` and has `clock === k` (DEC-11). Holds only the
 * frozen snapshots the engine publishes. A step is added only when the cursor
 * is on the latest step (`append`, with no edits), and a step is replaced
 * only by `rewrite`, which drops every later step with its edits: an edit in
 * the past discards the future (DEC-37). Knows nothing about the engine;
 * restoring live state from a step and recomputing an edited step are the
 * simulator's job. The recorded future is reused by `Simulator.forward()`
 * (DEC-36).
 */
export class SnapshotHistory {
    private readonly snapshots: SimulationSnapshot[] = [];
    /** Edits accepted at each step, in acceptance order; index = step. */
    private readonly edits: (readonly Edit[])[] = [];
    private position = -1;

    /** Step the cursor points at; -1 only before the first append. */
    get cursor(): number {
        return this.position;
    }

    /** Highest recorded step; -1 while empty. */
    get latestStep(): number {
        return this.snapshots.length - 1;
    }

    /** True when the cursor trails the latest recorded step. */
    get isBehind(): boolean {
        return this.position < this.latestStep;
    }

    /**
     * The single definition of a recorded step (an integer from 0 to the
     * latest step), used by `at` and `moveTo` and, through `at`, by
     * `Simulator.restore`.
     */
    has(step: number): boolean {
        return Number.isInteger(step) && step >= 0 && step <= this.latestStep;
    }

    /** Snapshot of `step`; throws RangeError when it was not recorded. */
    at(step: number): SimulationSnapshot {
        if (!this.has(step)) {
            throw new RangeError(
                `Step ${step} is not recorded: recorded steps are 0 to ${this.latestStep}.`,
            );
        }
        return this.snapshots[step];
    }

    /** Frozen edits accepted at `step`; same RangeError as `at`. */
    editsAt(step: number): readonly Edit[] {
        this.at(step);
        return this.edits[step];
    }

    current(): SimulationSnapshot {
        return this.at(this.position);
    }

    latest(): SimulationSnapshot {
        return this.at(this.latestStep);
    }

    /** Moves the cursor to a recorded step without changing any snapshot. */
    moveTo(step: number): void {
        this.at(step);
        this.position = step;
    }

    /**
     * Records the step after the latest one, with no edits, and moves the
     * cursor to it. Refused while the cursor is behind, so no recorded step is
     * overwritten.
     */
    append(snapshot: SimulationSnapshot): void {
        if (this.isBehind) {
            throw new Error(
                `Cannot record a step while the cursor (${this.position}) is behind the latest step (${this.latestStep}).`,
            );
        }
        this.snapshots.push(snapshot);
        this.edits.push(Object.freeze([]));
        this.position = this.latestStep;
    }

    /**
     * Replaces a recorded step with its recomputed snapshot and the full list
     * of edits accepted at it, drops every later step and its edits, and moves
     * the cursor to `step` (DEC-37, DEC-39). Stores a frozen copy of the
     * edits, so the caller cannot change them afterwards. Nothing changes
     * when the step is not recorded or the snapshot is of another clock.
     */
    rewrite(
        step: number,
        snapshot: SimulationSnapshot,
        edits: readonly Edit[],
    ): void {
        this.at(step);
        if (snapshot.clock !== step) {
            throw new Error(
                `Cannot record a snapshot of clock ${snapshot.clock} as step ${step}.`,
            );
        }
        this.snapshots.length = step;
        this.edits.length = step;
        this.snapshots.push(snapshot);
        this.edits.push(freezeCopy(edits));
        this.position = step;
    }
}
