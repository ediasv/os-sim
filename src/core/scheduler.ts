import { Cpu } from './simulator';
import { Task } from './task';

export type AlgorithmId = 'RM' | 'EDF';

export type SchedulerMap = Map<AlgorithmId, Scheduler>;

export interface Scheduler {
    execute(tasks: Task[]): Task[]; // returns the tasks that are going to be executed
}

export class RateMonotonic implements Scheduler {
    public execute(tasks: Task[]): Task[] {
        return tasks;
    }
}

export class EarliestDeadlineFirst implements Scheduler {
    public execute(tasks: Task[]): Task[] {
        return tasks;
    }
}
