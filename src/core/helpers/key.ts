import type { DeepReadonly, JobRef } from '../domain';

/** Identifies a job as `taskId.index` (e.g. `1.0`), for map keys and messages. */
export function key(job: DeepReadonly<JobRef>): string {
    return `${job.taskId}.${job.index}`;
}
