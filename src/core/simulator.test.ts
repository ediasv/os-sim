import { describe, expect, it } from "vitest";
import { Simulator } from "./simulator";

describe("Simulator", () => {
  it("starts at tick 0", () => {
    expect(new Simulator().snapshot().clock).toBe(0);
  });

  it("advances one tick per step", () => {
    const sim = new Simulator();
    sim.step();
    sim.step();
    expect(sim.snapshot().clock).toBe(2);
  });

  it("snapshot is a copy that later steps do not change", () => {
    const sim = new Simulator();
    const before = sim.snapshot();
    sim.step();
    expect(before.clock).toBe(0);
    expect(sim.snapshot()).not.toBe(before);
  });
});
