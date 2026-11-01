import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationSnapshot } from '../core/domain';

vi.mock('../core/eligibility', () => ({ findEligibleJobs: vi.fn(() => []) }));
vi.mock('../core/cpuOff', () => ({ summarizeCpuOff: vi.fn(() => []) }));

const { findEligibleJobs } = await import('../core/eligibility');
const { summarizeCpuOff } = await import('../core/cpuOff');
const { cpuOffSummary, eligibleJobs } = await import('./snapshotQueries');

const snapshot = () => ({}) as unknown as SimulationSnapshot;

describe('snapshotQueries', () => {
    beforeEach(() => {
        vi.mocked(findEligibleJobs).mockClear();
        vi.mocked(summarizeCpuOff).mockClear();
    });

    it('asks the core once per snapshot object and returns the same result', () => {
        const one = snapshot();

        const first = eligibleJobs(one);
        const second = eligibleJobs(one);
        cpuOffSummary(one);
        cpuOffSummary(one);

        expect(second).toBe(first);
        expect(findEligibleJobs).toHaveBeenCalledTimes(1);
        expect(summarizeCpuOff).toHaveBeenCalledTimes(1);
    });

    it('asks again for a different snapshot', () => {
        eligibleJobs(snapshot());
        eligibleJobs(snapshot());

        expect(findEligibleJobs).toHaveBeenCalledTimes(2);
    });
});
