import { CpuManager } from './cpu';
import { Task } from './task';

export class SimulationSnapshot {
  constructor(public readonly clock: number) {}
}

export class Simulator {
  private clock: number;
  private cpuManager: CpuManager;
  private tasks: Task[];
  private snapshotHistory: SimulationSnapshot[];

  constructor() {
    this.clock = 0;
    this.cpuManager = new CpuManager();
    this.tasks = [];
    this.snapshotHistory = [];
    this.recordSnapshot();
  }

  private tick(): void {
    this.clock++;
    this.recordSnapshot();
  }

  public getLatestSnapshot(): SimulationSnapshot {
    const latestSnapshot = this.snapshotHistory.at(-1);

    if (!latestSnapshot) {
      throw new Error('Snapshot history is empty');
    }

    return latestSnapshot;
  }

  private recordSnapshot(): void {
    this.snapshotHistory.push(new SimulationSnapshot(this.clock));
  }
}
