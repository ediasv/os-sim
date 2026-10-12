import { Scheduler } from "./scheduler";
import { Task } from "./task";

export class SimulationSnapshot {
  constructor(public readonly clock: number) {}
}

export interface Cpu {
  id: number;
}

export class Simulator {
  private clock: number = 0;
  private cpus: Cpu[] = [];
  private tasks: Task[] = [];
  private scheduler: Scheduler | null = null;
  private snapshotHistory: SimulationSnapshot[] = [];

  constructor() {
    this.recordSnapshot();
  }

  public tick(): void {
    const guardResult = this.executionGuard();
    if (!guardResult.ready) {
      throw new Error(guardResult.reason);
    }

    this.clock++;
    this.scheduler?.execute(this.tasks, this.cpus);

    this.recordSnapshot();
  }

  public getLatestSnapshot(): SimulationSnapshot {
    const latestSnapshot = this.snapshotHistory.at(-1);

    if (!latestSnapshot) {
      throw new Error("Snapshot history is empty");
    }

    return latestSnapshot;
  }

  private recordSnapshot(): void {
    this.snapshotHistory.push(new SimulationSnapshot(this.clock));
  }

  private executionGuard(): { ready: boolean; reason?: string } {
    return { ready: true, reason: "not implemented" };
  }
}
