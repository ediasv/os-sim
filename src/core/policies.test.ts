import { describe, expect, it } from 'vitest';
import type { Job, JobRef, TaskDefinition } from './domain';
import { key } from './helpers/key';
import { DEFAULT_POLICIES, edfPolicy, rmPolicy } from './policies';
import type { PolicyCandidate, PolicyView } from './policy';

function task(
    id: number,
    period: number,
    deadline = 10,
    duration = 2,
): TaskDefinition {
    return {
        id,
        color: '000000',
        arrival: 0,
        duration,
        period,
        deadline,
        rawEvents: '',
    };
}

function cand(
    t: TaskDefinition,
    absoluteDeadline: number,
    extra: {
        activation?: number;
        previousCpu?: number | null;
        executed?: number;
    } = {},
): PolicyCandidate {
    const job: Job = {
        taskId: t.id,
        index: 0,
        activation: extra.activation ?? 0,
        absoluteDeadline,
        executed: extra.executed ?? 0,
        state: 'ready',
        completedAt: null,
        deadlineMissed: false,
    };
    return { job, task: t, previousCpu: extra.previousCpu ?? null };
}

function view(cpuCount: number, candidates: PolicyCandidate[]): PolicyView {
    return { clock: 0, cpuCount, candidates };
}

/** The whole decision as sorted job keys, so tests can compare it exactly. */
function decide(
    v: PolicyView,
    policy = rmPolicy,
): { selected: string[]; tie?: { candidates: string[]; slots: number } } {
    const { selected, tie } = policy.select(v);
    const keys = (refs: readonly JobRef[]) => refs.map(key).sort();
    return tie === undefined
        ? { selected: keys(selected) }
        : {
              selected: keys(selected),
              tie: { candidates: keys(tie.candidates), slots: tie.slots },
          };
}

