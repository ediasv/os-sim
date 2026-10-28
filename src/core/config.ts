/**
 * Semantic validation of a whole configuration (DEC-10). The core validates
 * before anything is applied, so a rejected configuration never leaves partial
 * changes behind (REQ-05). The file loader (`loadConfig`) only places issues on
 * lines, by `taskIndex`.
 */
import {
    MAX_PERIODIC_JOBS,
    type AlgorithmId,
    type SystemConfig,
    type TaskDefinition,
} from './domain';
import { freezeCopy } from './helpers/freezeCopy';

/** Configuration field an issue refers to, in the core's vocabulary. */
export type ConfigField =
    | 'algorithm'
    | 'quantum'
    | 'cpuCount'
    | keyof Omit<TaskDefinition, 'rawEvents'>;

/** One reason the configuration was rejected; `message` is shown to the user. */
export interface ConfigIssue {
    readonly field: ConfigField;
    /** Position of the task in `tasks`; absent for system fields. */
    readonly taskIndex?: number;
    /**
     * Set when several fields together cause the problem (named in `message`),
     * so no single received text explains it; `field` is where it shows.
     */
    readonly combined?: true;
    readonly message: string;
}

export type ConfigResult =
    | { readonly ok: true; readonly config: SystemConfig }
    | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/**
 * Rejection of a whole configuration (DEC-15). Keeps every issue with its
 * field and task index, the same issues `validateConfig` returns and the file
 * loader places on lines; `message` joins the issue messages for plain display.
 */
export class ConfigValidationError extends Error {
    readonly issues: readonly ConfigIssue[];

    constructor(issues: readonly ConfigIssue[]) {
        super(issues.map((issue) => issue.message).join('\n'));
        this.name = 'ConfigValidationError';
        this.issues = freezeCopy(issues);
    }
}

const ALGORITHMS: readonly AlgorithmId[] = ['RM', 'EDF'];

/**
 * Field names as written in the configuration file, so messages match what the
 * user typed. Shared with the file parser, which reports issues by these names.
 */
export const FILE_LABELS = {
    algorithm: 'algoritmo_escalonamento',
    quantum: 'quantum',
    cpuCount: 'qtde_cpus',
    id: 'id',
    color: 'cor',
    arrival: 'ingresso',
    duration: 'duracao',
    period: 'periodo',
    deadline: 'prazo',
} as const satisfies Record<ConfigField, string>;

/** A configuration field as the file names it. */
export type FileFieldLabel = (typeof FILE_LABELS)[ConfigField];

/** Six hex digits without `#`, the format given by the assignment (A.3.3). */
const COLOR_PATTERN = /^[0-9A-F]{6}$/i;

/** Lower bound of each integer field; no field has an upper bound (DEC-05, DEC-10). */
const MINIMUMS = {
    quantum: 1,
    cpuCount: 1,
    id: 1,
    arrival: 0,
    duration: 1,
    period: 0,
    deadline: 1,
} as const;

/**
 * Checks every rule of DEC-10 and reports all issues at once, so the user can
 * fix a file in one pass. On success returns a frozen copy with colors in
 * uppercase; the input is never mutated.
 */
