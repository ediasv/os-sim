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
import { validateConfig } from './config';
import {
    buildPolicyView,
    checkDecision,
    selectedRefs,
    type SchedulingPolicy,
} from './policy';
import { createInitialState, takeSnapshot } from './snapshot';
import { key } from './helpers/key';

export interface ExecutionGuardResult {
    ready: boolean;
    reason?: string;
}

/**
 * Owns the live simulation state and publishes immutable snapshots of it.
 * Activations are processed at each boundary, eligible jobs are selected
 * globally by an injected policy, and quantum handling belongs to #14.
 */
export class Simulator {
    private readonly state: SimulationState;
    private readonly policy: SchedulingPolicy | undefined;
    private snapshotHistory: SimulationSnapshot[] = [];

    constructor(
        config: SystemConfig = DEFAULT_CONFIG,
        policy?: SchedulingPolicy,
    ) {
        const result = validateConfig(config);
        if (!result.ok) {
            throw new Error(
                result.issues.map((issue) => issue.message).join('\n'),
            );
        }
        if (policy === undefined && result.config.tasks.length > 0) {
            throw new Error(
                'A scheduling policy is required when the configuration has tasks.',
            );
        }
        this.state = createInitialState(result.config);
        this.policy = policy;
        this.activateDueJobs();
        this.dispatch();
        this.recordSnapshot();
    }

    public tick(): void {
        const guardResult = this.executionGuard();
        if (!guardResult.ready) {
            throw new Error(guardResult.reason);
        }

        this.executeTick();
        this.state.clock++;
        this.completeJobsAndRecordDeadlineMisses();
        this.activateDueJobs();
        this.dispatch();
        this.recordSnapshot();
    }

    /** Returns the current jobs allowed to run, without exposing live state. */
    public getEligibleJobs(): readonly JobRef[] {
        return findEligibleJobs(this.state);
    }

    public getLatestSnapshot(): SimulationSnapshot {
        const latestSnapshot = this.snapshotHistory.at(-1);

        if (!latestSnapshot) {
            throw new Error('Snapshot history is empty');
        }

        return latestSnapshot;
    }

    private recordSnapshot(): void {
        this.snapshotHistory.push(takeSnapshot(this.state));
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
                previous.cpuId === cpu.id &&
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

    /** Completes work before checking deadlines at the new boundary (DEC-04). */
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
     * Validates one global policy decision, keeps selected jobs on their current
     * CPUs where possible, then assigns any remaining jobs to available CPUs.
     */
    private dispatch(): void {
        const eligible = findEligibleJobs(this.state);
        const view = buildPolicyView(this.state, eligible);
        const decision = this.policy?.select(view) ?? { selected: [] };
        const issues = checkDecision(view, decision);
        if (issues.length > 0) {
            throw new Error(
                `Invalid scheduling policy decision:\n${issues.join('\n')}`,
            );
        }

        const selected = selectedRefs(decision);
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
                if (cpu.offSince === null) {
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

    private executionGuard(): ExecutionGuardResult {
        return { ready: true };
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
