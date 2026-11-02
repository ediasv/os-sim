import type { EditItem } from '../../../core/edit';
import type { AlgorithmId, TaskId, TaskStatus } from '../../../core/domain';
import type { EditItemRefusal } from '../../../core/refusal';

/**
 * Turns what the user typed in a form into the items of one edit (DEC-37
 * item 4). Only the format is checked here (a whole number); every rule of the
 * domain, such as period >= 1 or a distinct color, stays with the core, whose
 * refusal comes back per item and is mapped to the field by `refusalsByField`.
 */

/** Name of a form field; the key of its error message. */
export type FieldKey = string;

/** A built edit: its items and, in the same order, the field of each. */
export interface BuiltEdit {
    readonly items: readonly EditItem[];
    /** `fields[refusal.index]` is the field a refusal belongs to. */
    readonly fields: readonly FieldKey[];
}

export type BuildResult =
    | { readonly ok: true; readonly edit: BuiltEdit }
    | {
          readonly ok: false;
          readonly errors: Readonly<Record<FieldKey, string>>;
      };

/** Values of the task form, as text, except the chosen state. */
export interface TaskDraft {
    readonly color: string;
    readonly arrival: string;
    readonly duration: string;
    readonly deadline: string;
    readonly period: string;
    readonly state: TaskStatus;
}

export interface SystemDraft {
    readonly algorithm: AlgorithmId;
    readonly quantum: string;
    readonly cpuCount: string;
}

/** Blank `id`, `color` and `period` are left to the core (DEC-29, DEC-48). */
export interface AddTaskDraft {
    readonly id: string;
    readonly color: string;
    readonly arrival: string;
    readonly duration: string;
    readonly deadline: string;
    readonly period: string;
}

const NOT_A_WHOLE_NUMBER = 'Informe um número inteiro, sem sinal nem casas.';

/** Whole number from text, or null when the text is not one. */
function parseWhole(text: string): number | null {
    const trimmed = text.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Reads the numeric fields of a draft; collects an error per malformed one. */
function readNumbers<K extends string>(
    draft: Readonly<Record<K, string>>,
    keys: readonly K[],
): { values: Record<K, number>; errors: Record<FieldKey, string> } {
    const values = {} as Record<K, number>;
    const errors: Record<FieldKey, string> = {};
    for (const key of keys) {
        const parsed = parseWhole(draft[key]);
        if (parsed === null) errors[key] = NOT_A_WHOLE_NUMBER;
        else values[key] = parsed;
    }
    return { values, errors };
}

function failed(errors: Record<FieldKey, string>): BuildResult {
    return { ok: false, errors };
}

/** Collects `[field, item]` pairs in order and splits them into a `BuiltEdit`. */
function built(
    entries: readonly (readonly [FieldKey, EditItem])[],
): BuildResult {
    return {
        ok: true,
        edit: {
            items: entries.map(([, item]) => item),
            fields: entries.map(([field]) => field),
        },
    };
}

const TASK_NUMBERS = ['arrival', 'duration', 'deadline', 'period'] as const;

/**
 * Items for the fields of a task that differ from `original`. The state goes
 * last, so characteristic edits are judged before the task is finished.
 */
export function buildTaskEdit(
    taskId: TaskId,
    original: TaskDraft,
    draft: TaskDraft,
): BuildResult {
    const now = readNumbers(draft, TASK_NUMBERS);
    if (Object.keys(now.errors).length > 0) return failed(now.errors);
    const before = readNumbers(original, TASK_NUMBERS).values;

    const entries: (readonly [FieldKey, EditItem])[] = [];
    const color = draft.color.trim();
    if (color.toUpperCase() !== original.color.toUpperCase()) {
        entries.push(['color', { kind: 'taskColor', taskId, color }]);
    }
    if (now.values.arrival !== before.arrival) {
        entries.push([
            'arrival',
            { kind: 'taskArrival', taskId, arrival: now.values.arrival },
        ]);
    }
    if (now.values.duration !== before.duration) {
        entries.push([
            'duration',
            { kind: 'taskDuration', taskId, duration: now.values.duration },
        ]);
    }
    if (now.values.deadline !== before.deadline) {
        entries.push([
            'deadline',
            { kind: 'taskDeadline', taskId, deadline: now.values.deadline },
        ]);
    }
    if (now.values.period !== before.period) {
        entries.push([
            'period',
            { kind: 'taskPeriod', taskId, period: now.values.period },
        ]);
    }
    if (draft.state !== original.state) {
        entries.push([
            'state',
            { kind: 'taskState', taskId, state: draft.state },
        ]);
    }
    return built(entries);
}

/** Items for the system fields that differ from `original`. */
export function buildSystemEdit(
    original: SystemDraft,
    draft: SystemDraft,
): BuildResult {
    const now = readNumbers(draft, ['quantum', 'cpuCount'] as const);
    if (Object.keys(now.errors).length > 0) return failed(now.errors);
    const before = readNumbers(original, [
        'quantum',
        'cpuCount',
    ] as const).values;

    const entries: (readonly [FieldKey, EditItem])[] = [];
    if (draft.algorithm !== original.algorithm) {
        entries.push([
            'algorithm',
            { kind: 'algorithm', algorithm: draft.algorithm },
        ]);
    }
    if (now.values.quantum !== before.quantum) {
        entries.push([
            'quantum',
            { kind: 'quantum', quantum: now.values.quantum },
        ]);
    }
    if (now.values.cpuCount !== before.cpuCount) {
        entries.push([
            'cpuCount',
            { kind: 'cpuCount', cpuCount: now.values.cpuCount },
        ]);
    }
    return built(entries);
}

/**
 * One `addTask` item. It carries several fields, so the core's single reason
 * for it is shown on the form as a whole (field `task`).
 */
export function buildAddTask(draft: AddTaskDraft): BuildResult {
    const required = readNumbers(draft, [
        'arrival',
        'duration',
        'deadline',
    ] as const);
    const errors = { ...required.errors };
    const period = draft.period.trim();
    const periodValue = period === '' ? undefined : parseWhole(period);
    if (periodValue === null) {
        return failed({ ...errors, period: NOT_A_WHOLE_NUMBER });
    }
    if (Object.keys(errors).length > 0) return failed(errors);

    const id = draft.id.trim();
    const color = draft.color.trim();
    return built([
        [
            'task',
            {
                kind: 'addTask',
                task: {
                    ...(id === '' ? {} : { id }),
                    ...(color === '' ? {} : { color }),
                    arrival: required.values.arrival,
                    duration: required.values.duration,
                    deadline: required.values.deadline,
                    ...(periodValue === undefined
                        ? {}
                        : { period: periodValue }),
                },
            },
        ],
    ]);
}

/** Reasons of the refused items, keyed by the field each item came from. */
export function refusalsByField(
    edit: BuiltEdit,
    refusals: readonly EditItemRefusal[],
): Readonly<Record<FieldKey, string>> {
    const byField: Record<FieldKey, string> = {};
    for (const refusal of refusals) {
        const field = edit.fields[refusal.index];
        if (field === undefined) continue;
        byField[field] =
            field in byField
                ? `${byField[field]}\n${refusal.reason}`
                : refusal.reason;
    }
    return byField;
}
