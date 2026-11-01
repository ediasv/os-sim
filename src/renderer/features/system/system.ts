import type { CpuOffInterval } from '../../../core/cpuOff';
import { cpuOffSummary, eligibleJobs } from '../../snapshotQueries';
import type {
    DeepReadonly,
    JobRef,
    JobState,
    SimulationSnapshot,
} from '../../../core/domain';
import { key } from '../../../core/helpers/key';

/**
 * Projection of a snapshot for the system panel (FE-09). Reads the core
 * queries (`findEligibleJobs`, `summarizeCpuOff`, via `snapshotQueries`) and only groups their
 * results; it never decides eligibility, dispatch or CPU intervals. The
 * "desde t" of a running CPU is read from the execution slices, not computed
 * by a rule of its own.
 */

/**
 * A CPU is either running a job or off (FE-DEC-15). An on CPU without a job
 * does not survive a tick boundary: dispatch switches it off (DEC-21).
 */
export type SystemCpuCondition = 'running' | 'off';

export interface SystemJob {
    readonly ref: JobRef;
    readonly activation: number;
    readonly absoluteDeadline: number;
    /** Ticks of progress of this job (REQ-01), not of the current slice. */
    readonly executed: number;
    readonly duration: number;
    /** Task color without `#`, as the Gantt paints the job. */
    readonly color: string;
    readonly state: JobState;
    readonly deadlineMissed: boolean;
}

export interface SystemCpu {
    readonly id: number;
    readonly condition: SystemCpuCondition;
    /**
     * Tick since which the CPU has its condition ("desde t"): the switch-off
     * tick when off; when running, the start of the unbroken run of the
     * current job on this CPU, taken from the execution slices.
     */
    readonly since: number;
    /** Job owning the CPU at the inspected tick; null when the CPU is off. */
    readonly job: SystemJob | null;
    /** Ticks of the current slice already used (DEC-03), not job progress. */
    readonly sliceElapsed: number;
    readonly quantum: number;
    /** Off intervals in [start, end) form; `end` is null while still off. */
    readonly offIntervals: readonly CpuOffInterval[];
    readonly totalOff: number;
}

export interface SystemData {
    readonly inspectedTick: number;
    /** One row per CPU, in the order the snapshot gives them. */
    readonly cpus: readonly SystemCpu[];
    /**
     * Eligible jobs waiting for a CPU, in snapshot order (task configuration
     * order, then activation). This order is not a ranking of the policy.
     */
    readonly ready: readonly SystemJob[];
    /** Incomplete jobs that are not eligible (DEC-02), in snapshot order. */
    readonly pending: readonly SystemJob[];
}

function projectJob(
    definition: DeepReadonly<{ color: string; duration: number }>,
    job: DeepReadonly<{
        taskId: number;
        index: number;
        activation: number;
        absoluteDeadline: number;
        executed: number;
        state: JobState;
        deadlineMissed: boolean;
    }>,
): SystemJob {
    return {
        ref: { taskId: job.taskId, index: job.index },
        activation: job.activation,
        absoluteDeadline: job.absoluteDeadline,
        executed: job.executed,
        duration: definition.duration,
        color: definition.color,
        state: job.state,
        deadlineMissed: job.deadlineMissed,
    };
}

/**
 * Start of the run that keeps `ref` on `cpuId` up to the clock. Executions
 * merge unbroken ticks of the same job, so only the last slice of the CPU can
 * continue the run; any other case starts the run at the clock.
 */
function runSince(
    snapshot: DeepReadonly<SimulationSnapshot>,
    cpuId: number,
    ref: JobRef,
): number {
    for (let index = snapshot.executions.length - 1; index >= 0; index--) {
        const slice = snapshot.executions[index];
        if (slice === undefined || slice.cpuId !== cpuId) {
            continue;
        }
        const continues =
            key(slice.job) === key(ref) && slice.end === snapshot.clock;
        return continues ? slice.start : snapshot.clock;
    }
    return snapshot.clock;
}

export function projectSystem(
    snapshot: DeepReadonly<SimulationSnapshot>,
): SystemData {
    const eligibleKeys = new Set(eligibleJobs(snapshot).map((ref) => key(ref)));
    const jobs: SystemJob[] = [];
    const jobsByKey = new Map<string, SystemJob>();
    for (const tcb of snapshot.tasks) {
        for (const job of tcb.jobs) {
            const projected = projectJob(tcb.definition, job);
            jobs.push(projected);
            jobsByKey.set(key(job), projected);
        }
    }

    const offByCpu = new Map(
        cpuOffSummary(snapshot).map((summary) => [summary.cpuId, summary]),
    );
    const ownedKeys = new Set<string>();
    const cpus = snapshot.cpus.map((cpu): SystemCpu => {
        const off = offByCpu.get(cpu.id);
        if (off === undefined) {
            throw new Error(`CPU ${cpu.id} has no off summary.`);
        }

        let job: SystemJob | null = null;
        let since: number;
        if (cpu.running !== null) {
            const owned = jobsByKey.get(key(cpu.running));
            if (owned === undefined) {
                throw new Error(
                    `CPU ${cpu.id} runs ${key(cpu.running)}, which is not in the snapshot.`,
                );
            }
            job = owned;
            ownedKeys.add(key(cpu.running));
            since = runSince(snapshot, cpu.id, cpu.running);
        } else if (cpu.offSince !== null) {
            since = cpu.offSince;
        } else {
            throw new Error(
                `CPU ${cpu.id} is on without a job at tick ${snapshot.clock}.`,
            );
        }

        return {
            id: cpu.id,
            condition: job !== null ? 'running' : 'off',
            since,
            job,
            sliceElapsed: cpu.sliceElapsed,
            quantum: snapshot.config.quantum,
            offIntervals: off.intervals,
            totalOff: off.totalOff,
        };
    });

    const ready: SystemJob[] = [];
    const pending: SystemJob[] = [];
    for (const job of jobs) {
        const jobKey = key(job.ref);
        if (job.state === 'completed' || ownedKeys.has(jobKey)) {
            continue;
        }
        if (job.state === 'running') {
            throw new Error(
                `Job ${jobKey} is running but no CPU owns it in the snapshot.`,
            );
        }
        if (!eligibleKeys.has(jobKey)) {
            pending.push(job);
        } else if (job.state === 'ready') {
            ready.push(job);
        } else {
            throw new Error(
                `Job ${jobKey} is eligible in state ${job.state} outside a CPU.`,
            );
        }
    }

    return {
        inspectedTick: snapshot.clock,
        cpus,
        ready,
        pending,
    };
}
