/**
 * Builds the live state and its immutable snapshots. Snapshots are deep,
 * frozen copies so history and UI can keep them while the engine keeps
 * mutating its own state (invariant: snapshots share no mutable data).
 */
import type {
    SimulationSnapshot,
    SimulationState,
    SystemConfig,
} from './domain';
import { freezeCopy } from './helpers/freezeCopy';

/**
 * State before any activation: one TCB without jobs per task and CPUs 1..n
 * logically off since tick 0. The engine activates and dispatches tick-zero
 * jobs before publishing snapshot 0 (DEC-11).
 */
export function createInitialState(config: SystemConfig): SimulationState {
    return {
        clock: 0,
        config,
        tasks: config.tasks.map((definition) => ({ definition, jobs: [] })),
        cpus: Array.from({ length: config.cpuCount }, (_, i) => ({
            id: i + 1,
            running: null,
            sliceElapsed: 0,
            offSince: 0,
        })),
        executions: [],
        events: [],
    };
}

/** Deep, frozen copy of the live state. */
export function takeSnapshot(state: SimulationState): SimulationSnapshot {
    return freezeCopy(state);
}
