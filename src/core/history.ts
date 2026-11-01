import type { SimulationSnapshot } from './domain';

/**
 * Recorded steps of a simulation and the cursor that marks the current one
 * (REQ-04, DEC-35). Step `k` is stored at index `k` and has `clock === k`
 * (DEC-11). Holds only the frozen snapshots the engine publishes and never
 * changes or drops one: a step can be added only when the cursor is on the
 * latest step. Knows nothing about the engine; restoring live state from a
 * step is the simulator's job. Reusing the future is #24, discarding it #26.
 */
export class SnapshotHistory {
    private readonly snapshots: SimulationSnapshot[] = [];
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
     * Records the step after the latest one and moves the cursor to it.
     * Refused while the cursor is behind, so no recorded step is overwritten.
     */
    append(snapshot: SimulationSnapshot): void {
        if (this.isBehind) {
            throw new Error(
                `Cannot record a step while the cursor (${this.position}) is behind the latest step (${this.latestStep}).`,
            );
        }
        this.snapshots.push(snapshot);
        this.position = this.latestStep;
    }
}
