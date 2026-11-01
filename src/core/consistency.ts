/**
 * Cross-checks facts that the domain records twice (DEC-12): a running job is
 * marked both in `Job.state` and in `CpuState.running`, a missed deadline both
 * in `Job.deadlineMissed` and as a `deadline-miss` event, and a CPU that is off
 * both in `CpuState.offSince` and as its open `cpu-off` interval (DEC-21). The
 * engine runs this check after every dispatch and rejects the step on any
 * issue (DEC-14); engine tests also assert an empty list after every step.
 * It also rejects a CPU that runs a job while off, a malformed
 * `cpu-off`/`cpu-on` sequence, and a job that ran past its duration (which
 * would have caught a half-applied step re-executing completed jobs). Task
 * status is cross-checked too (DEC-43): forced tasks within the CPU count and
 * owning a CPU for their oldest unfinished job, no CPU running a suspended or
 * concluded task, interrupted jobs only in concluded tasks, and no open job
 * left in a concluded task.
 */
import {
    maxJobs,
    type DeepReadonly,
    type Job,
    type SimulationState,
} from './domain';
import {
    CpuEventSequenceError,
    summarizeCpuOff,
    type CpuOffSummary,
} from './cpuOff';
import { key } from './helpers/key';

/** Describes every pair that disagrees; an empty list means the state is consistent. */
export function findInconsistencies(
    state: DeepReadonly<SimulationState>,
): string[] {
    const issues: string[] = [];
    if (
        state.cpus.length !== state.config.cpuCount ||
        state.cpus.some((cpu, index) => cpu.id !== index + 1)
    ) {
        issues.push(
            'Current CPU IDs must be 1..cpuCount and match the configured count.',
        );
    }
    if (
        !Number.isSafeInteger(state.maxTaskId) ||
        state.tasks.some((tcb) => tcb.definition.id > state.maxTaskId)
    ) {
        issues.push(
            `The highest used task ID (${state.maxTaskId}) must be an integer not below any task ID.`,
        );
    }
    const statuses: readonly string[] = [
        'ready',
        'forced',
        'suspended',
        'concluded',
    ];
    for (const tcb of state.tasks) {
        const id = tcb.definition.id;
        if (!statuses.includes(tcb.status)) {
            issues.push(
                `Task ${id} has an unknown status ${JSON.stringify(tcb.status)}.`,
            );
        }
        const limit = maxJobs(tcb.definition);
        const last = tcb.jobs[tcb.jobs.length - 1];
        if (tcb.jobs.length === limit) {
            if (tcb.nextActivation !== null) {
                issues.push(
                    `Task ${id} activated all ${limit} jobs but still has next activation ${tcb.nextActivation}.`,
                );
            }
        } else if (tcb.status !== 'concluded') {
            if (tcb.nextActivation === null) {
                issues.push(
                    `Task ${id} has ${tcb.jobs.length} of ${limit} jobs but no next activation.`,
                );
            } else if (
                last !== undefined &&
                tcb.nextActivation <= last.activation
            ) {
                issues.push(
                    `Task ${id} next activation ${tcb.nextActivation} is not after its last job activation ${last.activation}.`,
                );
            }
        }
        for (const job of tcb.jobs) {
            if (job.state === 'interrupted' && tcb.status !== 'concluded') {
                issues.push(
                    `Job ${key(job)} is interrupted but task ${id} is not concluded.`,
                );
            }
            if (
                tcb.status === 'concluded' &&
                job.state !== 'completed' &&
                job.state !== 'interrupted'
            ) {
                issues.push(
                    `Task ${id} is concluded but job ${key(job)} is ${job.state}.`,
                );
            }
        }
    }
    const forced = state.tasks.filter((tcb) => tcb.status === 'forced');
    // A finished forced task can never use a CPU, so it does not count (DEC-43).
    const activeForced = forced.filter(
        (tcb) =>
            tcb.jobs.length !== maxJobs(tcb.definition) ||
            tcb.jobs.some((job) => job.state !== 'completed'),
    );
    if (activeForced.length > state.config.cpuCount) {
        issues.push(
            `There are ${activeForced.length} forced tasks for ${state.config.cpuCount} CPUs.`,
        );
    }
    const jobs = new Map<string, DeepReadonly<Job>>();
    for (const tcb of state.tasks) {
        for (const job of tcb.jobs) {
            jobs.set(key(job), job);
            if (job.executed > job.duration) {
                issues.push(
                    `Job ${key(job)} executed ${job.executed} ticks, more than its duration of ${job.duration}.`,
                );
            }
        }
    }

    // A job runs on at most one CPU per tick, and only while its state says so.
    const ownerByJob = new Map<string, number>();
    for (const cpu of state.cpus) {
        if (cpu.running === null) {
            continue;
        }
        const task = state.tasks.find(
            (tcb) => tcb.definition.id === cpu.running!.taskId,
        );
        if (task?.status === 'suspended' || task?.status === 'concluded') {
            issues.push(
                `CPU ${cpu.id} runs task ${task.definition.id}, whose status is ${task.status}.`,
            );
        }
        const ref = key(cpu.running);
        const job = jobs.get(ref);
        const owner = ownerByJob.get(ref);
        if (job === undefined) {
            issues.push(`CPU ${cpu.id} runs job ${ref}, which does not exist.`);
        } else if (job.state !== 'running') {
            issues.push(
                `CPU ${cpu.id} runs job ${ref}, whose state is ${job.state}.`,
            );
        }
        if (owner === undefined) {
            ownerByJob.set(ref, cpu.id);
        } else {
            issues.push(`Job ${ref} runs on CPUs ${owner} and ${cpu.id}.`);
        }
    }
    for (const [ref, job] of jobs) {
        if (job.state === 'running' && !ownerByJob.has(ref)) {
            issues.push(`Job ${ref} is running but no CPU owns it.`);
        }
    }

    // Only the oldest unfinished activation must own a CPU when forced.
    for (const tcb of forced) {
        const current = tcb.jobs.find(
            (job) => job.state !== 'completed' && job.state !== 'interrupted',
        );
        if (current !== undefined && !ownerByJob.has(key(current))) {
            issues.push(`Forced job ${key(current)} has no CPU.`);
        }
    }

    // A missed deadline is recorded exactly once per job (DEC-04).
    const missesByJob = new Map<string, number>();
    for (const event of state.events) {
        if (event.kind === 'deadline-miss') {
            const ref = key(event.job);
            missesByJob.set(ref, (missesByJob.get(ref) ?? 0) + 1);
        }
    }
    for (const ref of missesByJob.keys()) {
        if (!jobs.has(ref)) {
            issues.push(
                `Deadline miss recorded for job ${ref}, which does not exist.`,
            );
        }
    }
    for (const [ref, job] of jobs) {
        const count = missesByJob.get(ref) ?? 0;
        const expected = job.deadlineMissed ? 1 : 0;
        if (count !== expected) {
            issues.push(
                `Job ${ref} has deadlineMissed = ${job.deadlineMissed} but ${count} deadline-miss event(s).`,
            );
        }
    }

    // An off CPU runs nothing, and offSince starts its open off interval (DEC-21).
    for (const cpu of state.cpus) {
        if (cpu.running !== null && cpu.offSince !== null) {
            issues.push(
                `CPU ${cpu.id} runs job ${key(cpu.running)} but is off since ${cpu.offSince}.`,
            );
        }
    }
    let summaries: CpuOffSummary[] | undefined;
    try {
        summaries = summarizeCpuOff(state);
    } catch (error) {
        if (!(error instanceof CpuEventSequenceError)) {
            throw error;
        }
        issues.push(error.message);
    }
    // Without valid intervals there is no open interval to compare offSince to.
    if (summaries !== undefined) {
        const byId = new Map(
            summaries.map((summary) => [summary.cpuId, summary]),
        );
        for (const cpu of state.cpus) {
            const summary = byId.get(cpu.id);
            if (summary === undefined) {
                issues.push(`CPU ${cpu.id} has no off-summary.`);
                continue;
            }
            const last = summary.intervals.at(-1);
            if (last?.end !== null) {
                if (cpu.offSince !== null) {
                    issues.push(
                        `CPU ${cpu.id} has offSince = ${cpu.offSince} but no open off interval.`,
                    );
                }
            } else if (cpu.offSince !== last.start) {
                issues.push(
                    `CPU ${cpu.id} has offSince = ${cpu.offSince} but its open off interval starts at ${last.start}.`,
                );
            }
        }
    }

    return issues;
}
