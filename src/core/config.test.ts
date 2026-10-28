import { describe, expect, it } from 'vitest';
import {
    ConfigValidationError,
    requireValidConfig,
    validateConfig,
    type ConfigInput,
    type ConfigIssue,
} from './config';
import { DEFAULT_CONFIG, type TaskDefinition } from './domain';

function task(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
    return {
        id: 1,
        color: 'F0E0D0',
        arrival: 0,
        duration: 2,
        period: 5,
        deadline: 5,
        rawEvents: '',
        ...overrides,
    };
}

function config(overrides: Partial<ConfigInput> = {}): ConfigInput {
    return { ...DEFAULT_CONFIG, tasks: [task()], ...overrides };
}

function issuesOf(input: ConfigInput): readonly ConfigIssue[] {
    const result = validateConfig(input);
    return result.ok ? [] : result.issues;
}

describe('validateConfig: system fields', () => {
    it('accepts the default configuration (RM, quantum 5, 1 CPU, no tasks)', () => {
        expect(DEFAULT_CONFIG).toEqual({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
            tasks: [],
        });
        expect(validateConfig(DEFAULT_CONFIG).ok).toBe(true);
    });

    it('accepts EDF', () => {
        expect(validateConfig(config({ algorithm: 'EDF' })).ok).toBe(true);
    });

    it.each([
        ['rm', 'RM'],
        ['Edf', 'EDF'],
    ])('accepts the algorithm %j regardless of case, as %j', (written, id) => {
        const result = validateConfig(config({ algorithm: written }));
        expect(result.ok && result.config.algorithm).toBe(id);
    });

    it('rejects an unknown algorithm', () => {
        const issues = issuesOf(config({ algorithm: 'FIFO' }));
        expect(issues).toHaveLength(1);
        expect(issues[0].field).toBe('algorithm');
        expect(issues[0].taskIndex).toBeUndefined();
        expect(issues[0].message).toBe(
            'O campo algoritmo_escalonamento deve ser RM ou EDF; valor recebido: "FIFO".',
        );
    });

    it('rejects a missing algorithm as an issue, not an exception', () => {
        const issues = issuesOf(
            config({ algorithm: undefined as unknown as string }),
        );
        expect(issues.map((issue) => issue.field)).toEqual(['algorithm']);
    });

    it('accepts 1 CPU and many CPUs, with no ceiling of 16', () => {
        expect(validateConfig(config({ cpuCount: 1 })).ok).toBe(true);
        expect(validateConfig(config({ cpuCount: 1000 })).ok).toBe(true);
    });

    it('rejects zero CPUs', () => {
        const issues = issuesOf(config({ cpuCount: 0 }));
        expect(issues.map((i) => i.field)).toEqual(['cpuCount']);
        expect(issues[0].message).toContain('qtde_cpus');
    });

    it('accepts quantum 1 and rejects quantum 0', () => {
        expect(validateConfig(config({ quantum: 1 })).ok).toBe(true);
        expect(issuesOf(config({ quantum: 0 })).map((i) => i.field)).toEqual([
            'quantum',
        ]);
    });

    it('rejects non-integer and non-finite numbers', () => {
        expect(issuesOf(config({ quantum: 1.5 })).map((i) => i.field)).toEqual([
            'quantum',
        ]);
        expect(issuesOf(config({ cpuCount: NaN })).map((i) => i.field)).toEqual(
            ['cpuCount'],
        );
        expect(
            issuesOf(config({ quantum: Infinity })).map((i) => i.field),
        ).toEqual(['quantum']);
    });

    it('accepts an empty task list (the file rule of at least one task belongs to the parser)', () => {
        expect(validateConfig(config({ tasks: [] })).ok).toBe(true);
    });
});

