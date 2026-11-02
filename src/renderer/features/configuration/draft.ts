import { validateConfig, type ConfigIssue } from '../../../core/config';
import {
    DEFAULT_TASK_PERIOD,
    type SystemConfig,
    type TaskDefinition,
    type TaskId,
} from '../../../core/domain';
import { sameTaskId, suggestTaskId } from '../../../core/taskId';

/**
 * Edits of the configuration being prepared (#36, FE-03, FE-11). Every edit
 * builds the candidate configuration and lets the core's `validateConfig`
 * accept or reject it, so limits and reasons are the core's (DEC-10); a
 * rejected edit returns the issues and the caller keeps the previous draft.
 * The one rule decided here is DEC-29 item 3: a period typed by the user must
 * be above zero, because the core still accepts zero as aperiodic.
 */

/** System fields as typed; `algorithm` stays text so the core judges it. */
export interface SystemValues {
    readonly algorithm: string;
    readonly quantum: number;
    readonly cpuCount: number;
}

/** Task fields of the form. Blank numeric inputs arrive as `NaN`. */
export interface TaskValues {
    readonly id: TaskId;
    readonly color: string;
    readonly arrival: number;
    readonly duration: number;
    readonly period: number;
    readonly deadline: number;
}

export type DraftResult =
    | { readonly ok: true; readonly config: SystemConfig }
    | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/** Suggested colors, in order; the first not in use is offered (FE-19). */
const PALETTE = [
    '6BA7F2',
    'F28C59',
    '7ACB6A',
    'C77DE0',
    'E8C547',
    '4CC9C0',
    'E86F8C',
    'A0A8B8',
] as const;

/** Suggested ID for a new task: the core's rule over the IDs in use (DEC-48). */
export function nextTaskId(config: SystemConfig): TaskId {
    return suggestTaskId(config.tasks.map((task) => task.id));
}

/** First palette color no task uses; beyond the palette, a derived one. */
export function suggestColor(config: SystemConfig): string {
    const used = new Set(config.tasks.map((task) => task.color.toUpperCase()));
    const free = PALETTE.find((color) => !used.has(color));
    if (free !== undefined) return free;
    for (let n = PALETTE.length + 1; ; n++) {
        const hex = ((n * 2654435761) >>> 8)
            .toString(16)
            .toUpperCase()
            .padStart(6, '0')
            .slice(-6);
        if (!used.has(hex)) return hex;
    }
}

/** Values a task created on the screen starts from (DEC-29 item 3). */
export function newTaskValues(config: SystemConfig): TaskValues {
    return {
        id: nextTaskId(config),
        color: suggestColor(config),
        arrival: 0,
        duration: 1,
        period: DEFAULT_TASK_PERIOD,
        deadline: DEFAULT_TASK_PERIOD,
    };
}

export function applySystem(
    config: SystemConfig,
    values: SystemValues,
): DraftResult {
    return validateConfig({ ...config, ...values });
}

/**
 * Adds a task (`replacing` null) or replaces the one with that id in place.
 * A new task goes last, as the file loader would place it.
 */
export function saveTask(
    config: SystemConfig,
    values: TaskValues,
    replacing: TaskId | null,
): DraftResult {
    const index =
        replacing === null
            ? config.tasks.length
            : config.tasks.findIndex((task) => sameTaskId(task.id, replacing));
    const previous = config.tasks[index] as TaskDefinition | undefined;
    const task: TaskDefinition = {
        ...values,
        rawEvents: previous?.rawEvents ?? '',
    };
    const tasks =
        previous === undefined
            ? [...config.tasks, task]
            : config.tasks.map((existing, i) =>
                  i === index ? task : existing,
              );

    const result = validateConfig({ ...config, tasks });
    if (values.period === 0) {
        const zero: ConfigIssue = {
            field: 'period',
            taskIndex: index,
            message:
                'Toda tarefa precisa de período maior que zero (DEC-29); valor recebido: 0.',
        };
        return {
            ok: false,
            issues: [...(result.ok ? [] : result.issues), zero],
        };
    }
    return result;
}

export function removeTask(config: SystemConfig, id: TaskId): SystemConfig {
    return {
        ...config,
        tasks: config.tasks.filter((task) => !sameTaskId(task.id, id)),
    };
}
