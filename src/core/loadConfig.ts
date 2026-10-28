/**
 * Loads configuration text: syntax by the parser, then semantics by the core
 * validator (DEC-19). The semantic rules stay in `validateConfig`; this module
 * only places its problems on the file.
 */
import { FILE_LABELS, validateConfig, type ConfigIssue } from './config';
import type { SystemConfig } from './domain';
import {
    analyzeConfig,
    type ConfigDraft,
    type ConfigParseIssue,
    type ConfigSourceLines,
} from './parser';

export type ConfigLoadResult =
    | {
          readonly ok: true;
          /** Validated copy, as `validateConfig` returns it. */
          readonly config: SystemConfig;
          readonly lines: ConfigSourceLines;
      }
    | { readonly ok: false; readonly issues: readonly ConfigParseIssue[] };

/**
 * Parses and validates the text. The core sees the file only when it has no
 * syntax issue: the core names other tasks by position ("1ª tarefa"), so a
 * dropped line would shift those ordinals and hide conflicts with it (DEC-19).
 */
export function loadConfig(text: string): ConfigLoadResult {
    const analysis = analyzeConfig(text);
    if (!analysis.ok) return analysis;

    const { draft } = analysis;
    const validation = validateConfig(draft.config);
    if (validation.ok) {
        return { ok: true, config: validation.config, lines: draft.lines };
    }
    return {
        ok: false,
        issues: validation.issues.map((issue) => placeOnFile(issue, draft)),
    };
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
