/**
 * Contract between the engine and an injected scheduling policy (DEC-01,
 * DEC-13). The policy reads a frozen view of the eligible jobs and returns
 * which of them run; the engine checks that answer and does every mutation,
 * so swapping RM for EDF never touches the simulation loop (REQ-07).
 */
import type {
    DeepReadonly,
    Job,
    JobRef,
    SimulationState,
    TaskDefinition,
} from './domain';
import { freezeCopy } from './helpers/freezeCopy';
import { key } from './helpers/key';

/** One eligible job offered to the policy, with what RM, EDF and the tie-breaks read (A.4.3). */
export interface PolicyCandidate {
    readonly job: DeepReadonly<Job>;
    readonly task: TaskDefinition;
    /**
     * CPU that owned the job when the view was built, or null; feeds the first
     * tie-break ("who was running before the selection", DEC-03). The engine
     * builds the view before releasing CPUs, so a job whose quantum just
     * expired still reports its CPU and keeps that tie-break (DEC-18).
     */
    readonly previousCpu: number | null;
}

/** Everything a policy may read when choosing; a deep-frozen copy, never live state. */
export interface PolicyView {
    readonly clock: number;
    readonly cpuCount: number;
    /**
     * Jobs allowed to run now (eligibility per DEC-02, computed by the engine).
     * The order carries no priority; a policy must not rely on it, or it would
     * hide a tie-break by ID (REQ-07).
     */
    readonly candidates: readonly PolicyCandidate[];
}

/** What the policy chose for the tick starting at `view.clock`. */
export interface PolicyDecision {
    /**
     * Jobs that run during [clock, clock+1): exactly min(cpuCount, candidates),
     * so no CPU stays off while eligible work waits (REQ-02). Unordered: which
     * CPU each job gets belongs to dispatch (DEC-07). Any `JobRef` will do,
     * such as a candidate's `job`: the engine keeps only `selectedRefs` copies.
     */
    readonly selected: readonly JobRef[];
    /**
     * Residual tie that crosses the CPU cut, if any; the engine draws the
     * remaining CPUs among it (DEC-27). Without it, `selected` is complete.
     */
    readonly tie?: PolicyTie;
}

/**
 * Jobs equal on priority and on every A.4.3 criterion (DEC-16) that compete
 * for the last `slots` CPUs: more jobs than slots, so a draw must decide.
 */
export interface PolicyTie {
    readonly candidates: readonly JobRef[];
    readonly slots: number;
}

/**
 * A scheduling algorithm (RM, EDF, or a test policy). It only reads the view
 * and never mutates anything (DEC-01); a residual tie is reported in `tie`
 * and drawn by the engine, so policies never hold the generator (DEC-27).
 */
export interface SchedulingPolicy {
    select(view: PolicyView): PolicyDecision;
}

/**
 * Lists every way a decision breaks the contract; an empty list means the
 * engine may dispatch it. The engine treats any issue as a policy bug.
 */
export function checkDecision(
    view: PolicyView,
    decision: PolicyDecision,
): string[] {
    const issues: string[] = [];
    const candidates = new Set(view.candidates.map((c) => key(c.job)));
    const seen = new Set<string>();
    for (const ref of decision.selected) {
        const id = key(ref);
        if (!candidates.has(id)) {
            issues.push(`Selected job ${id} is not a candidate.`);
        } else if (seen.has(id)) {
            issues.push(`Job ${id} is selected more than once.`);
        }
        seen.add(id);
    }
    const { tie } = decision;
    if (tie !== undefined) {
        const tied = new Set<string>();
        // Only distinct, unselected candidates can be drawn, so only they
        // count towards leaving a job out.
        let drawable = 0;
        for (const ref of tie.candidates) {
            const id = key(ref);
            if (!candidates.has(id)) {
                issues.push(`Tied job ${id} is not a candidate.`);
            } else if (tied.has(id)) {
                issues.push(`Job ${id} is tied more than once.`);
            } else if (seen.has(id)) {
                issues.push(`Job ${id} is both selected and tied.`);
            } else {
                drawable++;
            }
            tied.add(id);
        }
        if (!Number.isInteger(tie.slots) || tie.slots < 1) {
            issues.push(
                `Tie must fill at least one CPU, got ${tie.slots} slots.`,
            );
        } else if (tie.slots >= drawable) {
            issues.push(
                `Tie must leave out at least one job: ${tie.slots} slots for ${drawable} tied jobs.`,
            );
        }
    }
    const expected = Math.min(view.cpuCount, view.candidates.length);
    const filled = decision.selected.length + (tie?.slots ?? 0);
    if (filled !== expected) {
        issues.push(
            `Policy selected the wrong number of jobs: expected ${expected}, got ${filled}.`,
        );
    }
    return issues;
}

/**
 * Plain `{ taskId, index }` copies of the selected jobs, which the engine
 * stores in `CpuState.running`; call only once `checkDecision` reports no
 * issues. Copying drops extra fields (a frozen job from the view would leak
 * into snapshots) and keeps the engine from holding an object the policy
 * could still change later (DEC-01, DEC-13).
 */
export function selectedRefs(decision: PolicyDecision): JobRef[] {
    return decision.selected.map(({ taskId, index }) => ({ taskId, index }));
}

/**
 * Copies the eligible jobs out of the live state into a frozen view. Throws
 * when the engine offers a job that does not exist, has completed, is
 * suspended or appears twice, since a policy could only make a wrong choice
 * from it.
 */
export function buildPolicyView(
    state: DeepReadonly<SimulationState>,
    eligible: readonly JobRef[],
): PolicyView {
    const seen = new Set<string>();
    const candidates = eligible.map((ref): PolicyCandidate => {
        const id = key(ref);
        const tcb = state.tasks.find((t) => t.definition.id === ref.taskId);
        const job = tcb?.jobs[ref.index];
        if (tcb === undefined || job === undefined) {
            throw new Error(`Eligible job ${id} does not exist.`);
        }
        if (job.state === 'completed') {
            throw new Error(`Eligible job ${id} has already completed.`);
        }
        if (job.state === 'suspended') {
            throw new Error(`Eligible job ${id} is suspended.`);
        }
        if (seen.has(id)) {
            throw new Error(`Eligible job ${id} is listed twice.`);
        }
        seen.add(id);
        const owner = state.cpus.find(
            (cpu) => cpu.running !== null && key(cpu.running) === id,
        );
        return {
            job,
            task: tcb.definition,
            previousCpu: owner?.id ?? null,
        };
    });
    return freezeCopy({
        clock: state.clock,
        cpuCount: state.config.cpuCount,
        candidates,
    });
}
