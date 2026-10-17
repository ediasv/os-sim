import { shallowRef, type ShallowRef } from 'vue';
import type { SimulationSnapshot, SystemConfig } from '../../core/domain';
import type { SchedulingPolicy } from '../../core/policy';
import { Simulator } from '../../core/simulator';

/**
 * Bridges the plain core Simulator into Vue. Vue only tracks `view`
 * being replaced, so it never wraps simulator internals in proxies. Keep no
 * simulator until configuration and a real scheduling policy are supplied.
 */
export function useSimulation(): {
    view: ShallowRef<SimulationSnapshot | null>;
    start: (config: SystemConfig, policy: SchedulingPolicy) => void;
    tick: () => void;
} {
    let sim: Simulator | null = null;
    const view = shallowRef<SimulationSnapshot | null>(null);

    function start(config: SystemConfig, policy: SchedulingPolicy): void {
        sim = new Simulator(config, policy);
        view.value = sim.getLatestSnapshot();
    }

    function tick(): void {
        if (sim === null) {
            throw new Error(
                'Start the simulation with a scheduling policy first.',
            );
        }
        sim.tick();
        view.value = sim.getLatestSnapshot();
    }

    return { view, start, tick };
}
