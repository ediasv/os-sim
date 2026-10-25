/**
 * Loads configuration text: syntax by the parser, semantics by the core
 * validator, one report for both (DEC-19). The semantic rules stay in
 * `validateConfig`; this module only places its problems on the file.
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
 * Parses and validates the text. Syntax issues and core problems are reported
 * together whenever the header and some tasks parsed; without a header nothing
 * is validated, so no semantic diagnostic is made up (DEC-19).
 */
export function loadConfig(text: string): ConfigLoadResult {
    const { issues, draft } = analyzeConfig(text);
    if (draft === null) {
        return { ok: false, issues };
    }

    const validation = validateConfig(draft.config);
    if (validation.ok && issues.length === 0) {
        return { ok: true, config: validation.config, lines: draft.lines };
    }

    const semantic = validation.ok
        ? []
        : validation.issues.map((issue) => placeOnFile(issue, draft));
    // Stable sort: on one line, syntax issues stay ahead of core problems.
    return {
        ok: false,
        issues: [...issues, ...semantic].sort((a, b) => a.line - b.line),
    };
}

/**
 * Adds the line, field and received text to a core message without changing
 * the message. References to other tasks keep the core's ordinals (DEC-19).
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
    const value = texts[issue.field] ?? null;
    const received = value === null ? '' : ` (valor ${value})`;

    return {
        line,
        field,
        value,
        message: `Linha ${line}, campo ${field}${received}: ${issue.message}`,
    };
}
