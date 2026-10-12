import { describe, expect, it } from "vitest";
import { SimulationSnapshot, Simulator } from "./simulator";

describe("Simulator", () => {
  it("starts with an initial snapshot at tick 0", () => {
    const snapshot = new Simulator().getLatestSnapshot();
    expect(snapshot).toEqual(new SimulationSnapshot(0));
  });
});
