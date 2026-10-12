export interface SimulationSnapshot {
  readonly clock: number;
}

export class Simulator {
  private clock: number = 0;

  tick(): void {
    this.clock += 1;
  }

  snapshot(): SimulationSnapshot {
    return { clock: this.clock };
  }
}
