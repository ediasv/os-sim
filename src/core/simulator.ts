import { CpuManager } from "./cpu";
import { Task } from "./task";

export interface SimulationSnapshot {
  readonly clock: number;
}

export class Simulator {
  private clock: number;
  private cpuManager: CpuManager;
  private tasks: Task[];

  constructor() {
    this.clock = 0;
    this.cpuManager = new CpuManager();
    this.tasks = [];
  }

  public tick(): void {
    this.clock += 1;
  }

  public snapshot(): SimulationSnapshot {
    return { clock: this.clock };
  }
}
