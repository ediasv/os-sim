import type { DeepReadonly, JobRef, SimulationState } from './domain';
import { freezeCopy } from './helpers/freezeCopy';

/**
 * Returns each task's oldest unfinished job (neither completed nor
 * interrupted); it blocks later activations of that task (DEC-02). Tasks
 * whose status is suspended or concluded offer none (DEC-43). Forced tasks
 * are included: the engine gives them a CPU before the policy runs.
 */
export function findEligibleJobs(
    state: DeepReadonly<SimulationState>,
): readonly JobRef[] {
    const eligible: JobRef[] = [];
    for (const tcb of state.tasks) {
        if (tcb.status === 'suspended' || tcb.status === 'concluded') continue;
        const index = tcb.jobs.findIndex(
            (job) => job.state !== 'completed' && job.state !== 'interrupted',
        );
        if (index === -1 || tcb.jobs[index].state === 'suspended') {
            continue;
        }
        eligible.push({ taskId: tcb.definition.id, index });
    }
    return freezeCopy(eligible);
}
