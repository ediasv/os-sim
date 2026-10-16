import {
    DEFAULT_CONFIG,
    type SimulationSnapshot,
    type SimulationState,
} from './domain';
import { createInitialState, takeSnapshot } from './snapshot';

export interface ExecutionGuardResult {
    ready: boolean;
    reason?: string;
}

/**
 * Owns the live simulation state and publishes immutable snapshots of it.
 * For now it only advances the clock over the default configuration; loading
 * a configuration waits for activations (#12), so snapshot 0 is never shown
 * without the tasks that arrive at tick 0 (DEC-11).
 */
export class Simulator {
    private readonly state: SimulationState =
        createInitialState(DEFAULT_CONFIG);
    private snapshotHistory: SimulationSnapshot[] = [];

    constructor() {
        this.recordSnapshot();
    }

    public tick(): void {
        const guardResult = this.executionGuard();
        if (!guardResult.ready) {
            throw new Error(guardResult.reason);
        }

        this.state.clock++;

        this.recordSnapshot();
    }

    public getLatestSnapshot(): SimulationSnapshot {
        const latestSnapshot = this.snapshotHistory.at(-1);

        if (!latestSnapshot) {
            throw new Error('Snapshot history is empty');
        }

        return latestSnapshot;
    }

    private recordSnapshot(): void {
        this.snapshotHistory.push(takeSnapshot(this.state));
    }

    private executionGuard(): ExecutionGuardResult {
        return { ready: true };
    }
}
