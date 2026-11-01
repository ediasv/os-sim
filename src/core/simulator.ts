import {
    DEFAULT_CONFIG,
    maxJobs,
    type Job,
    type JobRef,
    type SimulationSnapshot,
    type SimulationState,
    type SystemConfig,
} from './domain';
import { findInconsistencies } from './consistency';
import { findEligibleJobs } from './eligibility';
import { requireValidConfig } from './config';
import {
    buildPolicyView,
    checkDecision,
    selectedRefs,
    type PolicyTie,
    type SchedulingPolicy,
} from './policy';
import { drawWinners } from './draw';
import { createInitialState, restoreState, takeSnapshot } from './snapshot';
import { SnapshotHistory } from './history';
import { deepCopy } from './helpers/deepCopy';
import { key } from './helpers/key';

const NO_WORK_POLICY: SchedulingPolicy = {
    select: () => ({ selected: [] }),
};

/**
 * Checks that a list read from a policy decision holds only job references
 * and returns plain copies of them (see `selectedRefs`). Shared by `selected`
 * and `tie.candidates` so both are held to the same shape (DEC-14, DEC-27).
 */
function readJobRefs(raw: unknown, field: string): JobRef[] {
    if (
        !Array.isArray(raw) ||
        raw.some((ref) => typeof ref !== 'object' || ref === null)
    ) {
        throw new Error(
            `Invalid scheduling policy decision: ${field} must be an array of job references.`,
        );
    }
    return selectedRefs({ selected: raw as JobRef[] });
}

/**
 * Reads a policy's `tie` field once and returns plain copies, for the same
 * reasons as `selectedRefs`: a getter could answer differently later and the
 * policy must not keep a handle on what the engine stores (DEC-14, DEC-27).
 */
function copyTie(raw: unknown): PolicyTie {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error(
            'Invalid scheduling policy decision: tie must be an object.',
        );
    }
    const candidates = readJobRefs(
        (raw as PolicyTie).candidates,
        'tie.candidates',
    );
    const slots: unknown = (raw as PolicyTie).slots;
    if (typeof slots !== 'number') {
        throw new Error(
            'Invalid scheduling policy decision: tie.slots must be a number.',
        );
    }
    return { candidates, slots };
}

export interface ExecutionGuardResult {
    ready: boolean;
    reason?: string;
}

/**
 * Owns the live simulation state and publishes immutable snapshots of it.
 * Activations are processed at each boundary, eligible jobs are selected
 * globally by an injected policy, and slices that used the whole quantum
 * are renewed at each boundary (DEC-03, DEC-18).
 */
export class Simulator {
    private state: SimulationState;
    private readonly policy: SchedulingPolicy;
    /** Recorded steps and the cursor; the live state shows the cursor's step. */
    private readonly history = new SnapshotHistory();

    constructor(
        config: SystemConfig = DEFAULT_CONFIG,
        policy?: SchedulingPolicy,
    ) {
        const validated = this.validateDependencies(config, policy);
        this.state = createInitialState(validated.config);
        this.policy = validated.policy;
        this.activateDueJobs();
        this.dispatch();
        this.recordSnapshot();
    }

    public tick(): void {
        const guardResult = this.executionGuard();
        if (!guardResult.ready) {
            throw new Error(guardResult.reason);
        }

        // DEC-14: mutate a working copy and commit it only if the whole step
        // succeeds, so a failing policy leaves state and history unchanged.
        const committed = this.state;
        this.state = deepCopy(committed);
        try {
            this.executeTick();
            this.state.clock++;
            this.completeJobsAndRecordDeadlineMisses();
            this.expireSlices();
            this.activateDueJobs();
            this.dispatch();
        } catch (error) {
            this.state = committed;
            throw error;
        }
        this.recordSnapshot();
    }

    /** Returns the current jobs allowed to run, without exposing live state. */
    public getEligibleJobs(): readonly JobRef[] {
        return findEligibleJobs(this.state);
    }

    /** Newest recorded step, wherever the cursor is. */
    public getLatestSnapshot(): SimulationSnapshot {
        return this.history.latest();
    }

