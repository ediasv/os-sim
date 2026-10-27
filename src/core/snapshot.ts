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
import { DRAW_SEED } from './draw';
import { freezeCopy } from './helpers/freezeCopy';

/**
 * State before any activation or dispatch: one TCB without jobs per task and
 * undecided CPUs. Dispatch sets `offSince` to tick zero for idle CPUs before
 * publishing snapshot 0 (DEC-11).
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
            offSince: null,
        })),
        executions: [],
        events: [],
        drawState: DRAW_SEED,
    };
}

/** Deep, frozen copy of the live state. */
export function takeSnapshot(state: SimulationState): SimulationSnapshot {
    return freezeCopy(state);
}
