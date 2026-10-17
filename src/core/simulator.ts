import {
    DEFAULT_CONFIG,
    maxJobs,
    type Job,
    type JobRef,
    type SimulationSnapshot,
    type SimulationState,
    type SystemConfig,
} from './domain';
import { findEligibleJobs } from './eligibility';
import { validateConfig } from './config';
import { createInitialState, takeSnapshot } from './snapshot';

export interface ExecutionGuardResult {
    ready: boolean;
    reason?: string;
}

/**
 * Owns the live simulation state and publishes immutable snapshots of it.
 * Activations are processed at each boundary; dispatch and execution are
 * separate engine increments (#13-15).
 */
export class Simulator {
    private readonly state: SimulationState;
    private snapshotHistory: SimulationSnapshot[] = [];

    constructor(config: SystemConfig = DEFAULT_CONFIG) {
        const result = validateConfig(config);
        if (!result.ok) {
            throw new Error(
                result.issues.map((issue) => issue.message).join('\n'),
            );
        }
        this.state = createInitialState(result.config);
        this.activateDueJobs();
        this.recordSnapshot();
    }

    public tick(): void {
        const guardResult = this.executionGuard();
        if (!guardResult.ready) {
            throw new Error(guardResult.reason);
        }

        this.state.clock++;
        this.activateDueJobs();
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
