/**
 * Simulator rules live here, free of Vue, Electron and Node.
 * The UI never holds a Simulator directly; it reads snapshots.
 */
export interface SimulationSnapshot {
  readonly tick: number;
}

export class Simulator {
  #tick = 0;

  step(): void {
    this.#tick += 1;
  }

  snapshot(): SimulationSnapshot {
    return { tick: this.#tick };
  }
}
