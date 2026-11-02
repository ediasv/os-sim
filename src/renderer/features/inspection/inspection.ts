import type { CpuOffSummary } from '../../../core/cpuOff';
import { cpuOffSummary, eligibleJobs } from '../../snapshotQueries';
import {
    maxJobs,
    type DeepReadonly,
    type JobRef,
    type JobState,
    type SimulationSnapshot,
    type TaskDefinition,
    type TaskId,
    type TaskStatus,
} from '../../../core/domain';

export type { JobRef, TaskId } from '../../../core/domain';

export type InspectionTaskStatus =
    | 'awaiting-activation'
    | 'active'
    | 'awaiting-next-activation'
    | 'completed';

export const inspectionTaskStatusLabels: Readonly<
    Record<InspectionTaskStatus, string>
> = {
    'awaiting-activation': 'Aguardando ativação',
    active: 'Ativa',
    'awaiting-next-activation': 'Aguardando próxima ativação',
    completed: 'Terminada',
};

export interface InspectionTaskDefinition {
    readonly id: TaskId;
    readonly color: string;
    readonly arrival: number;
    readonly duration: number;
    readonly period: number;
    readonly deadline: number;
    readonly rawEvents: string;
}

export interface CurrentInspectionJob {
    readonly availability: 'current';
    readonly ref: JobRef;
    readonly activation: number;
    readonly absoluteDeadline: number;
    /** Ticks this job needs, fixed at activation; later edits do not reach it (DEC-37). */
    readonly duration: number;
    readonly executed: number;
    readonly state: JobState;
    readonly completedAt: number | null;
    readonly deadlineMissed: boolean;
    readonly eligible: boolean;
    /**
     * The task is suspended and this is its oldest incomplete job, the one the
     * state applies to (DEC-37). The core never stores a suspended job state,
     * so this is read from the task's choice; it is independent of
     * `deadlineMissed` (FE-09).
     */
    readonly suspended: boolean;
}

interface CurrentJobFacts {
    readonly ref: JobRef;
    readonly activation: number;
    readonly absoluteDeadline: number;
    readonly duration: number;
    readonly executed: number;
    readonly state: JobState;
    readonly completedAt: number | null;
    readonly deadlineMissed: boolean;
}

export interface FutureInspectionJob {
    readonly availability: 'future';
    readonly ref: JobRef;
    readonly activation: number;
    readonly absoluteDeadline: number;
    readonly executed: null;
    readonly state: null;
    readonly completedAt: null;
    readonly deadlineMissed: false;
    readonly eligible: false;
}

export type InspectionJob = CurrentInspectionJob | FutureInspectionJob;

export interface InspectionTask {
    readonly definition: InspectionTaskDefinition;
    readonly status: InspectionTaskStatus;
    /** State the user chose for the task (DEC-37), not what its job is doing. */
    readonly choice: TaskStatus;
    /** Tick of the next due activation; null once the task reached its last job. */
    readonly nextActivation: number | null;
    readonly jobs: readonly CurrentInspectionJob[];
}

/**
 * Label of the chosen state. A ready task whose job holds a CPU is running by
 * priority, which must not read as forced (FE-09, DEC-37 item 1).
 */
export function describeTaskChoice(task: InspectionTask): string {
    switch (task.choice) {
        case 'forced':
            return 'Forçada';
        case 'suspended':
            return 'Suspensa';
        case 'concluded':
            return 'Concluída';
        case 'ready':
            return task.jobs.some((job) => job.state === 'running')
                ? 'Pronta, executando por prioridade'
                : 'Pronta';
    }
}

export interface InspectionData {
    readonly inspectedTick: number;
    readonly tasks: readonly InspectionTask[];
    readonly futureJobs: readonly FutureInspectionJob[];
    readonly cpuOff: readonly CpuOffSummary[];
}

export interface FutureJobInput {
    readonly taskId: TaskId;
    readonly index: number;
    readonly activation: number;
    readonly absoluteDeadline: number;
}

function copyDefinition(
    definition: DeepReadonly<TaskDefinition>,
): InspectionTaskDefinition {
    return {
        id: definition.id,
        color: definition.color,
        arrival: definition.arrival,
        duration: definition.duration,
        period: definition.period,
        deadline: definition.deadline,
        rawEvents: definition.rawEvents,
    };
}

function taskStatus(
    definition: DeepReadonly<TaskDefinition>,
    status: TaskStatus,
    jobs: readonly CurrentInspectionJob[],
    clock: number,
): InspectionTaskStatus {
    // A concluded task never activates again, whatever its jobs say (DEC-43).
    if (status === 'concluded') {
        return 'completed';
    }
    if (jobs.length === 0) {
        return definition.arrival > clock
            ? 'awaiting-activation'
            : 'awaiting-next-activation';
    }

    const hasIncompleteJob = jobs.some(
        (job) => job.state !== 'completed' && job.state !== 'interrupted',
    );
    if (hasIncompleteJob) {
        return 'active';
    }

    return jobs.length >= maxJobs(definition)
        ? 'completed'
        : 'awaiting-next-activation';
}

function projectCurrentJob(
    job: CurrentJobFacts,
    eligibleKeys: ReadonlySet<string>,
): CurrentInspectionJob {
    const ref = { taskId: job.ref.taskId, index: job.ref.index };
    return {
        availability: 'current',
        ref,
        activation: job.activation,
        absoluteDeadline: job.absoluteDeadline,
        duration: job.duration,
        executed: job.executed,
        state: job.state,
        completedAt: job.completedAt,
        deadlineMissed: job.deadlineMissed,
        eligible: eligibleKeys.has(jobKey(ref)),
        suspended: false,
    };
}

function jobKey(ref: JobRef): string {
    return `${ref.taskId}:${ref.index}`;
}

export function projectFutureJob(input: FutureJobInput): FutureInspectionJob {
    return {
        availability: 'future',
        ref: { taskId: input.taskId, index: input.index },
        activation: input.activation,
        absoluteDeadline: input.absoluteDeadline,
        executed: null,
        state: null,
        completedAt: null,
        deadlineMissed: false,
        eligible: false,
    };
}

export function projectInspection(
    snapshot: DeepReadonly<SimulationSnapshot>,
): InspectionData {
    const eligibleKeys = new Set(
        eligibleJobs(snapshot).map((ref) => jobKey(ref)),
    );
    const tasks = snapshot.tasks.map((tcb) => {
        const definition = copyDefinition(tcb.definition);
        const projected = tcb.jobs.map((job) =>
            projectCurrentJob(
                {
                    ref: { taskId: job.taskId, index: job.index },
                    activation: job.activation,
                    absoluteDeadline: job.absoluteDeadline,
                    duration: job.duration,
                    executed: job.executed,
                    state: job.state,
                    completedAt: job.completedAt,
                    deadlineMissed: job.deadlineMissed,
                },
                eligibleKeys,
            ),
        );
        const current = projected.findIndex(
            (job) => job.state !== 'completed' && job.state !== 'interrupted',
        );
        const jobs =
            tcb.status === 'suspended' && current !== -1
                ? projected.map((job, i) =>
                      i === current ? { ...job, suspended: true } : job,
                  )
                : projected;

        return {
            definition,
            status: taskStatus(
                tcb.definition,
                tcb.status,
                jobs,
                snapshot.clock,
            ),
            choice: tcb.status,
            nextActivation: tcb.nextActivation,
            jobs,
        };
    });

    return {
        inspectedTick: snapshot.clock,
        tasks,
        futureJobs: [],
        cpuOff: cpuOffSummary(snapshot),
    };
}
