export type AlgorithmID = 'RR' | 'EDF';

export type Scheduler = (tasks: any, cpus: any) => {};

export type SchedulerAlgorithmMap = Map<AlgorithmID, Scheduler>;
