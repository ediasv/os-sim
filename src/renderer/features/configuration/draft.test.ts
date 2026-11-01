import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_TASK_PERIOD } from '../../../core/domain';
import type { SystemConfig, TaskDefinition } from '../../../core/domain';
import {
    applySystem,
    newTaskValues,
    nextTaskId,
    removeTask,
    saveTask,
    suggestColor,
} from './draft';

function task(id: number, color: string, extra = {}): TaskDefinition {
    return {
        id,
        color,
        arrival: 0,
        duration: 2,
        period: 10,
        deadline: 10,
        rawEvents: '',
        ...extra,
    };
}

const withTasks = (...tasks: TaskDefinition[]): SystemConfig => ({
    ...DEFAULT_CONFIG,
    tasks,
});

describe('new task values', () => {
    it('starts at id 1 with the default period when the draft is empty', () => {
        const values = newTaskValues(DEFAULT_CONFIG);

        expect(values.id).toBe(1);
        expect(values.period).toBe(DEFAULT_TASK_PERIOD);
        expect(values.color).toMatch(/^[0-9A-F]{6}$/);
    });

    it('takes the largest id in use plus one, not the count', () => {
        expect(
            nextTaskId(withTasks(task(2, 'AAAAAA'), task(7, 'BBBBBB'))),
        ).toBe(8);
    });

    it('suggests a color no task uses, whatever its letter case', () => {
        const first = suggestColor(DEFAULT_CONFIG);
        const next = suggestColor(withTasks(task(1, first.toLowerCase())));

        expect(next).not.toBe(first);
        expect(next).toMatch(/^[0-9A-F]{6}$/);
    });
});

describe('applySystem', () => {
    it('replaces algorithm, quantum and CPUs and keeps the tasks', () => {
        const base = withTasks(task(1, 'AAAAAA'));

        const result = applySystem(base, {
            algorithm: 'edf',
            quantum: 3,
            cpuCount: 4,
        });

        expect(result).toMatchObject({
            ok: true,
            config: { algorithm: 'EDF', quantum: 3, cpuCount: 4 },
        });
        expect(result.ok && result.config.tasks).toEqual(base.tasks);
    });

    it('returns the core reasons for invalid values and builds no config', () => {
        const result = applySystem(DEFAULT_CONFIG, {
            algorithm: 'RM',
            quantum: 0,
            cpuCount: 1.5,
        });

        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues.map((i) => i.field)).toEqual([
            'quantum',
            'cpuCount',
        ]);
        expect(!result.ok && result.issues[0].message).toContain('quantum');
    });
});

describe('saveTask', () => {
    const values = {
        id: 1,
        color: 'f0e0d0',
        arrival: 0,
        duration: 3,
        period: 15,
        deadline: 10,
    };

    it('adds a task, keeping the order and uppercasing the color', () => {
        const result = saveTask(withTasks(task(2, 'AAAAAA')), values, null);

        expect(result.ok && result.config.tasks.map((t) => t.id)).toEqual([
            2, 1,
        ]);
        expect(result.ok && result.config.tasks[1]).toMatchObject({
            color: 'F0E0D0',
            period: 15,
            rawEvents: '',
        });
    });

    it('edits in place, keeping the position and the stored events', () => {
        const base = withTasks(
            task(1, 'AAAAAA', { rawEvents: 'x' }),
            task(2, 'BBBBBB'),
        );

        const result = saveTask(
            base,
            { ...values, duration: 9, color: 'AAAAAA' },
            1,
        );

        expect(result.ok && result.config.tasks[0]).toMatchObject({
            id: 1,
            duration: 9,
            rawEvents: 'x',
        });
        expect(result.ok && result.config.tasks).toHaveLength(2);
    });

    it('refuses period zero with its reason and changes nothing (DEC-29)', () => {
        const base = withTasks(task(2, 'AAAAAA'));

        const result = saveTask(base, { ...values, period: 0 }, null);

        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues).toEqual([
            expect.objectContaining({
                field: 'period',
                taskIndex: 1,
                message: expect.stringContaining('maior que zero'),
            }),
        ]);
        expect(base.tasks).toHaveLength(1);
    });

    it('relays the core reasons, such as a color already used', () => {
        const base = withTasks(task(1, 'AAAAAA'));

        const result = saveTask(
            base,
            { ...values, id: 2, color: 'aaaaaa' },
            null,
        );

        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues[0]).toMatchObject({
            field: 'color',
            taskIndex: 1,
        });
    });

    it('treats a blank number (NaN) as invalid input, not as zero', () => {
        const result = saveTask(
            DEFAULT_CONFIG,
            { ...values, duration: NaN },
            null,
        );

        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues[0].field).toBe('duration');
    });
});

describe('removeTask', () => {
    it('drops only the chosen task', () => {
        const base = withTasks(task(1, 'AAAAAA'), task(2, 'BBBBBB'));

        const config = removeTask(base, 1);

        expect(config.tasks.map((t) => t.id)).toEqual([2]);
        expect(base.tasks).toHaveLength(2);
    });
});
