import type { AlgorithmId, SystemConfig, TaskDefinition } from './domain';

const HEADER_FIELDS = [
    'algoritmo_escalonamento',
    'quantum',
    'qtde_cpus',
] as const;

const TASK_FIELDS = [
    'id',
    'cor',
    'ingresso',
    'duracao',
    'periodo',
    'prazo',
] as const;

export interface ConfigParseIssue {
    readonly line: number;
    readonly field: string;
    readonly value: string | null;
    readonly message: string;
}

export type ConfigParseResult =
    | { readonly ok: true; readonly config: SystemConfig }
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
    const issues: ConfigParseIssue[] = [];
    const lines = text.split(/\r\n|\n|\r/);
    const sourceLines: SourceLine[] = lines
        .map((line, index) => ({ number: index + 1, text: line.trim() }))
        .filter((line) => line.text.length > 0);
    const headerLine = sourceLines[0];
    let header: Omit<SystemConfig, 'tasks'> | null = null;
    let taskLines = sourceLines.slice(1);

    if (!headerLine) {
        addIssue(
            issues,
            1,
            'cabecalho',
            null,
            `cabecalho ausente; esperada uma linha com ${HEADER_FIELDS.join('; ')}.`,
        );
        return { ok: false, issues };
    }

    const firstField = headerLine.text.split(';', 1)[0].trim();
    if (parseNumber(firstField) !== null) {
        addIssue(
            issues,
            1,
            'cabecalho',
            null,
            `cabecalho ausente; esperada uma linha com ${HEADER_FIELDS.join('; ')}.`,
        );
        taskLines = sourceLines;
    } else {
        header = parseHeader(headerLine, issues);
    }

    const tasks: TaskDefinition[] = [];

    if (taskLines.length === 0) {
        const endsWithLineBreak = /(?:\r\n|\n|\r)$/.test(text);
        const physicalLineCount = lines.length - (endsWithLineBreak ? 1 : 0);
        addIssue(
            issues,
            physicalLineCount + 1,
            'tarefa',
            null,
            'esperada pelo menos uma tarefa; nenhuma linha de tarefa foi recebida.',
        );
    }

    for (const line of taskLines) {
        const task = parseTask(line, issues);
        if (task) tasks.push(task);
    }

    if (!header || issues.length > 0) {
        return { ok: false, issues };
    }

    return {
        ok: true,
        config: {
            ...header,
            tasks,
        },
    };
}

function parseHeader(
    line: SourceLine,
    issues: ConfigParseIssue[],
): Omit<SystemConfig, 'tasks'> | null {
    const fields = line.text.split(';').map((field) => field.trim());
    if (fields.length > HEADER_FIELDS.length && fields.at(-1) === '') {
        fields.pop();
    }

    if (fields.length > HEADER_FIELDS.length) {
        addIssue(
            issues,
            line.number,
            'cabecalho',
            line.text,
            `esperada uma linha de cabecalho com ${HEADER_FIELDS.length} campos; recebidos ${fields.length}.`,
        );
    }

    const startIssueCount = issues.length;
    const values: (string | number)[] = [];

    HEADER_FIELDS.forEach((field, index) => {
        const value = fields[index];
        if (value === undefined || value.length === 0) {
            addIssue(
                issues,
                line.number,
                field,
                null,
                `campo obrigatorio ausente; esperados ${HEADER_FIELDS.length} campos e recebidos ${fields.length}.`,
            );
            return;
        }

        if (index === 0) {
            const algorithm = value.toUpperCase();
            if (algorithm !== 'RM' && algorithm !== 'EDF') {
                addIssue(
                    issues,
                    line.number,
                    field,
                    value,
                    'esperado RM ou EDF.',
                );
            } else {
                values.push(algorithm);
            }
            return;
        }

        const number = parseNumber(value);
        if (number === null) {
            addIssue(issues, line.number, field, value, 'esperado um numero.');
        } else {
            values.push(number);
        }
    });

    if (issues.length !== startIssueCount) return null;
    return {
        algorithm: values[0] as AlgorithmId,
        quantum: values[1] as number,
        cpuCount: values[2] as number,
    };
}

function parseTask(
    line: SourceLine,
    issues: ConfigParseIssue[],
): TaskDefinition | null {
    const startIssueCount = issues.length;
    const fields: string[] = [];
    let remainder = line.text;
    let hasEventField = false;

    for (let index = 0; index < TASK_FIELDS.length; index += 1) {
        const separator = remainder.indexOf(';');
        if (separator < 0) {
            if (remainder.length > 0) {
                fields.push(remainder.trim());
            }
            for (const field of TASK_FIELDS.slice(fields.length)) {
                addIssue(
                    issues,
                    line.number,
                    field,
                    null,
                    `campo obrigatorio ausente; esperados 7 campos e recebidos ${fields.length}.`,
                );
            }
            break;
        }
        fields.push(remainder.slice(0, separator).trim());
        remainder = remainder.slice(separator + 1);
        if (index === TASK_FIELDS.length - 1) hasEventField = true;
    }

    if (!hasEventField) {
        addIssue(
            issues,
            line.number,
            'lista_eventos',
            null,
            `campo obrigatorio ausente; esperados 7 campos e recebidos ${fields.length}.`,
        );
    }
    if (hasEventField && remainder.endsWith(';')) {
        remainder = remainder.slice(0, -1);
    }
    const rawEvents = hasEventField ? remainder.trim() : '';
    const values: number[] = [];

    fields.forEach((value, index) => {
        const field = TASK_FIELDS[index];
        if (value.length === 0) {
            addIssue(
                issues,
                line.number,
                field,
                null,
                'campo obrigatorio ausente.',
            );
            return;
        }

        if (index === 1) return;
        const number = parseNumber(value);
        if (number === null) {
            addIssue(issues, line.number, field, value, 'esperado um numero.');
        } else {
            values.push(number);
        }
    });

    if (issues.length !== startIssueCount) return null;
    return {
        id: values[0],
        color: fields[1].toUpperCase(),
        arrival: values[1],
        duration: values[2],
        period: values[3],
        deadline: values[4],
        rawEvents,
    };
}

function parseNumber(value: string): number | null {
    if (value.length === 0) return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : number;
}

function addIssue(
    issues: ConfigParseIssue[],
    line: number,
    field: string,
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
