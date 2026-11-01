import {
    DEFAULT_CONFIG,
    maxJobs,
    type AlgorithmId,
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
    type PolicyLookup,
    type PolicyTie,
    type SchedulingPolicy,
} from './policy';
import { drawWinners } from './draw';
import { createInitialState, restoreState, takeSnapshot } from './snapshot';
import { SnapshotHistory } from './history';
import { EditRefusal, SimulationRefusal } from './refusal';
import {
    applyNetChange,
    foldEdit,
    readTarget,
    type Edit,
    type EditContext,
    type EditItem,
} from './edit';
import { deepCopy } from './helpers/deepCopy';
import { freezeCopy } from './helpers/freezeCopy';
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

/**
 * Where the Simulator gets its policies (DEC-39, revising DEC-25 item 2). A
 * plain policy runs for every algorithm, so engine tests can inject a test
 * policy; `{ policies }` is looked up by the current `config.algorithm` at
 * every dispatch, which is the production path through `createSimulator`.
 */
export type PolicySource =
    | SchedulingPolicy
    | { readonly policies: PolicyLookup };

const MISSING_SELECT = 'A scheduling policy with a select method is required.';

function hasSelect(value: unknown): value is SchedulingPolicy {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as SchedulingPolicy).select === 'function'
    );
}

/** Whether tick() may run; a refusal always carries its reason (DEC-36). */
export type ExecutionGuardResult =
    | { ready: true }
    | { ready: false; reason: string };

/**
 * Owns the live simulation state and publishes immutable snapshots of it.
 * Activations are processed at each boundary, eligible jobs are selected
 * globally by the policy of the current algorithm (DEC-39), and slices that
 * used the whole quantum are renewed at each boundary (DEC-03, DEC-18).
 */
export class Simulator {
    private state: SimulationState;
    /**
     * Policy for an algorithm, read from the state at every dispatch and
     * never cached, so a restored step runs its own algorithm (DEC-39). The
     * engine looks a policy up by name but never branches on it (DEC-01).
     */
    private readonly resolvePolicy: (
        algorithm: AlgorithmId,
    ) => SchedulingPolicy | undefined;
    /** Recorded steps, their edits and the cursor; the live state shows the cursor's step. */
    private readonly history = new SnapshotHistory();
    /** Validated constructor configuration: a tick-0 edit recomputes from it (DEC-37). */
    private readonly initialConfig: SystemConfig;

    constructor(config: SystemConfig = DEFAULT_CONFIG, source?: PolicySource) {
        const validated = this.validateDependencies(config, source);
        this.initialConfig = validated.config;
        this.state = createInitialState(validated.config);
        this.resolvePolicy = validated.resolvePolicy;
        this.startStages([]);
        this.recordSnapshot();
    }

    public tick(): void {
        const guardResult = this.executionGuard();
        if (!guardResult.ready) {
            throw new SimulationRefusal(guardResult.reason);
        }

        // DEC-14: mutate a working copy and commit it only if the whole step
        // succeeds, so a failing policy leaves state and history unchanged.
        const committed = this.state;
        this.state = deepCopy(committed);
        try {
            this.advanceStages([]);
        } catch (error) {
            this.state = committed;
            throw error;
        }
        this.recordSnapshot();
    }

    /**
     * Applies an edit at the cursor's tick `t` (REQ-05, DEC-37, DEC-39). The
     * dispatch already done at `t` is never patched: step `t-1 -> t` is
     * recomputed from snapshot `t-1` (at tick 0, from the initial state) with
     * every edit accepted at `t` plus this one, so the result depends only on
     * that snapshot and the requested end state. Items are validated in order;
     * any refused item refuses the whole edit with an `EditRefusal`, and like
     * any other failure it leaves state, cursor and history untouched
     * (DEC-14). On success the recomputed step replaces `t` and every later
     * step is discarded with its edits, even when the net change is nil.
     */
    public edit(items: readonly EditItem[]): void {
        if (items.length === 0) {
            throw new SimulationRefusal(
                'Uma edição precisa de pelo menos um item.',
            );
        }
        const step = this.history.cursor;
        const edits = [...this.history.editsAt(step), freezeCopy(items)];
        const committed = this.state;
        try {
            if (step === 0) {
                this.state = createInitialState(this.initialConfig);
                this.startStages(edits);
            } else {
                this.state = restoreState(this.history.at(step - 1));
                this.advanceStages(edits);
            }
        } catch (error) {
            this.state = committed;
            throw error;
        }
        this.history.rewrite(step, takeSnapshot(this.state), edits);
    }

