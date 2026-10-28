import {
    FILE_LABELS,
    type ConfigField,
    type ConfigInput,
    type FileFieldLabel,
} from './config';
import type { TaskDefinition } from './domain';

const HEADER_FIELDS = [
    'algorithm',
    'quantum',
    'cpuCount',
] as const satisfies readonly ConfigField[];

const TASK_FIELDS = [
    'id',
    'color',
    'arrival',
    'duration',
    'period',
    'deadline',
] as const satisfies readonly ConfigField[];

/** Optional last task field; kept as text, so it has no core field (A.3.3.5). */
const EVENTS_LABEL = 'lista_eventos';

const HEADER_FORMAT = HEADER_FIELDS.map((field) => FILE_LABELS[field]).join(
    ';',
);
const TASK_FORMAT = [
    ...TASK_FIELDS.map((field) => FILE_LABELS[field]),
    EVENTS_LABEL,
].join(';');

/** Field an issue points at: a file field, or the missing header or task line. */
export type ConfigParseField = FileFieldLabel | 'cabecalho' | 'tarefa';

export interface ConfigParseIssue {
    readonly line: number;
    readonly field: ConfigParseField;
    readonly value: string | null;
    readonly message: string;
}

/** Where each parsed part came from, so core issues can point at a line. */
export interface ConfigSourceLines {
    /** Original 1-based line of the header. */
    readonly header: number;
    /** Original line of `config.tasks[i]`, to place core issues by `taskIndex` (DEC-19). */
    readonly tasks: readonly number[];
}

export type ConfigParseResult =
    | {
          readonly ok: true;
          readonly config: ConfigInput;
          readonly lines: ConfigSourceLines;
      }
    | { readonly ok: false; readonly issues: readonly ConfigParseIssue[] };

/** Text received for each field, as written (trimmed), keyed by core field. */
export type ConfigFieldTexts = Readonly<Partial<Record<ConfigField, string>>>;

/**
 * A structurally valid file, with where and how each part was written, so core
 * issues can be placed on it (DEC-19).
 */
export interface ConfigDraft {
    readonly config: ConfigInput;
    readonly lines: ConfigSourceLines;
    /** Texts received for the header fields. */
    readonly headerTexts: ConfigFieldTexts;
    /** Texts received for `config.tasks[i]`, in the same order. */
    readonly taskTexts: readonly ConfigFieldTexts[];
}

/**
 * Either the draft or every syntax issue, never both: with a syntax issue the
 * tasks that parsed are not the file, so the core must not see them (DEC-19).
 */
export type ConfigAnalysis =
    | { readonly ok: true; readonly draft: ConfigDraft }
    | { readonly ok: false; readonly issues: readonly ConfigParseIssue[] };

interface SourceLine {
    readonly number: number;
    readonly text: string;
}

/**
 * Parses the file structure without applying the semantic rules owned by the
 * core validator (DEC-10). Source line numbers are retained for diagnostics.
 */
export function parseConfig(text: string): ConfigParseResult {
    const analysis = analyzeConfig(text);
    if (!analysis.ok) return analysis;
    const { config, lines } = analysis.draft;
    return { ok: true, config, lines };
}

/**
 * Like `parseConfig`, but also returns the received texts, so the loader can
 * show them in the core's problems (DEC-19).
 */
export function analyzeConfig(text: string): ConfigAnalysis {
    const issues: ConfigParseIssue[] = [];
    const lines = text.split(/\r\n|\n|\r/);
    const sourceLines: SourceLine[] = lines
        .map((line, index) => ({ number: index + 1, text: line.trim() }))
        .filter((line) => line.text.length > 0);
    const headerLine = sourceLines[0];
    let header: ParsedHeader | null = null;
    let taskLines = sourceLines.slice(1);

    // A numeric first field means the header is missing: task lines start with
    // a numeric id and no algorithm name is numeric. Every line is then parsed
    // as a task, so its own errors are reported too (DEC-19).
    const firstField = headerLine?.text.split(';', 1)[0].trim();
    if (headerLine === undefined || parseNumber(firstField ?? '') !== null) {
        addIssue(
            issues,
            1,
            'cabecalho',
            null,
            `cabeçalho ausente (formato: ${HEADER_FORMAT}).`,
        );
        taskLines = sourceLines;
    } else {
        header = parseHeader(headerLine, issues);
    }

    const tasks: TaskDefinition[] = [];
    const taskLineNumbers: number[] = [];
    const taskTexts: ConfigFieldTexts[] = [];

    if (taskLines.length === 0) {
        const endsWithLineBreak = /(?:\r\n|\n|\r)$/.test(text);
        const physicalLineCount =
            text === '' ? 0 : lines.length - (endsWithLineBreak ? 1 : 0);
        addIssue(
            issues,
            physicalLineCount + 1,
            'tarefa',
            null,
            `nenhuma linha de tarefa encontrada; esperada pelo menos uma (formato: ${TASK_FORMAT}).`,
        );
    }

    for (const line of taskLines) {
        const parsed = parseTask(line, issues);
        if (parsed) {
            tasks.push(parsed.task);
            taskLineNumbers.push(line.number);
            taskTexts.push(parsed.texts);
        }
    }

    if (!header || !headerLine || issues.length > 0) {
        return { ok: false, issues };
    }

    return {
        ok: true,
        draft: {
            config: { ...header.config, tasks },
            lines: { header: headerLine.number, tasks: taskLineNumbers },
            headerTexts: header.texts,
            taskTexts,
        },
    };
}

interface ParsedHeader {
    readonly config: Omit<ConfigInput, 'tasks'>;
    readonly texts: ConfigFieldTexts;
}

