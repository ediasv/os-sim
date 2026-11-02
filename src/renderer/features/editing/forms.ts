import type { AlgorithmId, TaskStatus } from '../../../core/domain';
import type { InspectionTask } from '../inspection/inspection';
import type {
    AddTaskDraft,
    FieldKey,
    SystemDraft,
    TaskDraft,
} from './buildEdit';

/**
 * What each edit form shows: its fields, their hints and the scope warnings
 * the spec asks for (FE-12, FE-13, FE-16, FE-19), and the starting values.
 * Describes presentation only: whether a value is accepted is the core's
 * answer (DEC-37), shown on the field after the edit is sent.
 */

export interface FormField {
    readonly key: FieldKey;
    readonly label: string;
    readonly hint?: string;
    readonly unit?: string;
    /** Present for a select; the value is the form value. */
    readonly options?: readonly { value: string; label: string }[];
    readonly disabled?: boolean;
    /** Why the field is blocked, shown as text and as `title`. */
    readonly disabledReason?: string;
    /** Shown instead of a form value, for what is never edited (the ID). */
    readonly fixedValue?: string;
    /** Takes the whole row instead of half of it. */
    readonly wide?: boolean;
}

export interface FormSpec {
    readonly fields: readonly FormField[];
    readonly initial: Readonly<Record<FieldKey, string>>;
}

const ARRIVAL_LOCKED =
    'O ingresso não pode ser alterado pois a tarefa já ingressou.';
const CONCLUDED_LOCKED = 'Tarefa concluída: só a cor pode ser alterada.';

const STATE_OPTIONS: readonly { value: TaskStatus; label: string }[] = [
    { value: 'ready', label: 'Pronta' },
    { value: 'forced', label: 'Forçada (executando)' },
    { value: 'suspended', label: 'Suspensa' },
    { value: 'concluded', label: 'Concluída (encerrar)' },
];

export function taskForm(task: InspectionTask): FormSpec {
    const { definition } = task;
    const concluded = task.choice === 'concluded';
    // Presentation of DEC-37: the arrival is closed once the first job exists.
    // The core stays the authority and its refusal is shown if it differs.
    const activated = task.jobs.length > 0;
    const whenConcluded = concluded
        ? { disabled: true, disabledReason: CONCLUDED_LOCKED }
        : {};

    const periodHint =
        'Ticks entre ativações (≥ 1). Muda a prioridade no RM já neste tick.' +
        (task.nextActivation === null
            ? ' Todas as ativações já ocorreram: no EDF fica guardado, sem efeito visível.'
            : ` Próxima ativação: tick ${task.nextActivation}.`);

    const fields: FormField[] = [
        {
            key: 'id',
            label: 'ID',
            fixedValue: definition.id,
            disabled: true,
            hint: 'O ID não muda depois de criado.',
        },
        {
            key: 'color',
            label: 'Cor',
            hint: 'RRGGBB, diferente das outras tarefas.',
        },
        {
            key: 'arrival',
            label: 'Ingresso',
            unit: 'ticks',
            ...(concluded
                ? whenConcluded
                : activated
                  ? { disabled: true, disabledReason: ARRIVAL_LOCKED }
                  : {
                        hint: 'Instante da primeira ativação (≥ tick editado).',
                    }),
        },
        {
            key: 'duration',
            label: 'Duração',
            unit: 'ticks',
            hint: 'Ticks de CPU por job (≥ 1). Vale a partir da próxima ativação; jobs já ativados mantêm a duração.',
            ...whenConcluded,
        },
        {
            key: 'deadline',
            label: 'Prazo relativo',
            unit: 'ticks',
            hint: 'Prazo em ticks (≥ 1). Vale a partir da próxima ativação; jobs já ativados mantêm o prazo absoluto.',
            ...whenConcluded,
        },
        {
            key: 'period',
            label: 'Período',
            unit: 'ticks',
            hint: periodHint,
            ...whenConcluded,
        },
        {
            key: 'state',
            label: 'Estado da tarefa',
            options: STATE_OPTIONS,
            wide: true,
            hint: 'Suspender não pausa o prazo e retomar não garante CPU. Forçar dá CPU antes da política (no máximo uma tarefa por CPU). Concluir interrompe os jobs incompletos e impede novas ativações.',
            ...whenConcluded,
        },
    ];

    return {
        fields,
        initial: {
            color: definition.color,
            arrival: String(definition.arrival),
            duration: String(definition.duration),
            deadline: String(definition.deadline),
            period: String(definition.period),
            state: task.choice,
        },
    };
}

export function systemForm(config: {
    readonly algorithm: AlgorithmId;
    readonly quantum: number;
    readonly cpuCount: number;
}): FormSpec {
    return {
        fields: [
            {
                key: 'algorithm',
                label: 'Algoritmo de escalonamento',
                wide: true,
                options: [
                    { value: 'RM', label: 'RM — Rate Monotonic' },
                    { value: 'EDF', label: 'EDF — Earliest Deadline First' },
                ],
                hint: 'Vale já na seleção do tick editado.',
            },
            {
                key: 'quantum',
                label: 'Quantum',
                unit: 'ticks',
                hint: 'Inteiro ≥ 1. Editar preserva o consumo da fatia atual e pode vencê-la já neste tick.',
            },
            {
                key: 'cpuCount',
                label: 'Processadores',
                unit: 'CPUs',
                hint: 'Inteiro ≥ 1, sem máximo. Ao reduzir, saem as CPUs de maior ID e a seleção global pode migrar jobs.',
            },
        ],
        initial: {
            algorithm: config.algorithm,
            quantum: String(config.quantum),
            cpuCount: String(config.cpuCount),
        },
    };
}

export function addTaskForm(suggestedId: string, tick: number): FormSpec {
    return {
        fields: [
            {
                key: 'id',
                label: 'ID',
                hint: 'Sugerido pelo sistema; pode digitar outro. Nunca reutiliza o ID de uma tarefa já usada.',
            },
            {
                key: 'color',
                label: 'Cor',
                hint: 'RRGGBB. Em branco: o sistema escolhe uma cor distinta.',
            },
            {
                key: 'arrival',
                label: 'Ingresso',
                unit: 'ticks',
                hint: 'Instante da primeira ativação (≥ tick atual).',
            },
            {
                key: 'duration',
                label: 'Duração',
                unit: 'ticks',
                hint: 'Ticks de CPU por job (≥ 1).',
            },
            {
                key: 'deadline',
                label: 'Prazo relativo',
                unit: 'ticks',
                hint: 'Prazo em ticks (≥ 1).',
            },
            {
                key: 'period',
                label: 'Período',
                unit: 'ticks',
                hint: 'Ticks entre ativações (≥ 1). Em branco usa 15.',
            },
        ],
        initial: {
            id: suggestedId,
            color: '',
            arrival: String(tick),
            duration: '',
            deadline: '',
            period: '15',
        },
    };
}

type Values = Readonly<Record<FieldKey, string>>;

export function toTaskDraft(values: Values): TaskDraft {
    return {
        color: values.color,
        arrival: values.arrival,
        duration: values.duration,
        deadline: values.deadline,
        period: values.period,
        state: values.state as TaskStatus,
    };
}

export function toSystemDraft(values: Values): SystemDraft {
    return {
        algorithm: values.algorithm as AlgorithmId,
        quantum: values.quantum,
        cpuCount: values.cpuCount,
    };
}

export function toAddTaskDraft(values: Values): AddTaskDraft {
    return {
        id: values.id,
        color: values.color,
        arrival: values.arrival,
        duration: values.duration,
        deadline: values.deadline,
        period: values.period,
    };
}
