import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../core/domain';
import type { SchedulingPolicy } from '../../core/policy';
import { useSimulation } from './useSimulation';

const selectNothing: SchedulingPolicy = {
    select: () => ({ selected: [] }),
};

describe('useSimulation', () => {
    it('does not create a simulator until config and policy are provided', () => {
        const simulation = useSimulation();

        expect(simulation.view.value).toBeNull();
        expect(() => simulation.tick()).toThrow(/scheduling policy first/);

        simulation.start(DEFAULT_CONFIG, selectNothing);
        expect(simulation.view.value?.clock).toBe(0);

        simulation.tick();
        expect(simulation.view.value?.clock).toBe(1);
    });
});
