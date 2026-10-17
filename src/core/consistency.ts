/**
 * Cross-checks facts that the domain records twice (DEC-12): a running job is
 * marked both in `Job.state` and in `CpuState.running`, a missed deadline
 * both in `Job.deadlineMissed` and as a `deadline-miss` event, and a CPU that
 * is off both in `CpuState.offSince` and as its open `cpu-off` interval
 * (DEC-19). The engine must
 * keep each pair in sync; its tests (#13, #15) assert that this list is empty
 * after every step. It also checks that no job ran past its duration, which
 * would have caught a half-applied step re-executing completed jobs.
 */
import type { DeepReadonly, Job, SimulationState } from './domain';
import { summarizeCpuOff, type CpuOffInterval } from './cpuOff';
import { key } from './helpers/key';

/** Describes every pair that disagrees; an empty list means the state is consistent. */
export function findInconsistencies(
    state: DeepReadonly<SimulationState>,
): string[] {
    const issues: string[] = [];
    const jobs = new Map<string, DeepReadonly<Job>>();
    for (const tcb of state.tasks) {
        for (const job of tcb.jobs) {
            jobs.set(key(job), job);
            if (job.executed > tcb.definition.duration) {
                issues.push(
                    `Job ${key(job)} executed ${job.executed} ticks, more than its duration of ${tcb.definition.duration}.`,
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

    // An off CPU runs nothing, and offSince starts its open off interval (DEC-19).
    for (const cpu of state.cpus) {
        if (cpu.running !== null && cpu.offSince !== null) {
            issues.push(
                `CPU ${cpu.id} runs job ${key(cpu.running)} but is off since ${cpu.offSince}.`,
            );
        }
    }
    let openIntervals: Map<number, CpuOffInterval | undefined>;
    try {
        openIntervals = new Map(
            summarizeCpuOff(state).map(({ cpuId, intervals }) => [
                cpuId,
                intervals.find(({ end }) => end === null),
            ]),
        );
    } catch (error) {
        issues.push((error as Error).message);
        return issues;
    }
    for (const cpu of state.cpus) {
        const open = openIntervals.get(cpu.id);
        if (open === undefined) {
            if (cpu.offSince !== null) {
                issues.push(
                    `CPU ${cpu.id} has offSince = ${cpu.offSince} but no open off interval.`,
                );
            }
        } else if (cpu.offSince !== open.start) {
            issues.push(
                `CPU ${cpu.id} has offSince = ${cpu.offSince} but its open off interval starts at ${open.start}.`,
            );
        }
    }

    return issues;
}
