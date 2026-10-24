/**
 * Mandatory scheduling policies, RM and EDF (REQ-07, DEC-01, DEC-13). Both
 * only rank the candidates of the frozen view and keep the best
 * min(cpuCount, candidates); the engine validates and dispatches. They read no
 * ID and no candidate order as a criterion.
 *
 * Ties are out of scope until #20: a priority tie that crosses the CPU cut is
 * resolved there (DEC-16, DEC-18). This is the single place where that
 * tie-break must be plugged in, in `rankedSelection`. Until then such a tie
 * falls back to the candidate order (the order of the configuration file),
 * a hidden tie-break that REQ-07 forbids, so RM and EDF must not reach the
 * user (E4/E5) before #20.
 */
import type { AlgorithmId } from './domain';
import type {
    PolicyCandidate,
    PolicyDecision,
    PolicyView,
    SchedulingPolicy,
} from './policy';

/** Lower value means higher priority. */
type PriorityKey = (candidate: PolicyCandidate) => number;

function rankedSelection(
    view: PolicyView,
    priority: PriorityKey,
): PolicyDecision {
    const count = Math.min(view.cpuCount, view.candidates.length);
    // Compares instead of subtracting: two aperiodic RM tasks both rank as
    // Infinity, and Infinity - Infinity would be NaN.
    const ranked = [...view.candidates].sort((a, b) => {
        const pa = priority(a);
        const pb = priority(b);
        return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
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

/** Policy for each algorithm name accepted in the configuration. */
export type PolicyRegistry = Readonly<Record<AlgorithmId, SchedulingPolicy>>;

/**
 * Built-in policies, keyed by the configured `algorithm`; `createSimulator`
 * resolves the configuration's algorithm here (DEC-25). A new algorithm is
 * added by extending `AlgorithmId` and registering it here, which the
 * `Record` type enforces at compile time (A.4.2).
 */
export const DEFAULT_POLICIES: PolicyRegistry = Object.freeze({
    RM: rmPolicy,
    EDF: edfPolicy,
});
