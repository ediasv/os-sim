/**
 * Domain model of the simulator (DEC-12): plain data shared by the engine,
 * the history and the UI snapshots. Records hold no behavior so a snapshot can
 * be copied and frozen without losing anything, and so restoring a snapshot
 * (DEC-06) is just reusing its data.
 */

/** Scheduling policies required by Project A (A.4). */
export type AlgorithmId = 'RM' | 'EDF';

/**
 * Unique task identifier from the configuration: free text, unique ignoring
 * case, shown as typed (DEC-48). Rules live in `taskId.ts`.
 */
export type TaskId = string;

/** One task line of the configuration file (A.3.3), after validation. */
export interface TaskDefinition {
    readonly id: TaskId;
    /** RGB as six hex digits without `#`, as in the assignment ("F0E0D0"); uppercase after validation. */
    readonly color: string;
    /** Tick of the first activation. */
    readonly arrival: number;
    /** Ticks of execution each job needs. */
    readonly duration: number;
    /** Ticks between activations; 0 means aperiodic, activated once at arrival (DEC-09). */
    readonly period: number;
    /** Relative deadline, counted from each activation (REQ-08). */
    readonly deadline: number;
    /** Event list kept as written; Project A stores it and never runs it (A.3.3.5). */
    readonly rawEvents: string;
}

/** System line of the configuration file plus its tasks. */
export interface SystemConfig {
    readonly algorithm: AlgorithmId;
    /** Maximum ticks of one slice before the job returns to selection (DEC-03). */
    readonly quantum: number;
    /** Number of logical CPUs, with no arbitrary ceiling (DEC-05). */
    readonly cpuCount: number;
    readonly tasks: readonly TaskDefinition[];
}

/** Defaults used when no file is loaded (DEC-10). */
export const DEFAULT_CONFIG: SystemConfig = Object.freeze({
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 1,
    tasks: Object.freeze([]),
});

/**
 * Period given to a task loaded with a missing or zero period in Project A
 * (DEC-29). Applied only at the loading boundary: the core still accepts 0 as
 * aperiodic (DEC-09, DEC-17), which Project B keeps.
 */
export const DEFAULT_TASK_PERIOD = 15;

/** A periodic task stops after this many jobs so the simulation ends (A.4.4, DEC-09). */
export const MAX_PERIODIC_JOBS = 10;

/** How many jobs a task generates in total: 10 if periodic, 1 if aperiodic (DEC-09). */
export function maxJobs(definition: Pick<TaskDefinition, 'period'>): number {
    return definition.period > 0 ? MAX_PERIODIC_JOBS : 1;
}

/** Identifies one job: its task and its activation index (0-based). */
export interface JobRef {
    readonly taskId: TaskId;
    readonly index: number;
}

/**
 * Lifecycle of a job. Eligibility (only the oldest incomplete job of a task
 * may run, DEC-02) is derived by the engine, not stored, so a later job can be
 * `ready` and still wait for an older one. `interrupted` means the job was cut
 * short by concluding its task and never completed (DEC-43). `suspended` is
 * kept for compatibility: edits suspend the task (`TaskStatus`), never a job.
 */
export type JobState =
    | 'ready'
    | 'running'
    | 'suspended'
    | 'completed'
    | 'interrupted';

/** One activation of a task, with its own progress and deadline (REQ-03). */
export interface Job extends JobRef {
    /** Tick at which this job was activated. */
    activation: number;
    /** activation + relative deadline; waiting or suspension never pauses it (REQ-08). */
    absoluteDeadline: number;
    /** Ticks this job needs, copied from the definition at activation (DEC-37). */
    duration: number;
    /** Ticks already executed; preemption keeps it (REQ-01). */
    executed: number;
    state: JobState;
    /** Boundary tick at which the job completed, or null while incomplete. */
    completedAt: number | null;
    /** Set once when the deadline passes with work left; the job keeps running (DEC-04). */
    deadlineMissed: boolean;
}

/** User-selected task state; independent from the current job (DEC-37, DEC-43). */
export type TaskStatus = 'ready' | 'forced' | 'suspended' | 'concluded';

/**
 * Task Control Block: the single structure holding a task's characteristics,
 * the state the user chose for it (`status`, DEC-43) and every activation it
 * generated (A.1.3). `jobs.length` is the number of activations so far; the
 * task has finished when its last job completes, or when an edit concludes it.
 */
