import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReactive } from 'vue';
import type { SystemConfig } from '../../core/domain';
import type { PolicyRegistry } from '../../core/policies';
import type { SchedulingPolicy } from '../../core/policy';
import { Simulator } from '../../core/simulator';
import { currentError, dismissError } from '../errors';
import { useSimulation } from './useSimulation';

const oneTask: SystemConfig = {
    algorithm: 'RM',
    quantum: 5,
    cpuCount: 1,
    tasks: [
        {
            id: '1',
            color: 'F0E0D0',
            arrival: 0,
            duration: 3,
            period: 5,
            deadline: 5,
            rawEvents: '',
        },
    ],
};

const firstAvailable: SchedulingPolicy = {
    select: (view) => ({
        selected: view.candidates
            .slice(0, view.cpuCount)
            .map(({ job }) => ({ taskId: job.taskId, index: job.index })),
    }),
};

/** Registry that runs `policy` whatever the configured algorithm (DEC-25). */
function only(policy: SchedulingPolicy): PolicyRegistry {
    return { RM: policy, EDF: policy };
}

beforeEach(() => {
    dismissError();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useSimulation', () => {
    it('publishes snapshot 0 of the default config on creation', () => {
        const { view } = useSimulation();
        expect(view.value.clock).toBe(0);
        expect(view.value.config.tasks).toEqual([]);
    });

    it('loads a new config from t=0', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.tick();
        expect(sim.load(oneTask)).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(0);
        expect(sim.view.value.cpus[0].running).toEqual({
            taskId: '1',
            index: 0,
        });
    });

    it('ticks the loaded simulation with its own policy', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        expect(sim.tick()).toEqual({ ok: true });
        expect(sim.view.value.executions).toEqual([
            { cpuId: 1, job: { taskId: '1', index: 0 }, start: 0, end: 1 },
        ]);
    });

    it('keeps the running simulation when load is rejected', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        sim.tick();
        const before = sim.view.value;

        const result = sim.load({ ...oneTask, cpuCount: 0 });

        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.kind).toBe('config');
        expect(
            !result.ok &&
                result.error.kind === 'config' &&
                result.error.issues[0].field,
        ).toBe('cpuCount');
        expect(sim.view.value).toBe(before);
        expect(currentError.value).toBeNull();
        sim.tick();
        expect(sim.view.value.clock).toBe(2);
    });

    it('reports an unregistered algorithm as unexpected', () => {
        const sim = useSimulation({} as PolicyRegistry);
        const before = sim.view.value;
        expect(before.clock).toBe(0);

        const result = sim.load(oneTask);

        expect(!result.ok && result.error.kind).toBe('unexpected');
        expect(currentError.value).toBe(
            'No scheduling policy is registered for algorithm RM.',
        );
        expect(sim.view.value).toBe(before);
    });

    it('loads with the default registry when none is given', () => {
        const sim = useSimulation();

        expect(sim.load(oneTask)).toEqual({ ok: true });
        expect(sim.view.value.cpus[0].running).toEqual({
            taskId: '1',
            index: 0,
        });
    });

    it('publishes a new snapshot per tick and leaves earlier ones intact', () => {
        const { view, load, tick } = useSimulation(only(firstAvailable));
        load(oneTask);
        const first = view.value;

        tick();
        const second = view.value;
        tick();

        expect(view.value.clock).toBe(2);
        expect(view.value).not.toBe(second);
        expect(second).not.toBe(first);
        expect(first.clock).toBe(0);
        expect(first.executions).toEqual([]);
        // The next tick extends this interval to [0, 2) in the live state.
        expect(second.clock).toBe(1);
        expect(second.executions).toEqual([
            { cpuId: 1, job: { taskId: '1', index: 0 }, start: 0, end: 1 },
        ]);
        expect(view.value.executions[0].end).toBe(2);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(second)).toBe(true);
    });

    it('latest returns the newest recorded step while the cursor is behind', () => {
        const adapter = useSimulation(only(firstAvailable));
        adapter.load(oneTask);
        adapter.tick();
        adapter.tick();
        adapter.backward();
        adapter.backward();

        expect(adapter.view.value.clock).toBe(0);
        expect(adapter.latest().clock).toBe(2);
    });

    it('exposes only the snapshot and the commands', () => {
        const adapter = useSimulation(only(firstAvailable));
        adapter.load(oneTask);

        expect(Object.keys(adapter).sort()).toEqual([
            'backward',
            'edit',
            'forward',
            'futureSteps',
            'latest',
            'load',
            'next',
            'tick',
            'view',
        ]);
        expect(adapter.view.value).not.toBeInstanceOf(Simulator);
        expect(isReactive(adapter.view.value)).toBe(false);
        expect(Object.isFrozen(adapter.view.value)).toBe(true);
    });

    it('reports a tick error and keeps the last valid snapshot', () => {
        let failing = false;
        const policy: SchedulingPolicy = {
            select: (view) => {
                if (failing) {
                    throw new Error('policy failed');
                }
                return firstAvailable.select(view);
            },
        };
        const { view, load, tick } = useSimulation(only(policy));
        load(oneTask);
        tick();
        const lastValid = view.value;

        failing = true;
        expect(tick()).toEqual({
            ok: false,
            error: { kind: 'unexpected', message: 'policy failed' },
        });
        expect(currentError.value).toBe('policy failed');
        expect(view.value).toBe(lastValid);

        // DEC-14 keeps the state, so the simulation continues from it.
        failing = false;
        expect(tick()).toEqual({ ok: true });
        expect(view.value.clock).toBe(lastValid.clock + 1);
    });
});