export function validateConfig(input: SystemConfig): ConfigResult {
    const issues: ConfigIssue[] = [];

    if (!ALGORITHMS.includes(input.algorithm)) {
        issues.push({
            field: 'algorithm',
            message: `O campo ${FILE_LABELS.algorithm} deve ser RM ou EDF; valor recebido: ${describe(input.algorithm)}.`,
        });
    }
    checkInteger(issues, 'quantum', input.quantum);
    checkInteger(issues, 'cpuCount', input.cpuCount);

    const firstIndexById = new Map<number, number>();
    const firstIndexByColor = new Map<string, number>();

    input.tasks.forEach((task, taskIndex) => {
        const fieldsValid = (
            ['id', 'arrival', 'duration', 'period', 'deadline'] as const
        )
            .map((field) => checkInteger(issues, field, task[field], taskIndex))
            .every(Boolean);

        if (Number.isSafeInteger(task.id)) {
            const previous = firstIndexById.get(task.id);
            if (previous === undefined) {
                firstIndexById.set(task.id, taskIndex);
            } else {
                issues.push({
                    field: 'id',
                    taskIndex,
                    message: `O ${FILE_LABELS.id} ${task.id} já foi usado pela ${ordinalTask(previous)}; cada tarefa precisa de um id único.`,
                });
            }
        }

        if (typeof task.color === 'string' && COLOR_PATTERN.test(task.color)) {
            const color = task.color.toUpperCase();
            const previous = firstIndexByColor.get(color);
            if (previous === undefined) {
                firstIndexByColor.set(color, taskIndex);
            } else {
                issues.push({
                    field: 'color',
                    taskIndex,
                    message: `A ${FILE_LABELS.color} ${color} já foi usada pela ${ordinalTask(previous)}; cada tarefa precisa de uma cor diferente.`,
                });
            }
        } else {
            issues.push({
                field: 'color',
                taskIndex,
                message: `O campo ${FILE_LABELS.color} deve ter 6 dígitos hexadecimais RGB, sem "#" (por exemplo F0E0D0); valor recebido: ${describe(task.color)}.`,
            });
        }

        if (fieldsValid) {
            checkLastDeadline(issues, task, taskIndex);
        }
    });

    if (issues.length > 0) {
        return { ok: false, issues };
    }

    return {
        ok: true,
        config: Object.freeze({
            algorithm: input.algorithm,
            quantum: input.quantum,
            cpuCount: input.cpuCount,
            tasks: Object.freeze(
                input.tasks.map((task) =>
                    Object.freeze({ ...task, color: task.color.toUpperCase() }),
                ),
            ),
        }),
    };
}

/**
 * Returns the validated copy or throws `ConfigValidationError` with every
 * issue. It is the only place a rejected configuration becomes that error, so
 * the Simulator constructor and the factory report the same error before any
 * policy error (DEC-15, DEC-28).
 */
export function requireValidConfig(input: SystemConfig): SystemConfig {
    const result = validateConfig(input);
    if (!result.ok) {
        throw new ConfigValidationError(result.issues);
    }
    return result.config;
}

/** Pushes an issue unless `value` is an exact integer at or above the field's minimum. */
function checkInteger(
    issues: ConfigIssue[],
    field: keyof typeof MINIMUMS,
    value: number,
    taskIndex?: number,
): boolean {
    const minimum = MINIMUMS[field];
    if (Number.isSafeInteger(value) && value >= minimum) {
        return true;
    }
    issues.push({
        field,
        ...(taskIndex === undefined ? {} : { taskIndex }),
        message: `O campo ${FILE_LABELS[field]} deve ser um número inteiro maior ou igual a ${minimum}; valor recebido: ${describe(value)}.`,
    });
    return false;
}

/**
 * The engine computes absolute deadlines up to the last activation; rejecting
 * values beyond the exact-integer range keeps every derived time exact (DEC-10).
 */
function checkLastDeadline(
    issues: ConfigIssue[],
    task: TaskDefinition,
    taskIndex: number,
): void {
    const lastActivation =
        task.period > 0
            ? task.arrival + (MAX_PERIODIC_JOBS - 1) * task.period
            : task.arrival;
    if (Number.isSafeInteger(lastActivation + task.deadline)) {
        return;
    }
    const formula =
        task.period > 0
            ? `${FILE_LABELS.arrival} + ${MAX_PERIODIC_JOBS - 1} × ${FILE_LABELS.period} + ${FILE_LABELS.deadline}`
            : `${FILE_LABELS.arrival} + ${FILE_LABELS.deadline}`;
    issues.push({
        field: 'deadline',
        taskIndex,
        combined: true,
        message: `O prazo da última ativação (${formula}) ultrapassa o maior inteiro exato suportado (${Number.MAX_SAFE_INTEGER}).`,
    });
}

function ordinalTask(taskIndex: number): string {
    return `${taskIndex + 1}ª tarefa`;
}

function describe(value: unknown): string {
    return typeof value === 'string' ? `"${value}"` : String(value);
}
