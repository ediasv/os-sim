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

/**
 * State before any activation: one TCB without jobs per task and CPUs 1..n
 * without a job. Activating tasks that arrive at tick 0 belongs to the engine
 * (#12), which produces snapshot 0 as defined in DEC-11.
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
    };
}

/** Deep, frozen copy of the live state. */
export function takeSnapshot(state: SimulationState): SimulationSnapshot {
    return freezeCopy(state);
}

/**
 * Recursive copy for the plain data of the domain (objects, arrays and
 * primitives). Written by hand because the core targets ES2023 without DOM or
 * Node typings, where `structuredClone` is not declared.
 */
function freezeCopy<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return Object.freeze(value.map(freezeCopy)) as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        copy[key] = freezeCopy(field);
    }
    return Object.freeze(copy) as T;
}