    /**
     * Makes a recorded step the current one: the live state becomes a mutable
     * copy of that snapshot, so eligibility and later ticks start from it
     * (REQ-04, DEC-06). Recorded snapshots are never changed or dropped. An
     * unrecorded step is refused before anything is touched.
     */
    public restore(step: number): void {
        if (!this.history.has(step)) {
            throw new RangeError(
                `Cannot restore step ${step}: recorded steps are 0 to ${this.history.latestStep}.`,
            );
        }
        this.state = restoreState(this.history.at(step));
        this.history.moveTo(step);
    }

    public getCursor(): number {
        return this.history.cursor;
    }

    /** Snapshot of the step the cursor points at. */
    public getCurrentSnapshot(): SimulationSnapshot {
        return this.history.current();
    }

    private recordSnapshot(): void {
        this.history.append(takeSnapshot(this.state));
    }

    /** Executes exactly [clock, clock + 1) on each dispatched CPU. */
    private executeTick(): void {
        for (const cpu of this.state.cpus) {
            if (cpu.running === null) {
                continue;
            }
            const job = this.findJob(cpu.running);
            if (job === undefined) {
                throw new Error(
                    `CPU ${cpu.id} owns a job that does not exist.`,
                );
            }
            job.executed++;
            cpu.sliceElapsed++;

            let previousIndex = -1;
            for (
                let index = this.state.executions.length - 1;
                index >= 0;
                index--
            ) {
                if (this.state.executions[index].cpuId === cpu.id) {
                    previousIndex = index;
                    break;
                }
            }
            const previous =
                previousIndex === -1
                    ? undefined
                    : this.state.executions[previousIndex];
            if (
                previous !== undefined &&
                previous.job.taskId === job.taskId &&
                previous.job.index === job.index &&
                previous.end === this.state.clock
            ) {
                this.state.executions[previousIndex] = {
                    ...previous,
                    end: previous.end + 1,
                };
            } else {
                this.state.executions.push({
                    cpuId: cpu.id,
                    job: { taskId: job.taskId, index: job.index },
                    start: this.state.clock,
                    end: this.state.clock + 1,
                });
            }
        }
    }

    /**
     * Completes work before checking deadlines at the new boundary (DEC-04),
     * in two passes so every completion is logged before any deadline miss,
     * whichever task comes first (DEC-22).
     */
    private completeJobsAndRecordDeadlineMisses(): void {
        for (const tcb of this.state.tasks) {
            for (const job of tcb.jobs) {
                if (
                    job.state !== 'completed' &&
                    job.executed >= tcb.definition.duration
                ) {
                    job.state = 'completed';
                    job.completedAt = this.state.clock;
                    this.state.events.push({
                        kind: 'completion',
                        time: this.state.clock,
                        job: { taskId: job.taskId, index: job.index },
                    });
                    if (
                        tcb.jobs.length === maxJobs(tcb.definition) &&
                        tcb.jobs.every(
                            (taskJob) => taskJob.state === 'completed',
                        )
                    ) {
                        this.state.events.push({
                            kind: 'task-finished',
                            time: this.state.clock,
                            taskId: tcb.definition.id,
                        });
                    }
                }
            }
        }

        for (const tcb of this.state.tasks) {
            for (const job of tcb.jobs) {
                if (
                    job.state !== 'completed' &&
                    !job.deadlineMissed &&
                    job.absoluteDeadline <= this.state.clock
                ) {
                    job.deadlineMissed = true;
                    this.state.events.push({
                        kind: 'deadline-miss',
                        time: this.state.clock,
                        job: { taskId: job.taskId, index: job.index },
                    });
                }
            }
        }
    }

    /**
     * Renews every slice that used the whole quantum (DEC-03). The job keeps
     * its CPU until dispatch, so the view still counts it as running before
     * the selection (DEC-18); a job completing now is skipped, since DEC-03
     * only returns incomplete jobs to the selection.
     */
    private expireSlices(): void {
        for (const cpu of this.state.cpus) {
            if (
                cpu.running === null ||
                cpu.sliceElapsed < this.state.config.quantum
            ) {
                continue;
            }
            const job = this.findJob(cpu.running);
            if (job === undefined || job.state === 'completed') {
                continue;
            }
            this.state.events.push({
                kind: 'quantum-expired',
                time: this.state.clock,
                cpuId: cpu.id,
                job: { taskId: job.taskId, index: job.index },
            });
            cpu.sliceElapsed = 0;
        }
    }

