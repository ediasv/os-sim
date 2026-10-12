import { Cpu } from "./simulator";
import { Task } from "./task";

export type AlgorithmId = "RM" | "EDF";

export interface Scheduler {
  execute(tasks: Task[], cpus: Cpu[]): any; // returns the tasks that are going to be executed
}

export type SchedulerMap = Map<AlgorithmId, Scheduler>;

export class RateMonotonic implements Scheduler {
  public execute(tasks: Task[], cpus: Cpu[]) {}
}

export class EarliestDeadlineFirst implements Scheduler {
  public execute(tasks: Task[], cpus: Cpu[]) {}
}
