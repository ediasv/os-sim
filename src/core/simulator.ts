import { Scheduler } from './scheduler';
import { Task } from './task';

export interface SimulationSnapshot {
    clock: number;
}

export interface Cpu {
    id: number;
}

export interface ExecutionGuardResult {
    ready: boolean;
    reason?: string;
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
            throw new Error('Snapshot history is empty');
        }

        return latestSnapshot;
    }

    private recordSnapshot(): void {
        const newSnapshot = {
            clock: this.clock,
        };

        this.snapshotHistory.push(newSnapshot);
    }

    private executionGuard(): ExecutionGuardResult {
        return { ready: true };
    }
}
