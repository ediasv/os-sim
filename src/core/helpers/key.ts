import type { DeepReadonly, JobRef } from '../domain';

/** Identifies a job as `taskId.index` (e.g. `1.0`), for map keys and messages. */
export function key(job: DeepReadonly<JobRef>): string {
    return `${job.taskId}.${job.index}`;
}

/**
 * Orders jobs by task ID, then job index, numerically. A presentation and
 * canonical order only; never a scheduling tie-break (REQ-07).
 */
export function compareJobRefs(
    a: DeepReadonly<JobRef>,
    b: DeepReadonly<JobRef>,
): number {
    return a.taskId - b.taskId || a.index - b.index;
}