    /**
     * Copies one global policy decision once and validates that copy (DEC-14),
     * so a policy cannot return different values to the check and to dispatch.
     * A reported residual tie is drawn here and logged as `tie-break` events
     * (DEC-27). Selected jobs stay on their current CPUs where possible; any remaining
     * jobs are assigned to available CPUs. It also emits the preemption,
     * cpu-on and cpu-off events of the change and ends with the
     * `findInconsistencies` check of the resulting state (DEC-12, DEC-14).
     */
    private dispatch(): void {
        const eligible = findEligibleJobs(this.state);
        const view = buildPolicyView(this.state, eligible);
        const decision = this.policy.select(view);
        // Read `selected` a single time: a getter could answer differently later.
        const rawSelected: unknown =
            typeof decision === 'object' && decision !== null
                ? decision.selected
                : undefined;
        const copied = readJobRefs(rawSelected, 'selected');
        const rawTie: unknown =
            typeof decision === 'object' && decision !== null
                ? decision.tie
                : undefined;
        const tie = rawTie === undefined ? undefined : copyTie(rawTie);
        const issues = checkDecision(view, { selected: copied, tie });
        if (issues.length > 0) {
            throw new Error(
                `Invalid scheduling policy decision:\n${issues.join('\n')}`,
            );
        }
        // Keys match by string, so a policy-typed ref such as index '0' could
        // pass the check; store the candidate's own numeric ref instead.
        const candidateByKey = new Map(
            view.candidates.map(({ job }) => [
                key(job),
                { taskId: job.taskId, index: job.index },
            ]),
        );
        const toCandidate = (ref: JobRef) => candidateByKey.get(key(ref))!;
        const selected = copied.map(toCandidate);
        if (tie !== undefined) {
            // DEC-27: the engine owns the generator; every winner is logged,
            // even one that keeps running, before the per-CPU events (DEC-22).
            // Candidates are listed in the draw's order, by task ID.
            const draw = drawWinners(
                tie.candidates.map(toCandidate),
                tie.slots,
                this.state.drawState,
            );
            this.state.drawState = draw.state;
            for (const winner of draw.winners) {
                selected.push(winner);
                this.state.events.push({
                    kind: 'tie-break',
                    time: this.state.clock,
                    winner,
                    candidates: draw.group.map((ref) => ({ ...ref })),
                });
            }
        }

        const selectedKeys = new Set(selected.map(key));
        const cpuByJob = new Map<string, number>();
        const reservedCpus = new Set<number>();

        for (const ref of selected) {
            const owner = this.state.cpus.find(
                (cpu) => cpu.running !== null && key(cpu.running) === key(ref),
            );
            if (owner !== undefined) {
                cpuByJob.set(key(ref), owner.id);
                reservedCpus.add(owner.id);
            }
        }

        const availableCpus = this.state.cpus.filter(
            (cpu) => !reservedCpus.has(cpu.id),
        );
        for (const ref of selected) {
            if (cpuByJob.has(key(ref))) {
                continue;
            }
            const cpu = availableCpus.shift();
            if (cpu === undefined) {
                throw new Error(
                    'The policy selected more jobs than available CPUs.',
                );
            }
            cpuByJob.set(key(ref), cpu.id);
        }

        for (const tcb of this.state.tasks) {
            for (const job of tcb.jobs) {
                if (job.state === 'running' && !selectedKeys.has(key(job))) {
                    job.state = 'ready';
                }
            }
        }

        for (const cpu of this.state.cpus) {
            const next = selected.find(
                (ref) => cpuByJob.get(key(ref)) === cpu.id,
            );
            const nextRef = next ?? null;
            const sameJob =
                cpu.running !== null &&
                nextRef !== null &&
                key(cpu.running) === key(nextRef);

            if (nextRef === null) {
                if (cpu.running !== null || cpu.offSince === null) {
                    cpu.offSince = this.state.clock;
                    cpu.sliceElapsed = 0;
                    this.state.events.push({
                        kind: 'cpu-off',
                        time: this.state.clock,
                        cpuId: cpu.id,
                    });
                }
                cpu.running = null;
                continue;
            }

            if (!sameJob && cpu.running !== null) {
                const preempted = this.findJob(cpu.running);
                if (preempted?.state === 'ready') {
                    this.state.events.push({
                        kind: 'preemption',
                        time: this.state.clock,
                        cpuId: cpu.id,
                        preempted: {
                            taskId: preempted.taskId,
                            index: preempted.index,
                        },
                        by: { taskId: nextRef.taskId, index: nextRef.index },
                    });
                }
            }

            if (cpu.offSince !== null) {
                cpu.offSince = null;
                this.state.events.push({
                    kind: 'cpu-on',
                    time: this.state.clock,
                    cpuId: cpu.id,
                });
            }
            if (!sameJob) {
                cpu.sliceElapsed = 0;
            }
            cpu.running = { taskId: nextRef.taskId, index: nextRef.index };
            const job = this.findJob(nextRef);
            if (job === undefined) {
                throw new Error(`Selected job ${key(nextRef)} does not exist.`);
            }
            job.state = 'running';
        }

        const inconsistencies = findInconsistencies(this.state);
        if (inconsistencies.length > 0) {
            throw new Error(
                `Inconsistent simulator state:\n${inconsistencies.join('\n')}`,
            );
        }
    }