describe('validateConfig: task fields', () => {
    function taskIssues(
        overrides: Partial<TaskDefinition>,
    ): readonly ConfigIssue[] {
        return issuesOf(config({ tasks: [task(overrides)] }));
    }

    it.each([
        ['id', { id: 1 }],
        ['arrival', { arrival: 0 }],
        ['duration', { duration: 1 }],
        ['period (aperiodic)', { period: 0 }],
        ['deadline', { deadline: 1 }],
    ])('accepts the lower bound of %s', (_name, overrides) => {
        expect(taskIssues(overrides)).toEqual([]);
    });

    it.each([
        ['id', { id: 0 }, 'id'],
        ['arrival', { arrival: -1 }, 'ingresso'],
        ['duration', { duration: 0 }, 'duracao'],
        ['period', { period: -1 }, 'periodo'],
        ['deadline', { deadline: 0 }, 'prazo'],
    ] as const)(
        'rejects %s below its lower bound, naming the file field',
        (field, overrides, label) => {
            const issues = taskIssues(overrides);
            expect(issues).toHaveLength(1);
            expect(issues[0]).toMatchObject({ field, taskIndex: 0 });
            expect(issues[0].message).toContain(label);
        },
    );

    it('accepts a deadline shorter than the duration or the period (overload is not a config error)', () => {
        expect(taskIssues({ duration: 4, period: 10, deadline: 2 })).toEqual(
            [],
        );
    });

    it('rejects a non-integer task field', () => {
        expect(taskIssues({ duration: 2.5 }).map((i) => i.field)).toEqual([
            'duration',
        ]);
    });

    it('rejects duplicate ids and reports the later task', () => {
        const issues = issuesOf(
            config({ tasks: [task(), task({ color: '000000' })] }),
        );
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ field: 'id', taskIndex: 1 });
    });

    it.each(['F0E0D0', 'f0e0d0', '0a1B2c'])('accepts color %s', (color) => {
        expect(taskIssues({ color })).toEqual([]);
    });

    it.each(['#F0E0D0', 'F0E0D', 'F0E0D0A', 'GGGGGG', ''])(
        'rejects color %j',
        (color) => {
            const issues = taskIssues({ color });
            expect(issues.map((i) => i.field)).toEqual(['color']);
            expect(issues[0].message).toContain('cor');
        },
    );

    it('rejects the same color written in different case', () => {
        const issues = issuesOf(
            config({
                tasks: [
                    task({ color: 'abcdef' }),
                    task({ id: 2, color: 'ABCDEF' }),
                ],
            }),
        );
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ field: 'color', taskIndex: 1 });
    });

    it('rejects a periodic task whose last absolute deadline is not an exact integer', () => {
        const period = Math.floor(Number.MAX_SAFE_INTEGER / 9);
        const issues = taskIssues({ period, deadline: period });
        expect(issues.map((i) => i.field)).toEqual(['deadline']);
        expect(issues[0].combined).toBe(true);
    });

    it('accepts a periodic task whose last absolute deadline is exactly representable', () => {
        const period = Math.floor(Number.MAX_SAFE_INTEGER / 10);
        expect(taskIssues({ period, deadline: period })).toEqual([]);
    });

    it('rejects an aperiodic task whose absolute deadline is not an exact integer', () => {
        const issues = taskIssues({
            period: 0,
            arrival: Number.MAX_SAFE_INTEGER,
            deadline: 1,
        });
        expect(issues.map((i) => i.field)).toEqual(['deadline']);
        expect(issues[0].combined).toBe(true);
    });

    it('does not mark an issue about a single field as combined', () => {
        const issues = taskIssues({ deadline: 0 });
        expect(issues).toHaveLength(1);
        expect(issues[0]).not.toHaveProperty('combined');
    });
});

describe('validateConfig: result', () => {
    it('collects every issue instead of stopping at the first', () => {
        const issues = issuesOf(
            config({
                quantum: 0,
                tasks: [
                    task({ duration: 0 }),
                    task({ id: 2, color: '000000', period: -3 }),
                ],
            }),
        );
        expect(issues.map((i) => [i.field, i.taskIndex])).toEqual([
            ['quantum', undefined],
            ['duration', 0],
            ['period', 1],
        ]);
    });

    it('returns a normalized copy with uppercase colors and leaves the input untouched', () => {
        const input = config({ tasks: [task({ color: 'f0e0d0' })] });
        const result = validateConfig(input);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.config.tasks[0].color).toBe('F0E0D0');
        expect(input.tasks[0].color).toBe('f0e0d0');
        expect(result.config.tasks).not.toBe(input.tasks);
        expect(result.config.tasks[0]).not.toBe(input.tasks[0]);
    });

    it('preserves the raw event list without interpreting it', () => {
        const rawEvents = 'ML1:3; mu1:5 , io:7';
        const result = validateConfig(config({ tasks: [task({ rawEvents })] }));
        expect(result.ok && result.config.tasks[0].rawEvents).toBe(rawEvents);
    });

    it('freezes the returned configuration', () => {
        const result = validateConfig(config());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Object.isFrozen(result.config)).toBe(true);
        expect(Object.isFrozen(result.config.tasks)).toBe(true);
        expect(Object.isFrozen(result.config.tasks[0])).toBe(true);
    });
});

describe('requireValidConfig', () => {
    it('returns the normalized configuration from validateConfig', () => {
        const input = config({ tasks: [task({ color: 'f0e0d0' })] });
        const result = requireValidConfig(input);

        expect(result).not.toBe(input);
        expect(result.tasks[0].color).toBe('F0E0D0');
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('throws ConfigValidationError with the issues of validateConfig (DEC-15, DEC-28)', () => {
        const input = config({ quantum: 0, tasks: [task({ duration: 0 })] });
        let error: unknown;
        try {
            requireValidConfig(input);
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(ConfigValidationError);
        expect((error as ConfigValidationError).issues).toEqual(
            issuesOf(input),
        );
    });
});
