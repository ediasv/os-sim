import { describe, expect, it } from 'vitest';
import { validateConfig, type ConfigInput, type ConfigIssue } from './config';
import { DEFAULT_CONFIG, type AlgorithmId, type SystemConfig } from './domain';
import {
    applyNetChange,
    foldEdit,
    readTarget,
    type EditContext,
    type EditItem,
} from './edit';
import { EditRefusal, SimulationRefusal } from './refusal';
import { createInitialState } from './snapshot';

const config: SystemConfig = validateConfigOrThrow({
    ...DEFAULT_CONFIG,
    tasks: [
        {
            id: 1,
            color: 'F0E0D0',
            arrival: 0,
            duration: 2,
            period: 5,
            deadline: 5,
            rawEvents: '',
        },
    ],
});

function validateConfigOrThrow(input: ConfigInput): SystemConfig {
    const result = validateConfig(input);
    if (!result.ok) throw new Error('fixture config must be valid');
    return result.config;
}

/** The message validateConfig gives for the first issue of `input`. */
function issue(input: ConfigInput): string {
    const result = validateConfig(input) as {
        ok: false;
        issues: ConfigIssue[];
    };
    return result.issues[0].message;
}

const both = (algorithm: AlgorithmId) =>
    algorithm === 'RM' || algorithm === 'EDF';

function contextFor(
    hasPolicy: (algorithm: AlgorithmId) => boolean = both,
): EditContext {
    return { state: createInitialState(config), hasPolicy };
}

const quantum = (value: number): EditItem => ({
    kind: 'quantum',
    quantum: value,
});
const algorithm = (value: string): EditItem => ({
    kind: 'algorithm',
    algorithm: value as AlgorithmId,
});

describe('edit fold', () => {
    it("reads the target from the state's configuration", () => {
        expect(readTarget(createInitialState(config))).toEqual({
            algorithm: 'RM',
            quantum: 5,
        });
    });

    it('folds items in order, later items seeing earlier ones', () => {
        const context = contextFor();
        const base = readTarget(context.state);
        expect(foldEdit(base, [quantum(3), quantum(4)], context)).toEqual({
            ok: true,
            target: { algorithm: 'RM', quantum: 4 },
        });
        expect(foldEdit(base, [algorithm('EDF'), quantum(2)], context)).toEqual(
            { ok: true, target: { algorithm: 'EDF', quantum: 2 } },
        );
    });

    it('normalizes the algorithm like the file loader', () => {
        const context = contextFor();
        expect(
            foldEdit(readTarget(context.state), [algorithm('edf')], context),
        ).toEqual({ ok: true, target: { algorithm: 'EDF', quantum: 5 } });
    });

    it("refuses quantum below 1 or not an integer, with validateConfig's reason", () => {
        const context = contextFor();
        for (const value of [0, -1, 2.5, NaN, '3' as unknown as number]) {
            expect(
                foldEdit(readTarget(context.state), [quantum(value)], context),
            ).toEqual({
                ok: false,
                refusals: [
                    {
                        index: 0,
                        kind: 'quantum',
                        reason: issue({ ...config, quantum: value }),
                    },
                ],
            });
        }
    });

    it("refuses an unknown algorithm with validateConfig's reason", () => {
        const context = contextFor();
        expect(
            foldEdit(readTarget(context.state), [algorithm('FIFO')], context),
        ).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind: 'algorithm',
                    reason: issue({ ...config, algorithm: 'FIFO' }),
                },
            ],
        });
    });

    it('refuses an algorithm without a policy', () => {
        const context = contextFor((a) => a === 'RM');
        expect(
            foldEdit(readTarget(context.state), [algorithm('EDF')], context),
        ).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind: 'algorithm',
                    reason: 'No scheduling policy is registered for algorithm EDF.',
                },
            ],
        });
    });

    it('reports every refused item by position and validates later items without the refused ones', () => {
        const context = contextFor();
        const result = foldEdit(
            readTarget(context.state),
            [quantum(0), algorithm('EDF'), algorithm('X'), quantum(3)],
            context,
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusals.map((refusal) => refusal.index)).toEqual([0, 2]);
        expect('target' in result).toBe(false);
    });

    it('refuses an unknown item kind', () => {
        const context = contextFor();
        expect(
            foldEdit(
                readTarget(context.state),
                [{ kind: 'speed' } as unknown as EditItem],
                context,
            ),
        ).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind: 'speed',
                    reason: 'Unknown edit item kind "speed".',
                },
            ],
        });
    });
});

describe('edit net change', () => {
    it('applies only the net change', () => {
        const state = createInitialState(config);
        const before = readTarget(state);
        const original = state.config;

        applyNetChange(state, before, before);
        expect(state.config).toBe(original);

        applyNetChange(state, before, { ...before, quantum: 2 });
        expect(state.config).not.toBe(original);
        expect(state.config.quantum).toBe(2);
        expect(state.config.algorithm).toBe('RM');
        expect(state.config.tasks).toBe(original.tasks);
        expect(Object.isFrozen(state.config)).toBe(true);
        expect(original.quantum).toBe(5);
    });
});

describe('EditRefusal', () => {
    it('lists each refused item', () => {
        const refusal = new EditRefusal([
            { index: 0, kind: 'quantum', reason: 'r0' },
            { index: 2, kind: 'algorithm', reason: 'r2' },
        ]);
        expect(refusal).toBeInstanceOf(SimulationRefusal);
        expect(refusal.name).toBe('EditRefusal');
        expect(refusal.message).toBe(
            'Item 1 (quantum): r0\nItem 3 (algorithm): r2',
        );
        expect(Object.isFrozen(refusal.items)).toBe(true);
    });
});
