import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './domain';
import { Simulator } from './simulator';

describe('Simulator', () => {
    it('publishes snapshot 0 built from the default configuration', () => {
        const snapshot = new Simulator().getLatestSnapshot();

        expect(snapshot.clock).toBe(0);
        expect(snapshot.config).toEqual(DEFAULT_CONFIG);
        expect(snapshot.cpus.map((cpu) => cpu.id)).toEqual([1]);
        expect(snapshot.tasks).toEqual([]);
    });

    it('advances the clock by exactly one tick per step (DEC-11)', () => {
        const sim = new Simulator();
        sim.tick();
        sim.tick();
        expect(sim.getLatestSnapshot().clock).toBe(2);
    });

    it('keeps earlier snapshots unchanged and frozen after later ticks', () => {
        const sim = new Simulator();
        const first = sim.getLatestSnapshot();

        sim.tick();

        expect(first.clock).toBe(0);
        expect(Object.isFrozen(first)).toBe(true);
        expect(sim.getLatestSnapshot()).not.toBe(first);
    });
});