describe('useSimulation navigation (DEC-36)', () => {
    const BACKWARD_AT_ZERO =
        'O passo 0 é o primeiro passo registrado; não há passo anterior para voltar.';

    it('steps backward and forward through recorded snapshots', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        sim.tick();
        sim.tick();
        const two = sim.view.value;

        expect(sim.backward()).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(1);
        expect(sim.forward()).toEqual({ ok: true });
        expect(sim.view.value).toBe(two);
    });

    it('next reuses a recorded step and ticks only at the latest one', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        sim.tick();
        const one = sim.view.value;
        sim.tick();
        const two = sim.view.value;
        sim.backward();
        sim.backward();

        expect(sim.next()).toEqual({ ok: true });
        expect(sim.view.value).toBe(one);
        expect(sim.next()).toEqual({ ok: true });
        expect(sim.view.value).toBe(two);
        expect(sim.next()).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(3);
    });

    it('reports a refusal as refused, not on the banner, and keeps the view', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        const zero = sim.view.value;

        expect(sim.backward()).toEqual({
            ok: false,
            error: { kind: 'refused', message: BACKWARD_AT_ZERO },
        });
        expect(sim.forward()).toEqual({
            ok: false,
            error: {
                kind: 'refused',
                message:
                    'O passo 0 é o último passo registrado; use tick() para calcular o passo 1.',
            },
        });
        expect(sim.view.value).toBe(zero);
        expect(currentError.value).toBeNull();
    });

    it('reports tick behind the cursor as refused', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        sim.tick();
        sim.backward();
        const zero = sim.view.value;

        expect(sim.tick()).toEqual({
            ok: false,
            error: {
                kind: 'refused',
                message:
                    'O passo 1 já foi calculado; use forward() em vez de tick().',
            },
        });
        expect(sim.view.value).toBe(zero);
        expect(currentError.value).toBeNull();
    });

    it('refuses navigation before any load', () => {
        const sim = useSimulation();
        const zero = sim.view.value;
        const result = sim.backward();
        expect(!result.ok && result.error.kind).toBe('refused');
        const forward = sim.forward();
        expect(!forward.ok && forward.error.kind).toBe('refused');
        expect(sim.view.value).toBe(zero);
        expect(currentError.value).toBeNull();
    });

    it('starts a loaded config at its step 0 after navigating back', () => {
        const sim = useSimulation(only(firstAvailable));
        sim.load(oneTask);
        sim.tick();
        sim.tick();
        sim.tick();
        sim.backward();
        sim.backward();

        expect(sim.load(oneTask)).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(0);
        expect(sim.backward()).toEqual({
            ok: false,
            error: { kind: 'refused', message: BACKWARD_AT_ZERO },
        });
        expect(sim.next()).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(1);
    });

    it('keeps the view when next fails at the latest step and still navigates back', () => {
        let failing = false;
        const policy: SchedulingPolicy = {
            select: (view) => {
                if (failing) {
                    throw new Error('policy failed');
                }
                return firstAvailable.select(view);
            },
        };
        const sim = useSimulation(only(policy));
        sim.load(oneTask);
        sim.tick();
        const lastValid = sim.view.value;

        failing = true;
        expect(sim.next()).toEqual({
            ok: false,
            error: { kind: 'unexpected', message: 'policy failed' },
        });
        expect(sim.view.value).toBe(lastValid);
        expect(sim.backward()).toEqual({ ok: true });
        expect(sim.view.value.clock).toBe(0);
    });
});

describe('useSimulation edits (#37, DEC-37)', () => {
    const twoTasks: SystemConfig = {
        algorithm: 'RM',
        quantum: 5,
        cpuCount: 1,
        tasks: [
            { ...oneTask.tasks[0] },
            { ...oneTask.tasks[0], id: '2', color: '102030' },
        ],
    };

    function ahead() {
        const sim = useSimulation(only(firstAvailable));
        sim.load(twoTasks);
        sim.tick();
        sim.tick();
        sim.tick();
        sim.backward();
        sim.backward();
        return sim;
    }

    it('applies an edit at the cursor, keeps the cursor and discards the future', () => {
        const sim = ahead();
        expect(sim.futureSteps()).toBe(2);

        expect(sim.edit([{ kind: 'quantum', quantum: 2 }])).toEqual({
            ok: true,
        });
        expect(sim.view.value.clock).toBe(1);
        expect(sim.view.value.config.quantum).toBe(2);
        expect(sim.futureSteps()).toBe(0);
    });

    it('keeps view and future when an item is refused and tells which one', () => {
        const sim = ahead();
        const before = sim.view.value;

        const result = sim.edit([
            { kind: 'quantum', quantum: 2 },
            { kind: 'taskPeriod', taskId: '1', period: 0 },
        ]);

        expect(result.ok).toBe(false);
        if (result.ok || result.error.kind !== 'refused') {
            throw new Error('expected a refusal');
        }
        expect(result.error.items?.map((item) => item.index)).toEqual([1]);
        expect(sim.view.value).toBe(before);
        expect(sim.view.value.config.quantum).toBe(5);
        expect(sim.futureSteps()).toBe(2);
        expect(currentError.value).toBeNull();
    });

    it('refuses an empty edit as refused', () => {
        const sim = ahead();
        const result = sim.edit([]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.kind).toBe('refused');
        }
    });
});
