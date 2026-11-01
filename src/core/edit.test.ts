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
    const state = createInitialState(config);
    return { state, baseline: state, hasPolicy };
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
            cpuCount: 1,
            taskStates: { 1: 'ready' },
            definitions: { 1: config.tasks[0] },
        });
    });

    it('folds items in order, later items seeing earlier ones', () => {
        const context = contextFor();
        const base = readTarget(context.state);
        expect(foldEdit(base, [quantum(3), quantum(4)], context)).toEqual({
            ok: true,
            target: {
                algorithm: 'RM',
                quantum: 4,
                cpuCount: 1,
                taskStates: { 1: 'ready' },
                definitions: { 1: config.tasks[0] },
            },
        });
        expect(foldEdit(base, [algorithm('EDF'), quantum(2)], context)).toEqual(
            {
                ok: true,
                target: {
                    algorithm: 'EDF',
                    quantum: 2,
                    cpuCount: 1,
                    taskStates: { 1: 'ready' },
                    definitions: { 1: config.tasks[0] },
                },
            },
        );
    });

    it('normalizes the algorithm like the file loader', () => {
        const context = contextFor();
        expect(
            foldEdit(readTarget(context.state), [algorithm('edf')], context),
        ).toEqual({
            ok: true,
            target: {
                algorithm: 'EDF',
                quantum: 5,
                cpuCount: 1,
                taskStates: { 1: 'ready' },
                definitions: { 1: config.tasks[0] },
            },
        });
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
                    reason: 'Nenhuma política de escalonamento está registrada para o algoritmo EDF.',
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
                    reason: 'Tipo de item de edição desconhecido "speed".',
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

describe('CPU count edit', () => {
    const cpus = (cpuCount: number): EditItem => ({
        kind: 'cpuCount',
        cpuCount,
    });

    it.each([
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        '3' as unknown as number,
    ])('reuses configuration refusal for %s', (value) => {
        const context = contextFor();
        expect(
            foldEdit(
                readTarget(context.state),
                [cpus(value), cpus(2)],
                context,
            ),
        ).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind: 'cpuCount',
                    reason: issue({ ...config, cpuCount: value }),
                },
            ],
        });
    });

    it('folds counts in order without imposing a ceiling of 16', () => {
        const context = contextFor();
        expect(
            foldEdit(readTarget(context.state), [cpus(2), cpus(17)], context),
        ).toEqual({
            ok: true,
            target: {
                algorithm: 'RM',
                quantum: 5,
                cpuCount: 17,
                taskStates: { 1: 'ready' },
                definitions: { 1: config.tasks[0] },
            },
        });
    });

    it('removes highest IDs and preserves surviving CPUs and job context', () => {
        const state = createInitialState({ ...config, cpuCount: 4 });
        state.clock = 2;
        const running = {
            taskId: 1,
            index: 0,
            activation: 0,
            absoluteDeadline: 5,
            duration: 2,
            executed: 1,
            state: 'running' as const,
            completedAt: null,
            deadlineMissed: false,
        };
        const completed = {
            ...running,
            index: 1,
            state: 'completed' as const,
            completedAt: 2,
            executed: 2,
        };
        state.tasks[0].jobs.push(running, completed);
        state.cpus[2].running = { taskId: 1, index: 0 };
        state.cpus[3].running = { taskId: 1, index: 1 };
        state.cpus[0].sliceElapsed = 1;
        const survivors = state.cpus.slice(0, 2);
        const original = state.config;
        const before = readTarget(state);
        applyNetChange(state, before, { ...before, cpuCount: 2 });
        expect(state.cpus).toEqual(survivors);
        expect(state.cpus[0]).toBe(survivors[0]);
        expect(state.cpus[0].sliceElapsed).toBe(1);
        expect(running).toEqual({
            ...running,
            state: 'ready',
            executed: 1,
            absoluteDeadline: 5,
            duration: 2,
        });
        expect(completed.state).toBe('completed');
        expect(state.events).toEqual([
            { kind: 'cpu-removed', time: 2, cpuId: 3 },
            { kind: 'cpu-removed', time: 2, cpuId: 4 },
        ]);
        expect(state.config.cpuCount).toBe(2);
        expect(original.cpuCount).toBe(4);
        expect(Object.isFrozen(state.config)).toBe(true);
    });

    it('adds undecided CPUs with reused IDs for dispatch to initialize', () => {
        const state = createInitialState({ ...config, cpuCount: 2 });
        state.clock = 5;
        const before = readTarget(state);
        applyNetChange(state, before, { ...before, cpuCount: 4 });
        expect(state.cpus.slice(2)).toEqual(
            [3, 4].map((id) => ({
                id,
                running: null,
                sliceElapsed: 0,
                offSince: null,
            })),
        );
        expect(state.events).toEqual([
            { kind: 'cpu-added', time: 5, cpuId: 3 },
            { kind: 'cpu-added', time: 5, cpuId: 4 },
        ]);
    });

    it('does not apply intermediate counts that cancel out', () => {
        const state = createInitialState({ ...config, cpuCount: 4 });
        state.cpus[3].sliceElapsed = 2;
        const saved = structuredClone(state);
        const context = { state, baseline: state, hasPolicy: both };
        const before = readTarget(state);
        const result = foldEdit(before, [cpus(2), cpus(4)], context);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        applyNetChange(state, before, result.target);
        expect(state).toEqual(saved);
    });
});

