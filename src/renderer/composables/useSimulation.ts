import { shallowRef, type ShallowRef } from 'vue';
import type { SimulationSnapshot, SystemConfig } from '../../core/domain';
import type { SchedulingPolicy } from '../../core/policy';
import { Simulator } from '../../core/simulator';
import { commandFailure, type CommandResult } from '../errors';

/**
 * Bridges the plain core Simulator into Vue (DEC-23). The instance stays
 * private and only frozen snapshots are published; Vue only tracks `view`
 * being replaced, so it never wraps simulator internals in proxies.
 * Commands never throw: they return a result classified by DEC-24, and a
 * failure leaves the simulation and `view` unchanged. Edits during the run
 * (#25/#26) will follow the same contract.
 */
export function useSimulation(): {
    view: ShallowRef<SimulationSnapshot>;
    load: (config: SystemConfig, policy?: SchedulingPolicy) => CommandResult;
    tick: () => CommandResult;
} {
    let sim = new Simulator();
    const view = shallowRef(sim.getLatestSnapshot());

    /**
     * Rebuilds the simulation at t=0 for a whole new configuration. The new
     * instance is built before the current one is dropped, so a rejected
     * configuration keeps the running simulation.
     */
    function load(
        config: SystemConfig,
        policy?: SchedulingPolicy,
    ): CommandResult {
        let next: Simulator;
        try {
            next = new Simulator(config, policy);
        } catch (error) {
            return commandFailure(error);
        }
        sim = next;
        view.value = sim.getLatestSnapshot();
        return { ok: true };
    }

    /** Advances one tick; on failure `view` keeps the last valid snapshot (DEC-14). */
    function tick(): CommandResult {
        try {
            sim.tick();
        } catch (error) {
            return commandFailure(error);
        }
        view.value = sim.getLatestSnapshot();
        return { ok: true };
    }

    return { view, load, tick };
}
