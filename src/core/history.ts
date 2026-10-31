import type { SimulationSnapshot } from './domain';

/**
 * Recorded steps of a simulation and the cursor that marks the one currently
 * shown (REQ-04). Holds only the frozen snapshots the engine publishes, so an
 * entry cannot change after it is recorded (invariant: snapshots share no
 * mutable data with the live state). The engine restores its live state from
 * an entry; this class only stores and locates them.
 */
export class SimulationHistory {
    private readonly snapshots: SimulationSnapshot[] = [];
    private position = -1;

    /** Index of the snapshot in use: the newest one unless the history was moved back. */
    get cursor(): number {
        return this.position;
    }

    get snapshotCount(): number {
        return this.snapshots.length;
    }

    /** Snapshot recorded at `index`; throws RangeError when there is none. */
    at(index: number): SimulationSnapshot {
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this.snapshots.length
        ) {
            throw new RangeError(
                `No snapshot ${index}; the history holds ${this.snapshots.length}.`,
            );
        }
        return this.snapshots[index];
    }

    /** Snapshot at the cursor. */
    current(): SimulationSnapshot {
        return this.at(this.position);
    }

    /**
     * Records the step that follows the cursor and moves the cursor to it.
     * Steps after the cursor are dropped, since the new step replaces them
     * (DEC-06, DEC-35).
     */
    append(snapshot: SimulationSnapshot): void {
        this.snapshots.splice(this.position + 1);
        this.snapshots.push(snapshot);
        this.position = this.snapshots.length - 1;
    }

    /** Moves the cursor to an existing snapshot without changing the history. */
    moveTo(index: number): void {
        this.at(index);
        this.position = index;
    }
}
