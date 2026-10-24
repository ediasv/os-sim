import { describe, expect, it } from 'vitest';
import { ConfigValidationError } from './config';
import { createSimulator } from './createSimulator';
import {
    DEFAULT_CONFIG,
    type AlgorithmId,
    type TaskDefinition,
} from './domain';
import { type PolicyRegistry, rmPolicy } from './policies';
import type { SchedulingPolicy } from './policy';
import type { Simulator } from './simulator';

function task(
    id: number,
    arrival: number,
    duration: number,
    period: number,
    deadline: number,
): TaskDefinition {
    return {
        id,
        color: id.toString(16).padStart(6, '0'),
        arrival,
        duration,
        period,
        deadline,
        rawEvents: '',
    };
}

/** Owner of CPU 1 during each of the next `ticks` ticks, as `T<id>` or `-`. */
function owners(sim: Simulator, ticks: number): string {
    const result: string[] = [];
    for (let step = 0; step < ticks; step++) {
        const running = sim.getLatestSnapshot().cpus[0].running;
        result.push(running === null ? '-' : `T${running.taskId}`);
        sim.tick();
    }
    return result.join(' ');
}

function oneCpu(
    algorithm: AlgorithmId,
    quantum: number,
    tasks: TaskDefinition[],
) {
    return { algorithm, quantum, cpuCount: 1, tasks };
}

const arrivalPreemption = [
    {
        kind: 'preemption',
        time: 1,
        cpuId: 1,
        preempted: { taskId: 1, index: 0 },
        by: { taskId: 2, index: 0 },
    },
];

function preemptions(sim: Simulator) {
    return sim
        .getLatestSnapshot()
        .events.filter((event) => event.kind === 'preemption');
}

describe('createSimulator', () => {
    it('resolves the policy from config.algorithm (A.4.1)', () => {
        // T2 has the shorter period, T1 the earlier absolute deadline.
        const tasks = [task(1, 0, 2, 10, 3), task(2, 0, 2, 5, 5)];

        expect(owners(createSimulator(oneCpu('RM', 5, tasks)), 4)).toBe(
            'T2 T2 T1 T1',
        );
        expect(owners(createSimulator(oneCpu('EDF', 5, tasks)), 4)).toBe(
            'T1 T1 T2 T2',
        );
    });

    it('RM preempts when a shorter-period job arrives', () => {
        const sim = createSimulator(
            oneCpu('RM', 2, [task(1, 0, 4, 10, 10), task(2, 1, 1, 5, 5)]),
        );

        expect(owners(sim, 6)).toBe('T1 T2 T1 T1 T1 -');
        expect(preemptions(sim)).toEqual(arrivalPreemption);
    });

    it('EDF preempts when an earlier-deadline job arrives', () => {
        const sim = createSimulator(
            oneCpu('EDF', 2, [task(1, 0, 4, 10, 10), task(2, 1, 1, 10, 2)]),
        );

        expect(owners(sim, 6)).toBe('T1 T2 T1 T1 T1 -');
        expect(preemptions(sim)).toEqual(arrivalPreemption);
    });

    it('rejects a registry without the configured algorithm', () => {
        expect(() =>
            createSimulator({ ...DEFAULT_CONFIG, algorithm: 'EDF' }, {
                RM: rmPolicy,
            } as unknown as PolicyRegistry),
        ).toThrow('No scheduling policy is registered for algorithm EDF.');
    });

    it('reports an invalid configuration before the registry (DEC-15)', () => {
        expect(() =>
            createSimulator({ ...DEFAULT_CONFIG, algorithm: 'FIFO' as 'RM' }),
        ).toThrow(ConfigValidationError);
        expect(() =>
            createSimulator(
                { ...DEFAULT_CONFIG, cpuCount: 0 },
                {} as PolicyRegistry,
            ),
        ).toThrow(ConfigValidationError);
    });

    it('passes the registered policy to the simulator', () => {
        let calls = 0;
        const spy: SchedulingPolicy = {
            select: (view) => {
                calls++;
                return rmPolicy.select(view);
            },
        };

        createSimulator(oneCpu('EDF', 2, [task(1, 0, 1, 5, 5)]), {
            RM: spy,
            EDF: spy,
        });

        expect(calls).toBeGreaterThan(0);
    });
});
