import type { DeepReadonly, JobRef } from '../domain';
import { compareTaskIds } from '../taskId';

/** Identifies a job as `taskId.index` (e.g. `1.0`), for map keys and messages. */
export function key(job: DeepReadonly<JobRef>): string {
    return `${job.taskId}.${job.index}`;
}

/**
 * Orders jobs by task ID (natural order, DEC-48), then by job index. A presentation and
 * canonical order only; never a scheduling tie-break (REQ-07).
 */
export function compareJobRefs(
    a: DeepReadonly<JobRef>,
    b: DeepReadonly<JobRef>,
): number {
    return compareTaskIds(a.taskId, b.taskId) || a.index - b.index;
}
