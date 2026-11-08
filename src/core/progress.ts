/**
 * Whether a simulation can still advance (DEC-49, REQ-04). A pure reading of
 * one state: it never changes it and never looks at what the last tick did,
 * so idle CPUs alone are not evidence of a block.
 */
import { maxJobs } from './domain';
import type { DeepReadonly, JobRef, SimulationState, TaskId } from './domain';
import { findEligibleJobs } from './eligibility';

/**
 * - `finished`: every task is finished (also true with no tasks).
 * - `suspended`: every unfinished task is suspended (DEC-52); `taskIds` are
 *   those tasks and `jobs` their unfinished jobs (empty if suspended before
 *   the first activation). Checked before activations: new jobs of a suspended task
 *   could never run, so only resuming it lets the simulation finish.
 * - `blocked`: work is pending, no job may run and no activation is coming;
 *   `jobs` are the unfinished jobs that cannot proceed. In a consistent state
 *   it is never empty: a task below its job limit always has a next
 *   activation (see consistency.ts), so it would not be blocked.
 * - `running`: otherwise; a job can run or an activation is still due.
 */
export type ExecutionProgress =
    | { readonly kind: 'finished' }
    | { readonly kind: 'running' }
    | {
          readonly kind: 'suspended';
          readonly taskIds: readonly TaskId[];
          readonly jobs: readonly JobRef[];
      }
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
 */
function hasFutureActivation(tcb: TaskView): boolean {
    return tcb.status !== 'concluded' && tcb.nextActivation !== null;
}

export function classifyProgress(
    state: DeepReadonly<SimulationState>,
): ExecutionProgress {
    const pending = state.tasks.filter((tcb) => !isTaskFinished(tcb));
    if (pending.length === 0) return { kind: 'finished' };
    if (pending.every((tcb) => tcb.status === 'suspended')) {
        return {
            kind: 'suspended',
            taskIds: pending.map((tcb) => tcb.definition.id),
            jobs: unfinishedJobs(pending),
        };
    }
    if (findEligibleJobs(state).length > 0) return { kind: 'running' };
    if (pending.some(hasFutureActivation)) return { kind: 'running' };
    return { kind: 'blocked', jobs: unfinishedJobs(pending) };
}

/** Jobs of the given tasks that neither completed nor were interrupted. */
function unfinishedJobs(tasks: readonly TaskView[]): JobRef[] {
    return tasks.flatMap((tcb) =>
        tcb.jobs
            .filter(
                (job) =>
                    job.state !== 'completed' && job.state !== 'interrupted',
            )
            .map((job) => ({ taskId: job.taskId, index: job.index })),
    );
}
