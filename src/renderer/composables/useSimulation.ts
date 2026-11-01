import { shallowRef, type ShallowRef } from 'vue';
import type { SimulationSnapshot, SystemConfig } from '../../core/domain';
import { createSimulator } from '../../core/createSimulator';
import { DEFAULT_POLICIES, type PolicyRegistry } from '../../core/policies';
import { Simulator } from '../../core/simulator';
import { commandFailure, type CommandResult } from '../errors';

/**
 * Bridges the plain core Simulator into Vue (DEC-23). The instance stays
 * private and only frozen snapshots are published; Vue only tracks `view`
 * being replaced, so it never wraps simulator internals in proxies. `view`
 * is always the snapshot at the history cursor (DEC-36).
 * Commands never throw: they return a result classified by DEC-24, and a
 * failure leaves the simulation and `view` unchanged. Edits during the run
 * (#25/#26) will follow the same contract.
 *
 * Loaded simulations run the policy that `policies` registers for the
 * configured algorithm (DEC-25); production uses the built-in registry and
 * tests pass their own. The initial empty simulation never fails.
 */
export function useSimulation(policies: PolicyRegistry = DEFAULT_POLICIES): {
    view: ShallowRef<SimulationSnapshot>;
    load: (config: SystemConfig) => CommandResult;
    tick: () => CommandResult;
    forward: () => CommandResult;
    backward: () => CommandResult;
    next: () => CommandResult;
} {
    let sim = new Simulator();
    const view = shallowRef(sim.getCurrentSnapshot());

    /** Runs a simulator command and publishes the cursor's snapshot on success. */
    function run(command: () => void): CommandResult {
        try {
            command();
        } catch (error) {
            return commandFailure(error);
        }
        view.value = sim.getCurrentSnapshot();
        return { ok: true };
    }

    /**
     * Rebuilds the simulation at t=0 for a whole new configuration. The new
     * instance is built before the current one is dropped, so a rejected
     * configuration keeps the running simulation.
     */
    function load(config: SystemConfig): CommandResult {
        let next: Simulator;
        try {
            next = createSimulator(config, policies);
        } catch (error) {
            return commandFailure(error);
        }
        sim = next;
        view.value = sim.getCurrentSnapshot();
        return { ok: true };
    }

    /** Computes a new step; on failure `view` keeps the last valid snapshot (DEC-14). */
    const tick = (): CommandResult => run(() => sim.tick());

    /** Shows the next recorded step without recomputing it. */
    const forward = (): CommandResult => run(() => sim.forward());

    const backward = (): CommandResult => run(() => sim.backward());

    /**
     * The single "next" action of the interface (#36): reuses the recorded
     * step when there is one ahead, otherwise computes a new one.
     */
    const next = (): CommandResult =>
        run(() =>
            sim.getCursor() < sim.getLatestSnapshot().clock
                ? sim.forward()
                : sim.tick(),
        );

    return { view, load, tick, forward, backward, next };
}
