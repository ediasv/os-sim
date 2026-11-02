/**
 * Whether a simulation can still advance (DEC-49, REQ-04). A pure reading of
 * one state: it never changes it and never looks at what the last tick did,
 * so idle CPUs alone are not evidence of a block.
 */
import { maxJobs } from './domain';
import type { DeepReadonly, JobRef, SimulationState } from './domain';
import { findEligibleJobs } from './eligibility';

/**
 * - `finished`: every task is finished (also true with no tasks).
 * - `blocked`: work is pending, no job may run and no activation is coming;
 *   `jobs` are the unfinished jobs that cannot proceed.
 * - `running`: otherwise; a job can run or an activation is still due.
 */
export type ExecutionProgress =
    | { readonly kind: 'finished' }
    | { readonly kind: 'running' }
    | { readonly kind: 'blocked'; readonly jobs: readonly JobRef[] };

type TaskView = DeepReadonly<SimulationState>['tasks'][number];

/**
 * A task is finished when concluded, or when it has created all its jobs and
 * each one completed or was interrupted (DEC-09, DEC-43). The `task-finished`
 * event is not used: an edit can finish a task too.
 */
function isTaskFinished(tcb: TaskView): boolean {
    if (tcb.status === 'concluded') return true;
    return (
        tcb.jobs.length === maxJobs(tcb.definition) &&
        tcb.jobs.every(
            (job) => job.state === 'completed' || job.state === 'interrupted',
        )
    );
}

/**
 * A task activates again only if it is not concluded and has an activation
 * left. Concluding a task keeps its `nextActivation`, so a concluded task
 * must not count, or the run would wait for an activation that never comes.
 * A suspended task does count: it keeps creating jobs up to its limit.
 */
function hasFutureActivation(tcb: TaskView): boolean {
    return tcb.status !== 'concluded' && tcb.nextActivation !== null;
}

export function classifyProgress(
    state: DeepReadonly<SimulationState>,
): ExecutionProgress {
    const pending = state.tasks.filter((tcb) => !isTaskFinished(tcb));
    if (pending.length === 0) return { kind: 'finished' };
    if (findEligibleJobs(state).length > 0) return { kind: 'running' };
    if (pending.some(hasFutureActivation)) return { kind: 'running' };
    const jobs: JobRef[] = pending.flatMap((tcb) =>
        tcb.jobs
            .filter(
                (job) =>
                    job.state !== 'completed' && job.state !== 'interrupted',
            )
            .map((job) => ({ taskId: job.taskId, index: job.index })),
    );
    return { kind: 'blocked', jobs };
}