describe('edit stage guards', () => {
    it('refuses an item whose kind cannot be printed instead of crashing', () => {
        const state = createInitialState(config);
        const context: EditContext = {
            state,
            baseline: state,
            hasPolicy: () => true,
        };
        const malformed = {
            kind: { toString: null },
        } as unknown as EditItem;

        const result = foldEdit(readTarget(state), [malformed], context);

        expect(result.ok).toBe(false);
    });

    it('rejects a CPU count that disagrees with the CPUs in the state', () => {
        const state = createInitialState({ ...config, cpuCount: 3 });
        state.cpus.pop();
        const before = readTarget(state);

        expect(() =>
            applyNetChange(state, before, { ...before, cpuCount: 2 }),
        ).toThrow(/2 CPUs exist but the edit started from 3/);
    });

    it('rejects a removed CPU that owns a job that does not exist', () => {
        const state = createInitialState({ ...config, cpuCount: 2 });
        state.cpus[1].running = { taskId: 99, index: 0 };
        const before = readTarget(state);

        expect(() =>
            applyNetChange(state, before, { ...before, cpuCount: 1 }),
        ).toThrow(/CPU 2 owns job 99#0, which does not exist/);
    });
});

describe('task state edit validation', () => {
    const states = ['ready', 'forced', 'suspended', 'concluded'] as const;
    const taskState = (
        taskId: number,
        state: (typeof states)[number],
    ): EditItem => ({ kind: 'taskState', taskId, state });
    const fixture = () => {
        const state = createInitialState({
            ...config,
            cpuCount: 2,
            tasks: [
                config.tasks[0],
                { ...config.tasks[0], id: 2, color: '112233' },
            ],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    for (const from of states) {
        it.each(states)(`${from} -> %s follows DEC-37`, (to) => {
            const context = fixture();
            context.state.tasks[0].status = from;
            const base = readTarget(context.state);
            const result = foldEdit(base, [taskState(1, to)], context);
            if (from === 'concluded' && to !== 'concluded') {
                expect(result).toEqual({
                    ok: false,
                    refusals: [
                        {
                            index: 0,
                            kind: 'taskState',
                            reason: 'A tarefa 1 está concluída e não pode mudar de estado.',
                        },
                    ],
                });
            } else {
                expect(result).toEqual({
                    ok: true,
                    target: { ...base, taskStates: { 1: to, 2: 'ready' } },
                });
            }
        });
    }
    it('refuses a missing task', () => {
        const context = fixture();
        expect(
            foldEdit(
                readTarget(context.state),
                [taskState(9, 'ready')],
                context,
            ),
        ).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind: 'taskState',
                    reason: 'Não existe a tarefa 9.',
                },
            ],
        });
    });
    it.each([
        {
            items: [
                taskState(1, 'forced'),
                taskState(2, 'forced'),
                { kind: 'cpuCount', cpuCount: 1 } as EditItem,
            ],
            kind: 'cpuCount',
            reason: 'Não é possível reduzir para 1 CPU: há 2 tarefas forçadas.',
        },
        {
            items: [
                { kind: 'cpuCount', cpuCount: 1 } as EditItem,
                taskState(1, 'forced'),
                taskState(2, 'forced'),
            ],
            kind: 'taskState',
            reason: 'Não há CPUs para forçar a tarefa 2: já há 1 tarefa forçada para 1 CPU.',
        },
    ])('checks capacity in item order ($kind)', ({ items, kind, reason }) => {
        const context = fixture();
        expect(foldEdit(readTarget(context.state), items, context)).toEqual({
            ok: false,
            refusals: [{ index: 2, kind, reason }],
        });
    });
});

it('refuses an unknown task state with an accurate reason', () => {
    const context = contextFor();
    const result = foldEdit(
        readTarget(context.state),
        [
            {
                kind: 'taskState',
                taskId: 1,
                state: 'sleeping',
            } as unknown as EditItem,
        ],
        context,
    );
    expect(result).toEqual({
        ok: false,
        refusals: [
            {
                index: 0,
                kind: 'taskState',
                reason: 'Estado de tarefa inválido: "sleeping".',
            },
        ],
    });
});