function ids(v: PolicyView, policy = rmPolicy): number[] {
    return policy
        .select(v)
        .selected.map((s) => s.taskId)
        .sort((a, b) => a - b);
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

    it('ranks several aperiodic tasks below a periodic one (DEC-17)', () => {
        const ap1 = cand(task(4, 0), 1);
        const ap2 = cand(task(5, 0), 2);
        const slow = cand(task(1, 1000), 1000);
        expect(ids(view(1, [ap1, ap2, slow]))).toEqual([1]);
        expect(ids(view(1, [slow, ap2, ap1]))).toEqual([1]);
    });

    it('selects every tied job when the tie does not cross the CPU cut', () => {
        const x = cand(task(1, 5), 5);
        const y = cand(task(2, 5), 5);
        const slow = cand(task(3, 50), 50);
        expect(decide(view(2, [slow, x, y]))).toEqual({
            selected: ['1.0', '2.0'],
        });
        expect(decide(view(2, [y, slow, x]))).toEqual({
            selected: ['1.0', '2.0'],
        });
    });

    describe('tie-breaks among equal periods (DEC-16, DEC-18)', () => {
        it('criterion 1: keeps the job that was running', () => {
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 5), 10, { previousCpu: 1 });
            expect(decide(view(1, [x, y]))).toEqual({ selected: ['2.0'] });
        });

        it('criterion 2: earlier absolute deadline', () => {
            const x = cand(task(1, 5), 9);
            const y = cand(task(2, 5), 8);
            expect(decide(view(1, [x, y]))).toEqual({ selected: ['2.0'] });
        });

        it('criterion 3: earlier activation', () => {
            const x = cand(task(1, 5), 10, { activation: 1 });
            const y = cand(task(2, 5), 10, { activation: 0 });
            expect(decide(view(1, [x, y]))).toEqual({ selected: ['2.0'] });
        });

        it('criterion 4: shorter task duration', () => {
            const x = cand(task(1, 5, 10, 2), 10);
            const y = cand(task(2, 5, 10, 1), 10);
            expect(decide(view(1, [x, y]))).toEqual({ selected: ['2.0'] });
        });

        it('criterion 4: shorter task duration even with more work left (DEC-16)', () => {
            // Remaining work would pick task 1 (4 - 3 = 1 < 2); DEC-16 discards it.
            const x = cand(task(1, 5, 10, 4), 10, { executed: 3 });
            const y = cand(task(2, 5, 10, 2), 10);
            expect(decide(view(1, [x, y]))).toEqual({ selected: ['2.0'] });
        });

        it('applies the criteria in order', () => {
            const running = cand(task(1, 5, 10, 3), 9, {
                activation: 1,
                previousCpu: 1,
            });
            const better = cand(task(2, 5, 10, 1), 8, { activation: 0 });
            expect(decide(view(1, [better, running]))).toEqual({
                selected: ['1.0'],
            });
        });

        it('reports a residual tie across the cut instead of choosing', () => {
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 5), 10);
            expect(decide(view(1, [x, y]))).toEqual({
                selected: [],
                tie: { candidates: ['1.0', '2.0'], slots: 1 },
            });
        });

        it('reports only the tied part of the cut', () => {
            const better = cand(task(3, 2), 10);
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 5), 10);
            expect(decide(view(2, [x, better, y]))).toEqual({
                selected: ['3.0'],
                tie: { candidates: ['1.0', '2.0'], slots: 1 },
            });
        });

        it('reports three jobs tied for two CPUs', () => {
            const tied = [1, 2, 3].map((id) => cand(task(id, 5), 10));
            expect(decide(view(2, tied))).toEqual({
                selected: [],
                tie: { candidates: ['1.0', '2.0', '3.0'], slots: 2 },
            });
        });

        it('leaves worse jobs out of the tie', () => {
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 5), 10);
            const worse = cand(task(3, 5), 11);
            expect(decide(view(1, [worse, x, y]))).toEqual({
                selected: [],
                tie: { candidates: ['1.0', '2.0'], slots: 1 },
            });
        });

        it('keeps the whole tied run between better and worse jobs', () => {
            const better = cand(task(5, 2), 10);
            const tied = [1, 2, 3].map((id) => cand(task(id, 5), 10));
            const worse = cand(task(4, 9), 10);
            expect(decide(view(2, [worse, ...tied, better]))).toEqual({
                selected: ['5.0'],
                tie: { candidates: ['1.0', '2.0', '3.0'], slots: 1 },
            });
        });
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

    describe('tie-breaks among equal deadlines (DEC-16, DEC-18)', () => {
        it('criterion 1: keeps the job that was running', () => {
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 50), 10, { previousCpu: 2 });
            expect(decide(view(1, [x, y]), edfPolicy)).toEqual({
                selected: ['2.0'],
            });
        });

        it('criterion 2 never separates an EDF tie, so activation decides (DEC-16)', () => {
            const x = cand(task(1, 5), 10, { activation: 2 });
            const y = cand(task(2, 50), 10, { activation: 1 });
            expect(decide(view(1, [x, y]), edfPolicy)).toEqual({
                selected: ['2.0'],
            });
        });

        it('criterion 4: shorter task duration', () => {
            const x = cand(task(1, 5, 10, 3), 10);
            const y = cand(task(2, 50, 10, 1), 10);
            expect(decide(view(1, [x, y]), edfPolicy)).toEqual({
                selected: ['2.0'],
            });
        });

        it('criterion 4: shorter task duration even with more work left (DEC-16)', () => {
            // Remaining work would pick task 1 (4 - 3 = 1 < 2); DEC-16 discards it.
            const x = cand(task(1, 5, 10, 4), 10, { executed: 3 });
            const y = cand(task(2, 5, 10, 2), 10);
            expect(decide(view(1, [x, y]), edfPolicy)).toEqual({
                selected: ['2.0'],
            });
        });

        it('reports a residual tie across the cut instead of choosing', () => {
            const x = cand(task(1, 5), 10);
            const y = cand(task(2, 50), 10);
            expect(decide(view(1, [x, y]), edfPolicy)).toEqual({
                selected: [],
                tie: { candidates: ['1.0', '2.0'], slots: 1 },
            });
        });
    });
});

describe('DEFAULT_POLICIES', () => {
    it('maps each algorithm id to its policy', () => {
        expect(Object.keys(DEFAULT_POLICIES).sort()).toEqual(['EDF', 'RM']);
        expect(DEFAULT_POLICIES.RM).toBe(rmPolicy);
        expect(DEFAULT_POLICIES.EDF).toBe(edfPolicy);
        expect(Object.isFrozen(DEFAULT_POLICIES)).toBe(true);
    });
});
