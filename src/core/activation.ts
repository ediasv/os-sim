/**
 * Job activation (DEC-09, DEC-37). Each task keeps `nextActivation`, the tick
 * of its next due activation, instead of deriving it from `arrival` and the
 * job count, so later edits to period or arrival can move the schedule
 * without rewriting jobs that already exist. Each job copies the duration at
 * activation, so changing the definition later does not alter past jobs.
 */
import { maxJobs, type SimulationState, type TaskControlBlock } from './domain';

/** Adds every activation due at the current clock, for all tasks. */
export function activateDueJobs(state: SimulationState): void {
    for (const tcb of state.tasks) {
        activateTask(state, tcb);
    }
}

/**
 * Activates the due jobs of one task. A concluded task never activates again
 * (DEC-43); `nextActivation` becomes null once the task reached its job limit.
 */
export function activateTask(
    state: SimulationState,
    tcb: TaskControlBlock,
): void {
    const { definition } = tcb;
    while (
        tcb.status !== 'concluded' &&
        tcb.nextActivation !== null &&
        tcb.jobs.length < maxJobs(definition) &&
        tcb.nextActivation <= state.clock
    ) {
        const activation = tcb.nextActivation;
        const job = {
            taskId: definition.id,
            index: tcb.jobs.length,
            activation,
            absoluteDeadline: activation + definition.deadline,
            duration: definition.duration,
            executed: 0,
            state: 'ready' as const,
            completedAt: null,
            deadlineMissed: false,
        };
        tcb.jobs.push(job);
        state.events.push({
            kind: 'activation',
            time: activation,
            job: { taskId: job.taskId, index: job.index },
        });
        tcb.nextActivation =
            tcb.jobs.length === maxJobs(definition)
                ? null
                : activation + definition.period;
    }
}