describe('task color edit', () => {
    const color = (taskId: number, value: unknown): EditItem =>
        ({ kind: 'taskColor', taskId, color: value }) as EditItem;
    const fixture = () => {
        const state = createInitialState({
            ...config,
            tasks: [
                config.tasks[0],
                { ...config.tasks[0], id: 2, color: '112233' },
            ],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    const refusal = (reason: unknown) => ({
        ok: false,
        refusals: [{ index: 0, kind: 'taskColor', reason }],
    });

    it('stores a valid color in uppercase', () => {
        const context = fixture();
        const base = readTarget(context.state);
        const result = foldEdit(base, [color(1, 'aabbcc')], context);
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        expect(result.target.definitions[1].color).toBe('AABBCC');
        expect(Object.isFrozen(result.target.definitions[1])).toBe(true);
        expect(result.target.definitions[2]).toBe(base.definitions[2]);
    });
    it('accepts an identity edit without changing the color', () => {
        const context = fixture();
        const base = readTarget(context.state);
        const result = foldEdit(base, [color(1, 'f0e0d0')], context);
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        expect(result.target.definitions[1].color).toBe('F0E0D0');
    });
    it.each(['#aabbcc', 'xyz', 123456 as unknown])(
        'refuses the invalid color %j',
        (value) => {
            const context = fixture();
            expect(
                foldEdit(readTarget(context.state), [color(1, value)], context),
            ).toMatchObject(refusal(expect.stringContaining('cor')));
        },
    );
    it('refuses a color used by another task, ignoring case', () => {
        const context = fixture();
        const base = readTarget(context.state);
        expect(foldEdit(base, [color(1, '112233')], context)).toMatchObject(
            refusal(expect.stringContaining('cor')),
        );
        expect(foldEdit(base, [color(2, 'f0e0d0')], context)).toMatchObject(
            refusal(expect.stringContaining('cor')),
        );
    });
    it.each([
        // edited task, wanted color, expected owner ordinal
        [1, '445566', '3ª', 'before the owner'],
        [2, 'f0e0d0', '1ª', 'after the owner'],
        [2, '445566', '3ª', 'before the owner, edited in the middle'],
        [3, 'f0e0d0', '1ª', 'last, owner first'],
        [3, '112233', '2ª', 'last, owner in the middle'],
        [1, '112233', '2ª', 'first, owner in the middle'],
    ])('names the real owner for task %i taking %s: %s', (id, wanted, nth) => {
        const state = createInitialState({
            ...config,
            tasks: [
                config.tasks[0],
                { ...config.tasks[0], id: 2, color: '112233' },
                { ...config.tasks[0], id: 3, color: '445566' },
            ],
        });
        const context = { state, baseline: state, hasPolicy: both };
        expect(
            foldEdit(
                readTarget(state),
                [color(id, wanted.toLowerCase())],
                context,
            ),
        ).toEqual(
            refusal(
                `A cor ${wanted.toUpperCase()} já foi usada pela ${nth} tarefa; cada tarefa precisa de uma cor diferente.`,
            ),
        );
    });
    it('names a concluded task as the owner of the color', () => {
        const state = createInitialState({
            ...config,
            tasks: [
                config.tasks[0],
                { ...config.tasks[0], id: 2, color: '112233' },
                { ...config.tasks[0], id: 3, color: '445566' },
            ],
        });
        state.tasks[2].status = 'concluded';
        expect(
            foldEdit(readTarget(state), [color(1, '445566')], {
                state,
                baseline: state,
                hasPolicy: both,
            }),
        ).toEqual(
            refusal(
                'A cor 445566 já foi usada pela 3ª tarefa; cada tarefa precisa de uma cor diferente.',
            ),
        );
    });
    it('refuses a color used by a concluded task', () => {
        const context = fixture();
        context.state.tasks[1].status = 'concluded';
        expect(
            foldEdit(readTarget(context.state), [color(1, '112233')], context),
        ).toMatchObject(refusal(expect.stringContaining('cor')));
    });
    it('accepts the color of a concluded task', () => {
        const context = fixture();
        context.state.tasks[0].status = 'concluded';
        const result = foldEdit(
            readTarget(context.state),
            [color(1, 'aabbcc')],
            context,
        );
        expect(result).toMatchObject({ ok: true });
    });
    it('refuses unknown and non-integer task identifiers', () => {
        const context = fixture();
        const base = readTarget(context.state);
        expect(foldEdit(base, [color(9, 'aabbcc')], context)).toMatchObject(
            refusal('Não existe a tarefa 9.'),
        );
        expect(foldEdit(base, [color(1.5, 'aabbcc')], context)).toMatchObject(
            refusal(
                expect.stringContaining(
                    'O identificador da tarefa deve ser um número inteiro',
                ),
            ),
        );
    });
    it('judges later items over the result of earlier ones', () => {
        const context = fixture();
        const result = foldEdit(
            readTarget(context.state),
            [color(1, 'aabbcc'), color(2, 'aabbcc')],
            context,
        );
        expect(result).toMatchObject({
            ok: false,
            refusals: [{ index: 1, kind: 'taskColor' }],
        });
    });
});

describe('task duration and deadline edit', () => {
    const duration = (taskId: number, value: unknown): EditItem =>
        ({ kind: 'taskDuration', taskId, duration: value }) as EditItem;
    const deadline = (taskId: number, value: unknown): EditItem =>
        ({ kind: 'taskDeadline', taskId, deadline: value }) as EditItem;
    const fixture = (task: Partial<(typeof config.tasks)[number]> = {}) => {
        const state = createInitialState({
            ...config,
            tasks: [{ ...config.tasks[0], ...task }],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    /** Activates `count` jobs so only the remaining ones can take the edit. */
    const activate = (context: ReturnType<typeof fixture>, count: number) => {
        const tcb = context.state.tasks[0];
        const { period } = tcb.definition;
        for (let index = 0; index < count; index++) {
            tcb.jobs.push({
                taskId: 1,
                index,
                activation: index * period,
                absoluteDeadline: index * period + tcb.definition.deadline,
                duration: tcb.definition.duration,
                executed: 0,
                state: 'ready',
                completedAt: null,
                deadlineMissed: false,
            });
        }
        tcb.nextActivation = count === 10 ? null : count * period;
    };
    const refusalOf = (
        result: ReturnType<typeof foldEdit>,
        kind: string,
    ): string => {
        expect(result).toMatchObject({ ok: false, refusals: [{ kind }] });
        if (result.ok) throw new Error('expected a refusal');
        return result.refusals[0].reason;
    };

    it('accepts a duration and a deadline before the first activation', () => {
        const context = fixture();
        const base = readTarget(context.state);
        const result = foldEdit(
            base,
            [duration(1, 7), deadline(1, 9)],
            context,
        );
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        const edited = result.target.definitions[1];
        expect(edited).toMatchObject({ duration: 7, deadline: 9 });
        expect(Object.isFrozen(edited)).toBe(true);
        expect(base.definitions[1]).toMatchObject({ duration: 2, deadline: 5 });
    });
    it('accepts the edit between jobs', () => {
        const context = fixture();
        activate(context, 3);
        const result = foldEdit(
            readTarget(context.state),
            [duration(1, 4), deadline(1, 6)],
            context,
        );
        expect(result).toMatchObject({ ok: true });
    });
    it('refuses when every activation already happened', () => {
        const context = fixture();
        activate(context, 10);
        const base = readTarget(context.state);
        for (const [item, kind] of [
            [duration(1, 4), 'taskDuration'],
            [deadline(1, 6), 'taskDeadline'],
        ] as const) {
            expect(refusalOf(foldEdit(base, [item], context), kind)).toMatch(
                /não há próxima ativação/,
            );
        }
    });
    it('refuses an aperiodic task that already activated its only job', () => {
        const context = fixture({ period: 0 });
        activate(context, 1);
        expect(
            refusalOf(
                foldEdit(readTarget(context.state), [duration(1, 3)], context),
                'taskDuration',
            ),
        ).toMatch(/não há próxima ativação/);
    });
    it.each([0, -1, 1.5, Number.NaN, '3', null, undefined])(
        'refuses the invalid value %j with the validateConfig wording',
        (value) => {
            const context = fixture();
            const base = readTarget(context.state);
            const wording = (field: 'duration' | 'deadline') =>
                issue({
                    ...config,
                    tasks: [{ ...config.tasks[0], [field]: value }],
                } as ConfigInput);
            expect(
                refusalOf(
                    foldEdit(base, [duration(1, value)], context),
                    'taskDuration',
                ),
            ).toBe(wording('duration'));
            expect(
                refusalOf(
                    foldEdit(base, [deadline(1, value)], context),
                    'taskDeadline',
                ),
            ).toBe(wording('deadline'));
        },
    );
    it('refuses a concluded task', () => {
        const context = fixture();
        context.state.tasks[0].status = 'concluded';
        const base = readTarget(context.state);
        const reason = 'A tarefa 1 está concluída; só a cor pode ser alterada.';
        expect(
            refusalOf(
                foldEdit(base, [duration(1, 3)], context),
                'taskDuration',
            ),
        ).toBe(reason);
        expect(
            refusalOf(
                foldEdit(base, [deadline(1, 3)], context),
                'taskDeadline',
            ),
        ).toBe(reason);
    });
    it('refuses a characteristic after concluding the task in the same edit', () => {
        const context = fixture();
        const reason = 'A tarefa 1 está concluída; só a cor pode ser alterada.';
        const result = foldEdit(
            readTarget(context.state),
            [
                { kind: 'taskState', taskId: 1, state: 'concluded' },
                duration(1, 3),
                deadline(1, 3),
            ],
            context,
        );
        expect(result).toEqual({
            ok: false,
            refusals: [
                { index: 1, kind: 'taskDuration', reason },
                { index: 2, kind: 'taskDeadline', reason },
            ],
        });
    });
    it('still accepts the color after concluding the task in the same edit', () => {
        const context = fixture();
        const result = foldEdit(
            readTarget(context.state),
            [
                { kind: 'taskState', taskId: 1, state: 'concluded' },
                { kind: 'taskColor', taskId: 1, color: 'aabbcc' },
            ],
            context,
        );
        expect(result).toMatchObject({ ok: true });
    });
    it('refuses unknown and non-integer task identifiers', () => {
        const context = fixture();
        const base = readTarget(context.state);
        expect(foldEdit(base, [duration(9, 3)], context)).toMatchObject({
            refusals: [{ reason: 'Não existe a tarefa 9.' }],
        });
        expect(foldEdit(base, [deadline(1.5, 3)], context)).toMatchObject({
            refusals: [
                {
                    reason: expect.stringContaining(
                        'O identificador da tarefa deve ser um número inteiro',
                    ),
                },
            ],
        });
    });
    it('refuses a deadline whose last remaining activation is not exact', () => {
        const context = fixture();
        const reason = refusalOf(
            foldEdit(
                readTarget(context.state),
                [deadline(1, Number.MAX_SAFE_INTEGER)],
                context,
            ),
            'taskDeadline',
        );
        expect(reason).toMatch(/10 ativações restantes/);
        expect(reason).toContain(String(Number.MAX_SAFE_INTEGER));
    });
    it('counts only the remaining activations in the deadline limit', () => {
        // 9 periods plus this deadline overflow, but one activation does not.
        const wanted = 5e15;
        const ten = fixture({ period: 1e15 });
        expect(
            foldEdit(readTarget(ten.state), [deadline(1, wanted)], ten),
        ).toMatchObject({ ok: false });
        const one = fixture({ period: 1e15 });
        activate(one, 9);
        // The bound starts at the next activation, wherever it was moved to.
        one.state.tasks[0].nextActivation = 0;
        expect(
            foldEdit(readTarget(one.state), [deadline(1, wanted)], one),
        ).toMatchObject({ ok: true });
    });
    it('does not apply the period term to a single remaining activation', () => {
        const context = fixture({ period: 0 });
        expect(
            foldEdit(
                readTarget(context.state),
                [deadline(1, Number.MAX_SAFE_INTEGER)],
                context,
            ),
        ).toMatchObject({ ok: true });
    });
});

describe('task arrival edit', () => {
    const arrival = (taskId: number, value: unknown): EditItem =>
        ({ kind: 'taskArrival', taskId, arrival: value }) as EditItem;
    const fixture = (task: Partial<(typeof config.tasks)[number]> = {}) => {
        const state = createInitialState({
            ...config,
            tasks: [{ ...config.tasks[0], arrival: 5, ...task }],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    const reasonOf = (result: ReturnType<typeof foldEdit>): string => {
        expect(result).toMatchObject({
            ok: false,
            refusals: [{ kind: 'taskArrival' }],
        });
        if (result.ok) throw new Error('expected a refusal');
        return result.refusals[0].reason;
    };

    it('accepts a later arrival and one equal to the clock', () => {
        const context = fixture();
        context.state.clock = 2;
        const base = readTarget(context.state);
        for (const value of [8, 2]) {
            const result = foldEdit(base, [arrival(1, value)], context);
            expect(result).toMatchObject({ ok: true });
            if (!result.ok) return;
            expect(result.target.definitions[1].arrival).toBe(value);
            expect(Object.isFrozen(result.target.definitions[1])).toBe(true);
        }
        expect(base.definitions[1].arrival).toBe(5);
    });
    it('refuses an arrival before the clock naming it', () => {
        const context = fixture();
        context.state.clock = 3;
        expect(
            reasonOf(
                foldEdit(readTarget(context.state), [arrival(1, 2)], context),
            ),
        ).toBe('O ingresso deve ser maior ou igual ao tick atual (3).');
    });
    it('refuses once the task has a job, even when the arrival equals the clock', () => {
        const context = fixture({ arrival: 0 });
        context.state.clock = 0;
        context.state.tasks[0].jobs.push({
            taskId: 1,
            index: 0,
            activation: 0,
            absoluteDeadline: 5,
            duration: 2,
            executed: 0,
            state: 'ready',
            completedAt: null,
            deadlineMissed: false,
        });
        expect(
            reasonOf(
                foldEdit(readTarget(context.state), [arrival(1, 0)], context),
            ),
        ).toBe('O ingresso não pode ser alterado pois a tarefa já ingressou.');
    });
    it.each([-1, 1.5, Number.NaN, '3', null, undefined])(
        'refuses the invalid value %j with the validateConfig wording',
        (value) => {
            const context = fixture();
            expect(
                reasonOf(
                    foldEdit(
                        readTarget(context.state),
                        [arrival(1, value)],
                        context,
                    ),
                ),
            ).toBe(
                issue({
                    ...config,
                    tasks: [{ ...config.tasks[0], arrival: value }],
                } as ConfigInput),
            );
        },
    );
    it('refuses an arrival whose last deadline leaves the exact integers', () => {
        const context = fixture();
        const base = readTarget(context.state);
        // period 5, deadline 5: the 10th activation adds 9 * 5 + 5 = 50.
        for (const value of [
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER - 49,
        ]) {
            expect(
                reasonOf(foldEdit(base, [arrival(1, value)], context)),
            ).toMatch(/ultrapassa o maior inteiro exato/);
        }
        expect(
            foldEdit(base, [arrival(1, Number.MAX_SAFE_INTEGER - 50)], context),
        ).toMatchObject({ ok: true });
        expect(foldEdit(base, [arrival(1, 8)], context)).toMatchObject({
            ok: true,
        });
    });
    it('bounds the last deadline by the pending arrival of the same edit, in either order', () => {
        const context = fixture();
        const base = readTarget(context.state);
        const far = arrival(1, Number.MAX_SAFE_INTEGER - 50);
        const wide = {
            kind: 'taskDeadline',
            taskId: 1,
            deadline: 10,
        } as EditItem;
        for (const items of [
            [far, wide],
            [wide, far],
        ]) {
            const result = foldEdit(base, items, context);
            expect(result).toMatchObject({ ok: false });
            if (result.ok) return;
            expect(result.refusals).toHaveLength(1);
            expect(result.refusals[0].reason).toMatch(
                /ultrapassa o maior inteiro exato/,
            );
        }
        for (const items of [
            [arrival(1, 8), wide],
            [wide, arrival(1, 8)],
        ]) {
            expect(foldEdit(base, items, context)).toMatchObject({ ok: true });
        }
    });
    it('refuses a concluded task, also when concluded in the same edit', () => {
        const context = fixture();
        const reason = 'A tarefa 1 está concluída; só a cor pode ser alterada.';
        context.state.tasks[0].status = 'concluded';
        expect(
            reasonOf(
                foldEdit(readTarget(context.state), [arrival(1, 8)], context),
            ),
        ).toBe(reason);
        const live = fixture();
        const result = foldEdit(
            readTarget(live.state),
            [
                { kind: 'taskState', taskId: 1, state: 'concluded' },
                arrival(1, 8),
            ],
            live,
        );
        expect(result).toEqual({
            ok: false,
            refusals: [{ index: 1, kind: 'taskArrival', reason }],
        });
    });
    it('refuses unknown and non-integer task identifiers', () => {
        const context = fixture();
        const base = readTarget(context.state);
        expect(reasonOf(foldEdit(base, [arrival(9, 8)], context))).toBe(
            'Não existe a tarefa 9.',
        );
        expect(
            reasonOf(
                foldEdit(base, [arrival('1' as unknown as number, 8)], context),
            ),
        ).toContain('O identificador da tarefa deve ser um número inteiro');
    });
    it('reschedules the first activation on the net change', () => {
        const context = fixture();
        const before = readTarget(context.state);
        const result = foldEdit(before, [arrival(1, 8)], context);
        if (!result.ok) throw new Error('expected acceptance');
        applyNetChange(context.state, before, result.target);
        expect(context.state.tasks[0].nextActivation).toBe(8);
        expect(context.state.tasks[0].jobs).toEqual([]);
        expect(context.state.events).toEqual([]);
    });
    it('activates in the edit stage when the arrival equals the clock', () => {
        const context = fixture();
        context.state.clock = 2;
        const before = readTarget(context.state);
        const result = foldEdit(before, [arrival(1, 2)], context);
        if (!result.ok) throw new Error('expected acceptance');
        applyNetChange(context.state, before, result.target);
        expect(context.state.tasks[0].jobs).toMatchObject([
            { index: 0, activation: 2, absoluteDeadline: 7 },
        ]);
        expect(context.state.events).toEqual([
            { kind: 'activation', time: 2, job: { taskId: 1, index: 0 } },
        ]);
        expect(context.state.tasks[0].nextActivation).toBe(7);
    });
    it('records the status event before the edit-caused activation', () => {
        const context = fixture();
        context.state.clock = 2;
        const before = readTarget(context.state);
        const result = foldEdit(
            before,
            [
                { kind: 'taskState', taskId: 1, state: 'suspended' },
                arrival(1, 2),
            ],
            context,
        );
        if (!result.ok) throw new Error('expected acceptance');
        applyNetChange(context.state, before, result.target);
        expect(context.state.events.map((event) => event.kind)).toEqual([
            'suspension',
            'activation',
        ]);
        expect(context.state.tasks[0].jobs).toHaveLength(1);
        expect(context.state.tasks[0].status).toBe('suspended');
    });
    it('changes nothing when the arrival returns to the original', () => {
        const context = fixture();
        context.state.clock = 2;
        const before = readTarget(context.state);
        const result = foldEdit(
            before,
            [arrival(1, 2), arrival(1, 5)],
            context,
        );
        if (!result.ok) throw new Error('expected acceptance');
        applyNetChange(context.state, before, result.target);
        expect(context.state.tasks[0].jobs).toEqual([]);
        expect(context.state.tasks[0].nextActivation).toBe(5);
        expect(context.state.events).toEqual([]);
    });
});

describe('task period edit', () => {
    const period = (taskId: number, value: unknown): EditItem =>
        ({ kind: 'taskPeriod', taskId, period: value }) as EditItem;
    const deadline = (value: number): EditItem => ({
        kind: 'taskDeadline',
        taskId: 1,
        deadline: value,
    });
    const arrival = (value: number): EditItem => ({
        kind: 'taskArrival',
        taskId: 1,
        arrival: value,
    });
    const fixture = (task: Partial<(typeof config.tasks)[number]> = {}) => {
        const state = createInitialState({
            ...config,
            tasks: [{ ...config.tasks[0], ...task }],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    /** Gives the task `count` jobs at its period, as the engine would. */
    const activate = (context: ReturnType<typeof fixture>, count: number) => {
        const tcb = context.state.tasks[0];
        const { period: p, deadline: d, duration } = tcb.definition;
        for (let index = 0; index < count; index++) {
            tcb.jobs.push({
                taskId: 1,
                index,
                activation: index * p,
                absoluteDeadline: index * p + d,
                duration,
                executed: 0,
                state: 'ready',
                completedAt: null,
                deadlineMissed: false,
            });
        }
        tcb.nextActivation = count >= 10 ? null : count * p;
    };
    const reasonOf = (result: ReturnType<typeof foldEdit>): string => {
        expect(result).toMatchObject({
            ok: false,
            refusals: [{ kind: 'taskPeriod' }],
        });
        if (result.ok) throw new Error('expected a refusal');
        return result.refusals[0].reason;
    };

    it('accepts a new period, replacing the definition without mutating it', () => {
        const context = fixture();
        const base = readTarget(context.state);
        const result = foldEdit(base, [period(1, 8)], context);
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        expect(result.target.definitions[1].period).toBe(8);
        expect(Object.isFrozen(result.target.definitions[1])).toBe(true);
        expect(base.definitions[1].period).toBe(5);
    });
    it('refuses zero naming the Projeto A rule and DEC-29', () => {
        const context = fixture();
        const reason = reasonOf(
            foldEdit(readTarget(context.state), [period(1, 0)], context),
        );
        expect(reason).toMatch(/maior ou igual a 1/);
        expect(reason).toMatch(/Projeto B/);
        expect(reason).toMatch(/DEC-29/);
    });
    it.each([-3, 2.5, Number.NaN, '3', null, undefined])(
        'refuses the invalid value %j with the validateConfig wording',
        (value) => {
            const context = fixture();
            expect(
                reasonOf(
                    foldEdit(
                        readTarget(context.state),
                        [period(1, value)],
                        context,
                    ),
                ),
            ).toBe(
                issue({
                    ...config,
                    tasks: [{ ...config.tasks[0], period: value }],
                } as ConfigInput),
            );
        },
    );
    it('refuses a period whose remaining last deadline leaves the exact integers', () => {
        for (const jobs of [0, 4, 9]) {
            const context = fixture();
            activate(context, jobs);
            expect(
                reasonOf(
                    foldEdit(
                        readTarget(context.state),
                        [period(1, Number.MAX_SAFE_INTEGER)],
                        context,
                    ),
                ),
            ).toMatch(/ultrapassa o maior inteiro exato/);
        }
    });
    it('accepts any period after the ten activations', () => {
        const context = fixture();
        activate(context, 10);
        expect(
            foldEdit(
                readTarget(context.state),
                [period(1, Number.MAX_SAFE_INTEGER)],
                context,
            ),
        ).toMatchObject({ ok: true });
    });
    it('refuses a concluded task, also when concluded in the same edit', () => {
        const reason = 'A tarefa 1 está concluída; só a cor pode ser alterada.';
        const context = fixture();
        context.state.tasks[0].status = 'concluded';
        expect(
            reasonOf(
                foldEdit(readTarget(context.state), [period(1, 8)], context),
            ),
        ).toBe(reason);
        const live = fixture();
        expect(
            foldEdit(
                readTarget(live.state),
                [
                    { kind: 'taskState', taskId: 1, state: 'concluded' },
                    period(1, 8),
                ],
                live,
            ),
        ).toEqual({
            ok: false,
            refusals: [{ index: 1, kind: 'taskPeriod', reason }],
        });
    });
    it('refuses unknown and non-integer task identifiers', () => {
        const context = fixture();
        const base = readTarget(context.state);
        expect(reasonOf(foldEdit(base, [period(9, 8)], context))).toBe(
            'Não existe a tarefa 9.',
        );
        expect(
            reasonOf(
                foldEdit(base, [period('1' as unknown as number, 8)], context),
            ),
        ).toContain('O identificador da tarefa deve ser um número inteiro');
    });

    describe('limit with the other items of the same submission', () => {
        /** Both orders of the pair must agree, so order never matters. */
        const bothOrders = (
            context: ReturnType<typeof fixture>,
            a: EditItem,
            b: EditItem,
        ) => [
            foldEdit(readTarget(context.state), [a, b], context),
            foldEdit(readTarget(context.state), [b, a], context),
        ];
        const expectUnsafe = (results: ReturnType<typeof foldEdit>[]) => {
            for (const result of results) {
                expect(result).toMatchObject({ ok: false });
                if (result.ok) return;
                expect(result.refusals).toHaveLength(1);
                expect(result.refusals[0].reason).toMatch(
                    /ultrapassa o maior inteiro exato/,
                );
            }
        };

        it('bounds the period by the pending deadline, in either order', () => {
            const context = fixture();
            activate(context, 4);
            // Last job at 15, period 8: next 23, six remaining, last 23 + 40.
            expectUnsafe(
                bothOrders(
                    context,
                    period(1, 8),
                    deadline(Number.MAX_SAFE_INTEGER - 62),
                ),
            );
            for (const result of bothOrders(
                context,
                period(1, 8),
                deadline(Number.MAX_SAFE_INTEGER - 63),
            )) {
                expect(result).toMatchObject({ ok: true });
            }
        });
        it('bounds the period by the pending arrival before the first activation, in either order', () => {
            const context = fixture();
            // arrival + 9 * 8 + deadline 5 must fit.
            expectUnsafe(
                bothOrders(
                    context,
                    period(1, 8),
                    arrival(Number.MAX_SAFE_INTEGER - 76),
                ),
            );
            for (const result of bothOrders(
                context,
                period(1, 8),
                arrival(Number.MAX_SAFE_INTEGER - 77),
            )) {
                expect(result).toMatchObject({ ok: true });
            }
        });
        it('judges a deadline against the next activation the pending period gives', () => {
            const context = fixture();
            activate(context, 1);
            // Next becomes 0 + 8, nine remain: last 8 + 8 * 8 = 72. The live
            // next activation (5) would let a deadline 3 too large through.
            expectUnsafe(
                bothOrders(
                    context,
                    period(1, 8),
                    deadline(Number.MAX_SAFE_INTEGER - 71),
                ),
            );
            for (const result of bothOrders(
                context,
                period(1, 8),
                deadline(Number.MAX_SAFE_INTEGER - 72),
            )) {
                expect(result).toMatchObject({ ok: true });
            }
        });
    });

    describe('net change', () => {
        const apply = (
            context: ReturnType<typeof fixture>,
            items: EditItem[],
        ) => {
            const before = readTarget(context.state);
            const result = foldEdit(before, items, context);
            if (!result.ok) throw new Error('expected acceptance');
            applyNetChange(context.state, before, result.target);
        };

        it('moves the next activation to the last activation plus the new period', () => {
            const context = fixture({ period: 5 });
            activate(context, 3); // last activation 10, next 15
            context.state.clock = 13;
            apply(context, [period(1, 8)]);
            expect(context.state.tasks[0].nextActivation).toBe(18);
            expect(context.state.tasks[0].jobs).toHaveLength(3);
            expect(context.state.events).toEqual([]);
        });
        it('activates at the clock when the new period is already overdue', () => {
            const context = fixture({ period: 5 });
            activate(context, 3);
            context.state.clock = 13;
            apply(context, [period(1, 2)]);
            expect(context.state.tasks[0].jobs).toHaveLength(4);
            expect(context.state.tasks[0].jobs[3].activation).toBe(13);
            expect(context.state.events).toEqual([
                { kind: 'activation', time: 13, job: { taskId: 1, index: 3 } },
            ]);
            expect(context.state.tasks[0].nextActivation).toBe(15);
        });
        it('leaves no trace when the period returns to the original', () => {
            const context = fixture({ period: 5 });
            activate(context, 3);
            context.state.clock = 13;
            apply(context, [period(1, 8), period(1, 5)]);
            expect(context.state.tasks[0].jobs).toHaveLength(3);
            expect(context.state.tasks[0].nextActivation).toBe(15);
            expect(context.state.events).toEqual([]);
        });
        it('leaves nextActivation null after the ten activations', () => {
            const context = fixture({ period: 5 });
            activate(context, 10);
            context.state.clock = 60;
            apply(context, [period(1, 2)]);
            expect(context.state.tasks[0].nextActivation).toBeNull();
            expect(context.state.tasks[0].jobs).toHaveLength(10);
            expect(context.state.tasks[0].definition.period).toBe(2);
            expect(context.state.events).toEqual([]);
        });
        it('keeps the arrival as the first activation before any job', () => {
            const context = fixture({ arrival: 4, period: 3 });
            apply(context, [period(1, 6)]);
            expect(context.state.tasks[0].nextActivation).toBe(4);
        });
    });
});

describe('task identifier validation', () => {
    it.each([['1'], [[1]], [1.5], [Number.NaN]])(
        'refuses the non-integer task identifier %j',
        (taskId) => {
            const state = createInitialState({
                ...config,
                tasks: [config.tasks[0]],
            });
            const context = { state, baseline: state, hasPolicy: both };
            const result = foldEdit(
                readTarget(state),
                [
                    {
                        kind: 'taskState',
                        taskId,
                        state: 'suspended',
                    } as unknown as EditItem,
                ],
                context,
            );
            expect(result).toMatchObject({
                ok: false,
                refusals: [
                    {
                        index: 0,
                        kind: 'taskState',
                        reason: expect.stringContaining(
                            'O identificador da tarefa deve ser um número inteiro',
                        ),
                    },
                ],
            });
        },
    );
});

describe('editable characteristics (DEC-37 matrix)', () => {
    // A task not yet activated, so every characteristic is still editable.
    const pending = () => {
        const state = createInitialState({
            ...config,
            tasks: [{ ...config.tasks[0], arrival: 3 }],
        });
        return { state, baseline: state, hasPolicy: both };
    };
    const run = (item: unknown) => {
        const context = pending();
        return foldEdit(readTarget(context.state), [item as EditItem], context);
    };

    it.each([
        ['color', { kind: 'taskColor', color: 'aabbcc' }, { color: 'zz' }],
        ['arrival', { kind: 'taskArrival', arrival: 4 }, { arrival: -1 }],
        ['duration', { kind: 'taskDuration', duration: 3 }, { duration: 0 }],
        ['deadline', { kind: 'taskDeadline', deadline: 7 }, { deadline: 0 }],
        ['period', { kind: 'taskPeriod', period: 4 }, { period: 0 }],
    ])('%s has a valid case and a refusal case', (_name, valid, invalid) => {
        const kind = valid.kind;
        expect(run({ ...valid, taskId: 1 })).toMatchObject({ ok: true });
        const refused = run({ kind, taskId: 1, ...invalid });
        expect(refused).toMatchObject({
            ok: false,
            refusals: [{ index: 0, kind }],
        });
        if (refused.ok) return;
        expect(refused.refusals[0].reason).not.toBe('');
    });

    it.each([
        ['ID', 'taskId'],
        ['executed ticks', 'taskExecuted'],
    ])('%s has no item kind and is refused as unknown', (_name, kind) => {
        expect(run({ kind, taskId: 1, value: 2 })).toEqual({
            ok: false,
            refusals: [
                {
                    index: 0,
                    kind,
                    reason: `Tipo de item de edição desconhecido "${kind}".`,
                },
            ],
        });
    });
});
