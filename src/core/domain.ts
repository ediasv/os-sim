/**
 * Domain model of the simulator (DEC-12): plain data shared by the engine,
 * the history and the UI snapshots. Records hold no behavior so a snapshot can
 * be copied and frozen without losing anything, and so restoring a snapshot
 * (DEC-06) is just reusing its data.
 */

/** Scheduling policies required by Project A (A.4). */
export type AlgorithmId = 'RM' | 'EDF';

/** Unique task identifier from the configuration; always >= 1 (DEC-10). */
export type TaskId = number;

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
 * `ready` and still wait for an older one.
 */
export type JobState = 'ready' | 'running' | 'suspended' | 'completed';

/** One activation of a task, with its own progress and deadline (REQ-03). */
export interface Job extends JobRef {
    /** Tick at which this job was activated. */
    activation: number;
    /** activation + relative deadline; waiting or suspension never pauses it (REQ-08). */
    absoluteDeadline: number;
    /** Ticks already executed; preemption keeps it (REQ-01). */
    executed: number;
    state: JobState;
    /** Boundary tick at which the job completed, or null while incomplete. */
    completedAt: number | null;
    /** Set once when the deadline passes with work left; the job keeps running (DEC-04). */
    deadlineMissed: boolean;
}

/**
 * Task Control Block: the single structure holding a task's characteristics
 * and every activation it generated (A.1.3). `jobs.length` is the number of
 * activations so far; the task has finished when its last job completes.
 */
export interface TaskControlBlock {
    definition: TaskDefinition;
    jobs: Job[];
}

/** One logical CPU. Ids run from 1 to cpuCount so they read naturally in the UI. */
export interface CpuState {
    readonly id: number;
    /** Job owning this CPU during the current tick, or null when the CPU is off. */
    running: JobRef | null;
    /** Ticks already used of the current slice (DEC-03). */
    sliceElapsed: number;
    /**
     * Tick at which the CPU was switched off, or null while it runs a job (DEC-05).
     * Open: the initial state has CPUs with neither a job nor `offSince`; #13/#15
     * define how an idle CPU is represented (DEC-12).
     */
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
          /** Residual tie resolved by a draw; marked when the winner (re)starts (A.4.3). */
          readonly kind: 'tie-break';
          readonly time: number;
          readonly winner: JobRef;
          readonly candidates: readonly JobRef[];
      }
    | {
          readonly kind: 'task-finished';
          readonly time: number;
          readonly taskId: TaskId;
      }
    | {
          readonly kind: 'cpu-off';
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
    /** One TCB per configured task, in configuration order. */
    tasks: TaskControlBlock[];
    cpus: CpuState[];
    executions: ExecutionSlice[];
    events: SimulationEvent[];
}

/** Recursively read-only view, used so snapshot consumers cannot mutate them. */
export type DeepReadonly<T> = T extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** Immutable copy of the state published to history and the UI. */
export type SimulationSnapshot = DeepReadonly<SimulationState>;
