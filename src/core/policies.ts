/**
 * Mandatory scheduling policies, RM and EDF (REQ-07, DEC-01, DEC-13). Both
 * only rank the candidates of the frozen view and keep the best
 * min(cpuCount, candidates); the engine validates and dispatches. They read no
 * ID and no candidate order as a criterion.
 *
 * Ties are out of scope until #20: a priority tie that crosses the CPU cut is
 * resolved there (DEC-16, DEC-18). This is the single place where that
 * tie-break must be plugged in, in `rankedSelection`.
 */
import type { AlgorithmId } from './domain';
import type { PolicyCandidate, PolicyView, SchedulingPolicy } from './policy';

/** Lower value means higher priority. */
type PriorityKey = (candidate: PolicyCandidate) => number;

function rankedSelection(
    view: PolicyView,
    priority: PriorityKey,
): { selected: PolicyCandidate['job'][] } {
    const count = Math.min(view.cpuCount, view.candidates.length);
    const ranked = [...view.candidates].sort(
        (a, b) => priority(a) - priority(b),
    );
    return { selected: ranked.slice(0, count).map((c) => c.job) };
}

/**
 * RM: smaller period, higher priority. Aperiodic tasks (period 0) rank as an
 * infinite period: below every periodic task and tied among themselves (DEC-17).
 */
export const rmPolicy: SchedulingPolicy = {
    select: (view) =>
        rankedSelection(view, ({ task }) =>
            task.period === 0 ? Number.POSITIVE_INFINITY : task.period,
        ),
};

/** EDF: smaller absolute deadline of the job, higher priority. */
export const edfPolicy: SchedulingPolicy = {
    select: (view) => rankedSelection(view, ({ job }) => job.absoluteDeadline),
};

/**
 * Links the configured `algorithm` to its policy. The caller passes the result
 * to the Simulator, which never reads the algorithm name (DEC-01).
 */
export function policyFor(algorithm: AlgorithmId): SchedulingPolicy {
    return algorithm === 'EDF' ? edfPolicy : rmPolicy;
}
