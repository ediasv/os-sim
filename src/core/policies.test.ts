import { describe, expect, it } from 'vitest';
import type { Job, TaskDefinition } from './domain';
import { edfPolicy, policyFor, rmPolicy } from './policies';
import type { PolicyCandidate, PolicyView } from './policy';

function task(id: number, period: number, deadline = 10): TaskDefinition {
    return {
        id,
        color: '000000',
        arrival: 0,
        duration: 2,
        period,
        deadline,
        rawEvents: '',
    };
}

function cand(t: TaskDefinition, absoluteDeadline: number): PolicyCandidate {
    const job: Job = {
        taskId: t.id,
        index: 0,
        activation: 0,
        absoluteDeadline,
        executed: 0,
        state: 'ready',
        completedAt: null,
        deadlineMissed: false,
    };
    return { job, task: t, previousCpu: null };
}

function view(cpuCount: number, candidates: PolicyCandidate[]): PolicyView {
    return { clock: 0, cpuCount, candidates };
}

function ids(v: PolicyView, policy = rmPolicy): number[] {
    return policy
        .select(v)
        .selected.map((s) => s.taskId)
        .sort();
}

describe('RM', () => {
    const a = cand(task(1, 10), 10);
    const b = cand(task(2, 5), 20);
    const c = cand(task(3, 7), 5);

    it('picks the smallest period on one CPU', () => {
        expect(ids(view(1, [a, b, c]))).toEqual([2]);
    });

    it('picks the smallest periods on several CPUs, in any order', () => {
        expect(ids(view(2, [a, b, c]))).toEqual([2, 3]);
        expect(ids(view(2, [c, b, a]))).toEqual([2, 3]);
    });

    it('preempts when a higher priority job arrives', () => {
        expect(ids(view(1, [a]))).toEqual([1]);
        expect(ids(view(1, [a, b]))).toEqual([2]);
    });

    it('selects every candidate when CPUs exceed them', () => {
        expect(ids(view(4, [a, b]))).toEqual([1, 2]);
        expect(ids(view(2, []))).toEqual([]);
    });

    it('ranks aperiodic below any periodic (DEC-17)', () => {
        const aper = cand(task(4, 0), 1);
        const slow = cand(task(1, 1000), 1000);
        expect(ids(view(1, [aper, slow]))).toEqual([1]);
        expect(ids(view(2, [aper, slow, b]))).toEqual([1, 2]);
        expect(ids(view(1, [aper]))).toEqual([4]);
    });
});

describe('EDF', () => {
    const a = cand(task(1, 10), 12);
    const b = cand(task(2, 5), 20);
    const c = cand(task(3, 0), 8);

    it('picks the earliest absolute deadline on one CPU', () => {
        expect(ids(view(1, [a, b, c]), edfPolicy)).toEqual([3]);
    });

    it('picks the earliest deadlines on several CPUs, in any order', () => {
        expect(ids(view(2, [a, b, c]), edfPolicy)).toEqual([1, 3]);
        expect(ids(view(2, [c, b, a]), edfPolicy)).toEqual([1, 3]);
    });

    it('preempts when a job with an earlier deadline arrives', () => {
        expect(ids(view(1, [a]), edfPolicy)).toEqual([1]);
        expect(ids(view(1, [a, c]), edfPolicy)).toEqual([3]);
    });
});

describe('policyFor', () => {
    it('links the algorithm to its policy', () => {
        expect(policyFor('RM')).toBe(rmPolicy);
        expect(policyFor('EDF')).toBe(edfPolicy);
    });
});
