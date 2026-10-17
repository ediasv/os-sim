import type { DeepReadonly, JobRef, SimulationState } from './domain';
import { freezeCopy } from './helpers/freezeCopy';

/**
 * Returns only each task's oldest incomplete job. A suspended oldest job
 * blocks later activations as required by DEC-02.
 */
export function findEligibleJobs(
    state: DeepReadonly<SimulationState>,
): readonly JobRef[] {
    const eligible: JobRef[] = [];
    for (const tcb of state.tasks) {
        const index = tcb.jobs.findIndex((job) => job.state !== 'completed');
        if (index === -1 || tcb.jobs[index].state === 'suspended') {
            continue;
        }
        eligible.push({ taskId: tcb.definition.id, index });
    }
    return freezeCopy(eligible);
}