function parseHeader(
    line: SourceLine,
    issues: ConfigParseIssue[],
): ParsedHeader | null {
    const fields = stripOptionalFinalSemicolon(line.text)
        .split(';')
        .map((field) => field.trim());

    if (fields.length > HEADER_FIELDS.length) {
        addIssue(
            issues,
            line.number,
            'cabecalho',
            line.text,
            `esperados ${HEADER_FIELDS.length} campos no cabeçalho (formato: ${HEADER_FORMAT}) e recebidos ${fields.length}.`,
        );
    }

    const countReason = `campo obrigatório ausente; esperados ${HEADER_FIELDS.length} campos (formato: ${HEADER_FORMAT}) e recebidos ${fields.length}.`;
    let algorithm: string | undefined;
    const numbers: Partial<Record<'quantum' | 'cpuCount', number>> = {};

    HEADER_FIELDS.forEach((field, index) => {
        const value = requiredField(
            line,
            field,
            fields[index],
            countReason,
            issues,
        );
        if (value === null) return;

        // Kept as written: the core decides if the algorithm is valid and
        // uppercases it, so its message shows the received text (DEC-19).
        if (field === 'algorithm') {
            algorithm = value;
            return;
        }

        const number = numericField(line, field, value, issues);
        if (number !== null) numbers[field] = number;
    });

    const { quantum, cpuCount } = numbers;
    if (
        fields.length > HEADER_FIELDS.length ||
        algorithm === undefined ||
        quantum === undefined ||
        cpuCount === undefined
    ) {
        return null;
    }
    return {
        config: { algorithm, quantum, cpuCount },
        texts: textsOf(HEADER_FIELDS, fields),
    };
}

interface ParsedTask {
    readonly task: TaskDefinition;
    readonly texts: ConfigFieldTexts;
}

function parseTask(
    line: SourceLine,
    issues: ConfigParseIssue[],
): ParsedTask | null {
    // DEC-20: the event list is everything after the sixth ";", kept with its
    // inner separators; without a sixth ";" the task simply has no events.
    const segments = stripOptionalFinalSemicolon(line.text).split(';');
    const fields = segments
        .slice(0, TASK_FIELDS.length)
        .map((field) => field.trim());
    const rawEvents = segments.slice(TASK_FIELDS.length).join(';').trim();

    const countReason = `campo obrigatório ausente; esperados ${TASK_FIELDS.length} campos antes da ${EVENTS_LABEL} opcional (formato: ${TASK_FORMAT}) e recebidos ${fields.length}.`;
    let color: string | undefined;
    const numbers: Partial<
        Record<Exclude<(typeof TASK_FIELDS)[number], 'color'>, number>
    > = {};

    TASK_FIELDS.forEach((field, index) => {
        const value = requiredField(
            line,
            field,
            fields[index],
            countReason,
            issues,
        );
        if (value === null) return;

        // Kept as written: the core compares and uppercases colors, so its
        // message shows the received text (DEC-19).
        if (field === 'color') {
            color = value;
            return;
        }

        const number = numericField(line, field, value, issues);
        if (number !== null) numbers[field] = number;
    });

    const { id, arrival, duration, period, deadline } = numbers;
    if (
        color === undefined ||
        id === undefined ||
        arrival === undefined ||
        duration === undefined ||
        period === undefined ||
        deadline === undefined
    ) {
        return null;
    }
    return {
        task: { id, color, arrival, duration, period, deadline, rawEvents },
        texts: textsOf(TASK_FIELDS, fields),
    };
}

function textsOf(
    names: readonly ConfigField[],
    fields: readonly string[],
): ConfigFieldTexts {
    return Object.fromEntries(
        names.map((name, index) => [name, fields[index]]),
    );
}

/**
 * Returns the text of a required field, or reports it missing: `countReason`
 * when the line ended before it, a plain reason when it is present but empty.
 */
function requiredField(
    line: SourceLine,
    field: ConfigField,
    value: string | undefined,
    countReason: string,
    issues: ConfigParseIssue[],
): string | null {
    if (value === undefined || value.length === 0) {
        addIssue(
            issues,
            line.number,
            FILE_LABELS[field],
            null,
            value === undefined ? countReason : 'campo obrigatório ausente.',
        );
        return null;
    }
    return value;
}

function numericField(
    line: SourceLine,
    field: ConfigField,
    value: string,
    issues: ConfigParseIssue[],
): number | null {
    const number = parseNumber(value);
    if (number === null) {
        addIssue(
            issues,
            line.number,
            FILE_LABELS[field],
            value,
            'esperado um número.',
        );
    }
    return number;
}

/** Any line may end with one optional ";" (A.3.3.3, DEC-20). */
function stripOptionalFinalSemicolon(text: string): string {
    return text.endsWith(';') ? text.slice(0, -1).trimEnd() : text;
}

/**
 * Decimal numerals only (DEC-20): `Number()` alone would silently turn `0x10`
 * into 16. Integer and range rules stay with the core validator (DEC-10).
 */
const DECIMAL_NUMERAL = /^[+-]?\d+(?:\.\d+)?$/;

function parseNumber(value: string): number | null {
    return DECIMAL_NUMERAL.test(value) ? Number(value) : null;
}

function addIssue(
    issues: ConfigParseIssue[],
    line: number,
    field: ConfigParseField,
    value: string | null,
    reason: string,
): void {
    const received = value === null ? 'valor ausente' : `valor "${value}"`;
    issues.push({
        line,
        field,
        value,
        message: `Linha ${line}, campo ${field}, ${received}: ${reason}`,
    });
}
