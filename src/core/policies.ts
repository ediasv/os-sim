/**
 * Mandatory scheduling policies, RM and EDF (REQ-07, DEC-01, DEC-13). Both
 * only rank the candidates of the frozen view and keep the best
 * min(cpuCount, candidates); the engine validates and dispatches. They read no
 * ID and no candidate order as a criterion.
 *
 * A priority tie is broken by the A.4.3 criteria with the job's own values
 * (DEC-16, DEC-18). Jobs still equal on all of them that straddle the CPU cut
 * are reported as `tie` for the engine to draw (DEC-27); no ID or candidate
 * order ever decides.
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

/** Orders lower values first; compares instead of subtracting, see below. */
function ascending(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Priority, then A.4.3 in order (DEC-16): the job that was running before the
 * selection, even if its slice just expired (DEC-18); earlier absolute
 * deadline; earlier activation; shorter task duration. Zero means a residual
 * tie that only a draw may break.
 */
function compareCandidates(
    a: PolicyCandidate,
    b: PolicyCandidate,
    priority: PriorityKey,
): number {
    return (
        // Two aperiodic RM tasks both rank as Infinity, and Infinity -
        // Infinity would be NaN.
        ascending(priority(a), priority(b)) ||
        ascending(a.wasRunning ? 0 : 1, b.wasRunning ? 0 : 1) ||
        ascending(a.job.absoluteDeadline, b.job.absoluteDeadline) ||
        ascending(a.job.activation, b.job.activation) ||
        ascending(a.task.duration, b.task.duration)
    );
}

function rankedSelection(
    view: PolicyView,
    priority: PriorityKey,
): PolicyDecision {
    const count = Math.min(view.cpuCount, view.candidates.length);
    const ranked = [...view.candidates].sort((a, b) =>
        compareCandidates(a, b, priority),
    );
    const last = ranked[count - 1];
    const firstOut = ranked[count];
    if (
        last === undefined ||
        firstOut === undefined ||
        compareCandidates(last, firstOut, priority) !== 0
    ) {
        return { selected: ranked.slice(0, count).map((c) => c.job) };
    }
    // The group equal to the last selected job crosses the cut: the jobs
    // strictly ahead of it win outright and the group shares the rest. The
    // list is sorted, so the group is the contiguous run around the cut.
    const tiedWithLast = (c: PolicyCandidate) =>
        compareCandidates(c, last, priority) === 0;
    const start = ranked.findIndex(tiedWithLast);
    const after = ranked.findIndex((c, i) => i > count && !tiedWithLast(c));
    const ahead = ranked.slice(0, start);
    const group = ranked.slice(start, after === -1 ? undefined : after);
    return {
        selected: ahead.map((c) => c.job),
        tie: {
            candidates: group.map((c) => c.job),
            slots: count - ahead.length,
        },
    };
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