export interface TaskControlBlock {
    status: TaskStatus;
    definition: TaskDefinition;
    jobs: Job[];
    /** Tick of the next due activation; null once the task reached `maxJobs` (DEC-37). */
    nextActivation: number | null;
}

/** One logical CPU. Ids run from 1 to cpuCount so they read naturally in the UI. */
export interface CpuState {
    readonly id: number;
    /** Job owning this CPU during the current tick, or null when the CPU is off. */
    running: JobRef | null;
    /** Ticks already used of the current slice (DEC-03). */
    sliceElapsed: number;
    /** Tick at which the CPU was switched off; null while it is on, and before the first dispatch (DEC-05, DEC-11). */
    offSince: number | null;
}

/** A job running on a CPU during [start, end). */
export interface ExecutionSlice {
    readonly cpuId: number;
    readonly job: JobRef;
    readonly start: number;
    readonly end: number;
}

/**
 * Facts recorded at the exact tick they happen, for the Gantt markers and the
 * legend (REQ-09). Each kind gets a distinct graphic element.
 */
export type SimulationEvent =
    | {
          readonly kind: 'suspension';
          readonly time: number;
          readonly taskId: TaskId;
          /**
           * CPU that was running the task's job when it was suspended, even if
           * that job just completed at this tick; null when none was (DEC-43).
           */
          readonly cpuId: number | null;
      }
    | {
          /** Task state changes chosen by the user at an edit (DEC-43). */
          readonly kind: 'resumption' | 'forced' | 'unforced';
          readonly time: number;
          readonly taskId: TaskId;
      }
    | {
          readonly kind: 'activation';
          readonly time: number;
          readonly job: JobRef;
      }
    | {
          readonly kind: 'completion';
          readonly time: number;
          readonly job: JobRef;
      }
    | {
          readonly kind: 'deadline-miss';
          readonly time: number;
          readonly job: JobRef;
      }
    | {
          readonly kind: 'quantum-expired';
          readonly time: number;
          readonly cpuId: number;
          readonly job: JobRef;
      }
    | {
          readonly kind: 'preemption';
          readonly time: number;
          readonly cpuId: number;
          readonly preempted: JobRef;
          readonly by: JobRef;
      }
    | {
          /**
           * Residual tie resolved by a draw (A.4.3). Logged for every draw,
           * including when a winner was already running and keeps its CPU, so
           * it need not pair with a start (DEC-27).
           */
          readonly kind: 'tie-break';
          readonly time: number;
          readonly winner: JobRef;
          readonly candidates: readonly JobRef[];
      }
    | {
          readonly kind: 'task-finished';
          /** Jobs cut short by concluding the task; empty on a natural finish (DEC-43). */
          readonly interrupted: readonly JobRef[];
          readonly time: number;
          readonly taskId: TaskId;
      }
    | {
          readonly kind: 'cpu-off';
          readonly time: number;
          readonly cpuId: number;
      }
    | {
          readonly kind: 'cpu-added';
          readonly time: number;
          readonly cpuId: number;
      }
    | {
          readonly kind: 'cpu-removed';
          readonly time: number;
          readonly cpuId: number;
      }
    | {
          readonly kind: 'cpu-on';
          readonly time: number;
          readonly cpuId: number;
      };

/**
 * Complete live state owned by the engine. Snapshot k shows instant k after
 * its boundary was processed and who runs during [k, k+1) (DEC-11).
 */
export interface SimulationState {
    clock: number;
    config: SystemConfig;
    /** One TCB per task, in configuration order; inclusions append (DEC-46). */
    tasks: TaskControlBlock[];
    cpus: CpuState[];
    executions: ExecutionSlice[];
    events: SimulationEvent[];
    /** State of the residual-tie draw generator, so snapshots replay the same draws (DEC-06, DEC-27). */
    drawState: number;
    /**
     * Highest task ID ever used up to this snapshot; the next included task
     * gets this plus one. Kept in the state so discarding the future discards
     * the IDs generated in it (DEC-46).
     */
    maxTaskId: number;
}

/** Recursively read-only view, used so snapshot consumers cannot mutate them. */
export type DeepReadonly<T> = T extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** Immutable copy of the state published to history and the UI. */
export type SimulationSnapshot = DeepReadonly<SimulationState>;