    /** Edits accepted at a recorded step, in order; RangeError otherwise. */
    public getEdits(step: number): readonly Edit[] {
        return this.history.editsAt(step);
    }

    /**
     * Snapshot 0 from the initial state: activations, edit stage and
     * dispatch (DEC-11; no slice has run yet, so none expires).
     */
    private startStages(edits: readonly Edit[]): void {
        this.activateDueJobs();
        this.applyEditStage(edits);
        this.dispatch();
    }

    /** One step from the live state, in the order of "Fluxo de um passo". */
    private advanceStages(edits: readonly Edit[]): void {
        this.executeTick();
        this.state.clock++;
        this.completeJobsAndRecordDeadlineMisses();
        this.activateDueJobs();
        this.applyEditStage(edits);
        this.expireSlices();
        this.dispatch();
    }

    /**
     * Edit stage (DEC-37): folds every edit of the tick onto the parameters in
     * force before them and applies only the net change. Only the last edit
     * is new; the earlier ones were accepted on this same state, so a refusal
     * of one of them means the engine is broken, not the request.
     */
    private applyEditStage(edits: readonly Edit[]): void {
        if (edits.length === 0) {
            return;
        }
        const context: EditContext = {
            state: this.state,
            hasPolicy: (algorithm) =>
                this.resolvePolicy(algorithm) !== undefined,
        };
        const before = readTarget(this.state);
        let target = before;
        edits.forEach((edit, index) => {
            const result = foldEdit(target, edit, context);
            if (!result.ok) {
                if (index < edits.length - 1) {
                    throw new Error(
                        `A recorded edit was refused on replay:\n${result.refusals.map((r) => r.reason).join('\n')}`,
                    );
                }
                throw new EditRefusal(result.refusals);
            }
            target = result.target;
        });
        applyNetChange(this.state, before, target);
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
     * unrecorded step is refused by the history with a RangeError before the
     * live state or the cursor is touched, so the check lives in one place.
     * `forward` and `backward` are the user-facing moves built on it.
     */
    public restore(step: number): void {
        this.state = restoreState(this.history.at(step));
        this.history.moveTo(step);
    }

    /**
     * Moves to the next recorded step, reusing its snapshot as computed: the
     * policy and the draw are not consulted, so results and draw state are
     * exactly the recorded ones (REQ-04, DEC-06, DEC-36). Computing a new step
     * is tick()'s job, so at the latest step this is refused.
     */
    public forward(): void {
        const cursor = this.history.cursor;
        if (!this.canForward()) {
            throw new SimulationRefusal(
                `O passo ${cursor} é o último passo registrado; use tick() para calcular o passo ${cursor + 1}.`,
            );
        }
        this.restore(cursor + 1);
    }

    /** Moves to the previous recorded step; refused at step 0 (REQ-10, DEC-36). */
    public backward(): void {
        const cursor = this.history.cursor;
        if (cursor === 0) {
            throw new SimulationRefusal(
                'O passo 0 é o primeiro passo registrado; não há passo anterior para voltar.',
            );
        }
        this.restore(cursor - 1);
    }

    /**
     * True when a recorded step lies ahead of the cursor, so forward() would
     * reuse it; false at the latest step, where only tick() advances.
     */
    public canForward(): boolean {
        return this.history.isBehind;
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
                    job.state !== 'interrupted' &&
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
                            interrupted: [],
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
                    job.state !== 'interrupted' &&
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
     * only returns incomplete jobs to the selection, and a forced job never
     * expires: it keeps its CPU outside the policy (DEC-41). Runs after activations
     * and the edit stage, so an edited quantum already decides expiry at this
     * boundary (DEC-22 as revised by DEC-37).
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
            if (
                job === undefined ||
                job.state === 'completed' ||
                this.state.tasks.find((tcb) => tcb.definition.id === job.taskId)
                    ?.status === 'forced'
            ) {
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
     * (DEC-27). Forced jobs take CPUs first and the policy fills the remaining
     * ones (DEC-41). Selected jobs stay on their current CPUs where possible; any remaining
     * jobs are assigned to available CPUs. It also emits the preemption,
     * cpu-on and cpu-off events of the change and ends with the
     * `findInconsistencies` check of the resulting state (DEC-12, DEC-14).
     */
    private dispatch(): void {
        const eligible = findEligibleJobs(this.state);
        // Forced current jobs bypass policy selection, without reserving idle
        // CPUs for forced tasks whose next activation has not arrived yet.
        const forcedIds = new Set(
            this.state.tasks
                .filter((tcb) => tcb.status === 'forced')
                .map((tcb) => tcb.definition.id),
        );
        const forced = eligible.filter((ref) => forcedIds.has(ref.taskId));
        const remaining = eligible.filter((ref) => !forcedIds.has(ref.taskId));
        const view = buildPolicyView(
            this.state,
            remaining,
            this.state.config.cpuCount - forced.length,
        );
        // Without candidates nothing is selected, so a lookup lacking the
        // algorithm is fine there; with candidates, construction and edits
        // have already refused an algorithm without a policy.
        const policy =
            this.resolvePolicy(this.state.config.algorithm) ??
            (eligible.length === 0 ? NO_WORK_POLICY : undefined);
        if (policy === undefined) {
            throw new Error(
                `No scheduling policy is registered for algorithm ${this.state.config.algorithm}.`,
            );
        }
        const decision = policy.select(view);
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
        const selected = [...forced, ...copied.map(toCandidate)];
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
     * recorded step is never overwritten: the recorded future is reached with
     * forward() (DEC-36), and only an accepted edit discards it (DEC-39).
     */
    private executionGuard(): ExecutionGuardResult {
        if (this.history.isBehind) {
            return {
                ready: false,
                reason: `O passo ${this.history.cursor + 1} já foi calculado; use forward() em vez de tick().`,
            };
        }
        return { ready: true };
    }

    /**
     * Validates all required inputs before creating any live simulator state.
     * The configuration is checked before the policy source, and its
     * rejection keeps each issue's field and task index (DEC-15). With no
     * source, only a configuration without tasks runs (on the policy that
     * selects nothing). A lookup must hold a policy for the configured
     * algorithm when there are tasks, with the factory's message (DEC-25).
     */
    private validateDependencies(
        config: SystemConfig,
        source: PolicySource | undefined,
    ): {
        config: SystemConfig;
        resolvePolicy: (algorithm: AlgorithmId) => SchedulingPolicy | undefined;
    } {
        const validConfig = requireValidConfig(config);
        if (source === undefined) {
            if (validConfig.tasks.length > 0) {
                throw new TypeError(
                    'A scheduling policy is required when tasks are configured.',
                );
            }
            return { config: validConfig, resolvePolicy: () => NO_WORK_POLICY };
        }
        if (hasSelect(source)) {
            return { config: validConfig, resolvePolicy: () => source };
        }
        if (
            typeof source !== 'object' ||
            source === null ||
            !('policies' in source) ||
            typeof source.policies !== 'object' ||
            source.policies === null
        ) {
            throw new TypeError(MISSING_SELECT);
        }
        const policies = source.policies;
        if (Object.values(policies).some((policy) => !hasSelect(policy))) {
            throw new TypeError(MISSING_SELECT);
        }
        const resolvePolicy = (algorithm: AlgorithmId) =>
            Object.hasOwn(policies, algorithm)
                ? policies[algorithm]
                : undefined;
        if (
            validConfig.tasks.length > 0 &&
            resolvePolicy(validConfig.algorithm) === undefined
        ) {
            throw new TypeError(
                `No scheduling policy is registered for algorithm ${validConfig.algorithm}.`,
            );
        }
        return { config: validConfig, resolvePolicy };
    }

    /**
     * Adds every activation due at this boundary. Jobs keep their own identity
     * and deadline; the task's finite activation count comes from DEC-09.
     */
    private activateDueJobs(): void {
        for (const tcb of this.state.tasks) {
            if (tcb.status === 'concluded') continue;
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
