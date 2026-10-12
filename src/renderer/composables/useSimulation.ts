import { shallowRef, type ShallowRef } from "vue";
import { Simulator, type SimulationSnapshot } from "../../core/simulator";

/**
 * Bridges the plain core Simulator into Vue. Vue only tracks `view`
 * being replaced, so it never wraps simulator internals in proxies.
 */
export function useSimulation(): {
  view: ShallowRef<SimulationSnapshot>;
  step: () => void;
} {
  const sim = new Simulator();
  const view = shallowRef(sim.snapshot());

  function step(): void {
    sim.tick();
    view.value = sim.snapshot();
  }

  return { view, step };
}