    private findJob(ref: JobRef): Job | undefined {
        return this.state.tasks.find((tcb) => tcb.definition.id === ref.taskId)
            ?.jobs[ref.index];
    }

    /**
     * Refuses tick() while the cursor is behind the latest recorded step, so a
     * recorded step is never overwritten. Reusing the computed future is #24
     * and discarding it is #26; until then navigation is the only way back.
     */
    private executionGuard(): ExecutionGuardResult {
        if (this.history.isBehind) {
            return {
                ready: false,
                reason: `Step ${this.history.cursor + 1} is already computed; use snapshot navigation instead of tick().`,
            };
        }
        return { ready: true };
    }

    /**
     * Validates all required inputs before creating any live simulator state.
     * The configuration is checked before the policy, and its rejection keeps
     * each issue's field and task index (DEC-15).
     */
    private validateDependencies(
        config: SystemConfig,
        policy: SchedulingPolicy | undefined,
    ): { config: SystemConfig; policy: SchedulingPolicy } {
        const validConfig = requireValidConfig(config);
        if (policy === undefined) {
            if (validConfig.tasks.length > 0) {
                throw new TypeError(
                    'A scheduling policy is required when tasks are configured.',
                );
            }
            return { config: validConfig, policy: NO_WORK_POLICY };
        }
        if (
            policy === null ||
            typeof policy !== 'object' ||
            typeof policy.select !== 'function'
        ) {
            throw new TypeError(
                'A scheduling policy with a select method is required.',
            );
        }
        return { config: validConfig, policy };
    }

    /**
     * Adds every activation due at this boundary. Jobs keep their own identity
     * and deadline; the task's finite activation count comes from DEC-09.
     */
    private activateDueJobs(): void {
        for (const tcb of this.state.tasks) {
            const { arrival, period, deadline } = tcb.definition;
            while (
                tcb.jobs.length < maxJobs(tcb.definition) &&
                arrival + tcb.jobs.length * period <= this.state.clock
            ) {
                const index = tcb.jobs.length;
                const activation = arrival + index * period;
                const job: Job = {
                    taskId: tcb.definition.id,
                    index,
                    activation,
                    absoluteDeadline: activation + deadline,
                    executed: 0,
                    state: 'ready',
                    completedAt: null,
                    deadlineMissed: false,
                };
                tcb.jobs.push(job);
                this.state.events.push({
                    kind: 'activation',
                    time: activation,
                    job: { taskId: job.taskId, index: job.index },
                });
            }
        }
    }
}
