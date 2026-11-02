/**
 * Builds the live state and its immutable snapshots. Snapshots are deep,
 * frozen copies so history and UI can keep them while the engine keeps
 * mutating its own state (invariant: snapshots share no mutable data). Also
 * rebuilds a mutable live state from a snapshot when a step is restored
 * (`restoreState`, REQ-04).
 */
import type {
    Job,
    SimulationSnapshot,
    SimulationState,
    SystemConfig,
    TaskControlBlock,
    TaskDefinition,
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
        tasks: config.tasks.map(createTcb),
        cpus: Array.from({ length: config.cpuCount }, (_, i) => ({
            id: i + 1,
            running: null,
            sliceElapsed: 0,
            offSince: null,
        })),
        executions: [],
        events: [],
        drawState: DRAW_SEED,
        usedTaskIds: config.tasks.map((task) => task.id),
    };
}

/**
 * The only place a new TCB is created: ready, no jobs, first activation at
 * the arrival (initial state and inclusion, DEC-46). `restoreState` only
 * rebuilds TCBs from a snapshot, and `editableTask` creates a provisional one
 * to validate an included task before it is applied.
 */
export function createTcb(definition: TaskDefinition): TaskControlBlock {
    return {
        definition,
        status: 'ready',
        jobs: [],
        nextActivation: definition.arrival,
    };
}

/** Deep, frozen copy of the live state. */
export function takeSnapshot(state: SimulationState): SimulationSnapshot {
    return freezeCopy(state);
}

/** Recursive copy that is always mutable, even when the source is frozen. */
function thaw<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(thaw) as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        copy[key] = thaw(field);
    }
    return copy as T;
}

/**
 * Rebuilds a mutable live state from a recorded snapshot, so the engine can
 * keep running from a past step while the snapshot stays untouched (REQ-04,
 * DEC-06, DEC-12). Everything is copied except the configuration and each
 * task definition: they are frozen, the engine never mutates them, and
 * sharing keeps them frozen. `deepCopy` cannot be used here because it hands
 * frozen values back unchanged, which would return the snapshot itself.
 */
export function restoreState(snapshot: SimulationSnapshot): SimulationState {
    const { config, tasks, ...rest } = snapshot;
    return {
        ...(thaw(rest) as Omit<SimulationState, 'config' | 'tasks'>),
        config: config as SystemConfig,
        tasks: tasks.map((tcb) => ({
            definition: tcb.definition as TaskDefinition,
            status: tcb.status,
            jobs: thaw(tcb.jobs) as Job[],
            nextActivation: tcb.nextActivation,
        })),
    };
}
