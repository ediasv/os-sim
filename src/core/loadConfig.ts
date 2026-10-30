/**
 * Loads configuration text: syntax by the parser, then semantics by the core
 * validator (DEC-19). The semantic rules stay in `validateConfig`; this module
 * places its problems on the file and applies one Project A rule before it:
 * a missing or zero period becomes the default period, with a warning (DEC-29).
 */
import {
    FILE_LABELS,
    validateConfig,
    type ConfigInput,
    type ConfigIssue,
} from './config';
import { DEFAULT_TASK_PERIOD, type SystemConfig } from './domain';
import {
    analyzeConfig,
    type ConfigDraft,
    type ConfigParseIssue,
    type ConfigSourceLines,
} from './parser';

/** A task the loader changed; it never blocks loading (DEC-29). */
export type ConfigLoadWarning = ConfigParseIssue & { readonly taskId: number };

export type ConfigLoadResult =
    | {
          readonly ok: true;
          /** Validated copy, as `validateConfig` returns it. */
          readonly config: SystemConfig;
          readonly lines: ConfigSourceLines;
          /** One per task that received the default period, in file order. */
          readonly warnings: readonly ConfigLoadWarning[];
      }
    | { readonly ok: false; readonly issues: readonly ConfigParseIssue[] };

/**
 * Parses and validates the text. The core sees the file only when it has no
 * syntax issue: the core names other tasks by position ("1ª tarefa"), so a
 * dropped line would shift those ordinals and hide conflicts with it (DEC-19).
 * The default period is applied before validation, so the core checks the
 * task as it will run, including its last deadline.
 */
export function loadConfig(text: string): ConfigLoadResult {
    const analysis = analyzeConfig(text);
    if (!analysis.ok) return analysis;

    const { draft } = analysis;
    const { config, warnings } = applyDefaultPeriod(draft);
    const validation = validateConfig(config);
    if (validation.ok) {
        return {
            ok: true,
            config: validation.config,
            lines: draft.lines,
            warnings,
        };
    }
    return {
        ok: false,
        issues: validation.issues.map((issue) => placeOnFile(issue, draft)),
    };
}

/**
 * Gives every task with period 0 (empty field or a zero as written) the
 * default period and one warning (DEC-29). Task order is kept, so the draft's
 * lines and texts still describe the returned tasks. The draft is not mutated.
 */
function applyDefaultPeriod(draft: ConfigDraft): {
    config: ConfigInput;
    warnings: ConfigLoadWarning[];
} {
    const warnings: ConfigLoadWarning[] = [];
    const tasks = draft.config.tasks.map((task, taskIndex) => {
        if (task.period !== 0) return task;

        const line = draft.lines.tasks[taskIndex];
        const field = FILE_LABELS.period;
        const value = draft.taskTexts[taskIndex].period || null;
        const received = value === null ? '' : ` (valor ${value})`;
        warnings.push({
            line,
            field,
            value,
            taskId: task.id,
            message: `Linha ${line}, campo ${field}${received}: toda tarefa precisa de período maior que zero; a tarefa ${task.id} usará o período padrão de ${DEFAULT_TASK_PERIOD} ticks.`,
        });
        return { ...task, period: DEFAULT_TASK_PERIOD };
    });
    return { config: { ...draft.config, tasks }, warnings };
}

/**
 * Adds the line, field and received text to a core message without changing
 * the message. References to other tasks keep the core's ordinals (DEC-19).
 * A combined issue gets no received text: the field's own text would point
 * at a value that may be valid.
 */
function placeOnFile(issue: ConfigIssue, draft: ConfigDraft): ConfigParseIssue {
    const { taskIndex } = issue;
    const line =
        taskIndex === undefined
            ? draft.lines.header
            : draft.lines.tasks[taskIndex];
    const texts =
        taskIndex === undefined
            ? draft.headerTexts
            : draft.taskTexts[taskIndex];
    const field = FILE_LABELS[issue.field];
    const value = issue.combined ? null : (texts[issue.field] ?? null);
    const received = value === null ? '' : ` (valor ${value})`;

    return {
        line,
        field,
        value,
        message: `Linha ${line}, campo ${field}${received}: ${issue.message}`,
    };
}
