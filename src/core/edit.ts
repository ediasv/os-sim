/**
 * Edits made during the simulation (REQ-05, DEC-37, DEC-39, DEC-40). Owns the item
 * kinds, their validation in order over the state of the edit stage, and the
 * net change of a tick: items are folded onto an `EditTarget` (what the user
 * asked for), not onto the state, because only the end result of the tick's
 * edits counts (DEC-37 item 5). The engine then applies the difference
 * between the target before and after the edits, so edits that cancel out
 * leave no trace.
 *
 * Adding a kind means adding a member to `EditItem`, a field to `EditTarget`
 * (system fields also enter `TARGET_FIELDS`) and a handler to `HANDLERS`.
 * A task-level kind (`taskState`, DEC-41) also needs its slice of the target
 * filled by `readTarget` and applied by `applyNetChange`, which the compiler
 * does not check.
 * A `cpuCount` change also edits the CPU list: `applyNetChange` appends or
 * removes the highest IDs and records `cpu-added`/`cpu-removed` (DEC-40).
 */
import { validateConfig, type ConfigField } from './config';
import { maxJobs } from './domain';
import type {
    AlgorithmId,
    DeepReadonly,
    JobRef,
    SimulationState,
    SystemConfig,
    TaskId,
    TaskStatus,
} from './domain';
import type { EditItemRefusal } from './refusal';

/** One change the user asks for. */
export type EditItem =
    | { readonly kind: 'algorithm'; readonly algorithm: AlgorithmId }
    | { readonly kind: 'quantum'; readonly quantum: number }
    | { readonly kind: 'cpuCount'; readonly cpuCount: number }
    | {
          readonly kind: 'taskState';
          readonly taskId: TaskId;
          readonly state: TaskStatus;
      };

/** One edit (one form submission): its items, in order. */
export type Edit = readonly EditItem[];

/**
 * What the user asked for at the edit stage: the editable subset of the
 * configuration (tied to `SystemConfig` so a field cannot drift from it) plus
 * the chosen status of each task. Only the system fields are in
 * `TARGET_FIELDS`; task states are applied per task by `applyNetChange` and
 * must never be copied into the configuration.
 */
export type EditTarget = Readonly<
    Pick<SystemConfig, 'algorithm' | 'quantum' | 'cpuCount'>
> & { readonly taskStates: Readonly<Record<TaskId, TaskStatus>> };

/** System fields of the target; task states must never leak into configuration. */
const TARGET_FIELDS: Readonly<
    Record<keyof Omit<EditTarget, 'taskStates'>, true>
> = {
    algorithm: true,
    quantum: true,
    cpuCount: true,
};

/** What validation may read: the edit-stage state and the known policies. */
export interface EditContext {
    readonly state: DeepReadonly<SimulationState>;
    readonly hasPolicy: (algorithm: AlgorithmId) => boolean;
}

type ItemResult =
    | { readonly ok: true; readonly target: EditTarget }
    | { readonly ok: false; readonly reason: string };

type Handlers = {
    readonly [K in EditItem['kind']]: (
        target: EditTarget,
        item: Extract<EditItem, { kind: K }>,
        context: EditContext,
    ) => ItemResult;
};

/**
 * Checks one system field with `validateConfig`, the single source of its
 * rule and wording (DEC-28; reason chosen by the user in #115), over the
 * configuration as the earlier items left it. On success returns the
 * normalized value (the algorithm in uppercase).
 */
function checkSystemField<F extends 'algorithm' | 'quantum' | 'cpuCount'>(
    target: EditTarget,
    field: F & ConfigField,
    value: unknown,
    context: EditContext,
): { ok: true; value: SystemConfig[F] } | { ok: false; reason: string } {
    const result = validateConfig({
        ...context.state.config,
        ...target,
        [field]: value,
    } as Parameters<typeof validateConfig>[0]);
    if (!result.ok) {
        const issues = result.issues.filter((issue) => issue.field === field);
        if (issues.length > 0) {
            return {
                ok: false,
                reason: issues.map((issue) => issue.message).join(' '),
            };
        }
        throw new Error(
            `The configuration at the edit stage is invalid:\n${result.issues.map((issue) => issue.message).join('\n')}`,
        );
    }
    return { ok: true, value: result.config[field] };
}

/** Accepted transitions, including identity edits, from DEC-37. */
const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
    ready: ['ready', 'forced', 'suspended', 'concluded'],
    forced: ['ready', 'forced', 'suspended', 'concluded'],
    suspended: ['ready', 'forced', 'suspended', 'concluded'],
    concluded: ['concluded'],
};

/**
 * Forced tasks reserve capacity even before their next activation, but not
 * once they have finished: they can never use a CPU again (DEC-41).
 */
function forcedCount(
    target: EditTarget,
    state: DeepReadonly<SimulationState>,
): number {
    return Object.entries(target.taskStates).filter(
        ([id, status]) =>
            status === 'forced' && !hasFinished(state, Number(id)),
    ).length;
}

/**
 * Whether the task ran every activation it will ever have (DEC-09). Forcing
 * it would reserve a CPU it can never use, so the edit is refused (DEC-41).
 * Concluded tasks are already refused by the transition table.
 */
function hasFinished(
    state: DeepReadonly<SimulationState>,
    taskId: TaskId,
): boolean {
    const tcb = state.tasks.find((t) => t.definition.id === taskId);
    return (
        tcb !== undefined &&
        tcb.jobs.length === maxJobs(tcb.definition) &&
        tcb.jobs.every((job) => job.state === 'completed')
    );
}

const HANDLERS: Handlers = {
    taskState: (target, item, context) => {
        // hasOwn coerces its key, so '1' or [1] would silently name task 1.
        if (!Number.isInteger(item.taskId)) {
            return {
                ok: false,
                reason: `O identificador da tarefa deve ser um número inteiro; valor recebido: ${JSON.stringify(item.taskId) ?? String(item.taskId)}.`,
            };
        }
        if (!Object.hasOwn(target.taskStates, item.taskId)) {
            return { ok: false, reason: `Não existe a tarefa ${item.taskId}.` };
        }
        if (
            typeof item.state !== 'string' ||
            !Object.hasOwn(TRANSITIONS, item.state)
        ) {
            return {
                ok: false,
                reason: `Estado de tarefa inválido: ${JSON.stringify(item.state)}.`,
            };
        }
        const previous = target.taskStates[item.taskId];
        if (!TRANSITIONS[previous].includes(item.state)) {
            return {
                ok: false,
                reason: `A tarefa ${item.taskId} está concluída e não pode mudar de estado.`,
            };
        }
        if (
            item.state === 'forced' &&
            previous !== 'forced' &&
            hasFinished(context.state, item.taskId)
        ) {
            return {
                ok: false,
                reason: `A tarefa ${item.taskId} já terminou e não pode ser forçada.`,
            };
        }
        const count = forcedCount(target, context.state);
        if (
            item.state === 'forced' &&
            previous !== 'forced' &&
            count >= target.cpuCount
        ) {
            return {
                ok: false,
                reason: `Não há CPUs para forçar a tarefa ${item.taskId}: já há ${count} ${count === 1 ? 'tarefa forçada' : 'tarefas forçadas'} para ${target.cpuCount} ${target.cpuCount === 1 ? 'CPU' : 'CPUs'}.`,
            };
        }
        return {
            ok: true,
            target: {
                ...target,
                taskStates: { ...target.taskStates, [item.taskId]: item.state },
            },
        };
    },
    cpuCount: (target, item, context) => {
        const checked = checkSystemField(
            target,
            'cpuCount',
            item.cpuCount,
            context,
        );
        if (!checked.ok) return checked;
        const count = forcedCount(target, context.state);
        if (checked.value < count) {
            return {
                ok: false,
                reason: `Não é possível reduzir para ${checked.value} ${checked.value === 1 ? 'CPU' : 'CPUs'}: há ${count} tarefas forçadas.`,
            };
        }
        return { ok: true, target: { ...target, cpuCount: checked.value } };
    },
    algorithm: (target, item, context) => {
        const checked = checkSystemField(
            target,
            'algorithm',
            item.algorithm,
            context,
        );
        if (!checked.ok) return checked;
        if (!context.hasPolicy(checked.value)) {
            return {
                ok: false,
                reason: `Nenhuma política de escalonamento está registrada para o algoritmo ${checked.value}.`,
            };
        }
        return { ok: true, target: { ...target, algorithm: checked.value } };
    },
    quantum: (target, item, context) => {
        const checked = checkSystemField(
            target,
            'quantum',
            item.quantum,
            context,
        );
        if (!checked.ok) return checked;
        return { ok: true, target: { ...target, quantum: checked.value } };
    },
};

/** The parameters in force at the edit stage, before this tick's edits. */
export function readTarget(state: DeepReadonly<SimulationState>): EditTarget {
    return {
        algorithm: state.config.algorithm,
        quantum: state.config.quantum,
        cpuCount: state.config.cpuCount,
        taskStates: Object.fromEntries(
            state.tasks.map((tcb) => [tcb.definition.id, tcb.status]),
        ),
    };
}

/**
 * Folds the items of one edit onto `target`, in order, each validated after
 * the earlier ones (DEC-37 item 4). A refused item is not folded, and the
 * items after it are judged without it, so every refused item gets its
 * reason in one pass (DEC-39). Any refusal refuses the whole edit.
 */
export function foldEdit(
    target: EditTarget,
    edit: Edit,
    context: EditContext,
):
    | { readonly ok: true; readonly target: EditTarget }
    | { readonly ok: false; readonly refusals: readonly EditItemRefusal[] } {
    const refusals: EditItemRefusal[] = [];
    let current = target;
    edit.forEach((item, index) => {
        const kind: unknown = (item as { kind?: unknown } | null)?.kind;
        // A malformed item must be refused, never crash on String().
        const label = typeof kind === 'string' ? kind : JSON.stringify(kind);
        const handler =
            typeof kind === 'string' && Object.hasOwn(HANDLERS, kind)
                ? (HANDLERS[kind as EditItem['kind']] as (
                      target: EditTarget,
                      item: EditItem,
                      context: EditContext,
                  ) => ItemResult)
                : undefined;
        if (handler === undefined) {
            refusals.push({
                index,
                kind: label ?? 'undefined',
                reason: `Tipo de item de edição desconhecido ${JSON.stringify(kind)}.`,
            });
            return;
        }
        const result = handler(current, item, context);
        if (result.ok) {
            current = result.target;
        } else {
            refusals.push({ index, kind: item.kind, reason: result.reason });
        }
    });
    return refusals.length > 0
        ? { ok: false, refusals }
        : { ok: true, target: current };
}

/**
 * Applies only the difference between the target before and after the
 * tick's edits (DEC-37 item 5). Task status changes come first, in task-list
 * order, with their events (`suspension`, `resumption`, `forced`, `unforced`,
 * `task-finished`; DEC-41); CPU events come after (DEC-22). The configuration
 * is replaced, never mutated, because snapshots and restored states share it
 * (DEC-35). Algorithm and quantum record no event (DEC-37). A `cpuCount` change removes
 * the highest IDs or appends the next ones, recording `cpu-removed` or
 * `cpu-added` in ascending ID order (DEC-40).
 */
export function applyNetChange(
    state: SimulationState,
    before: EditTarget,
    after: EditTarget,
): void {
    const fields = Object.keys(TARGET_FIELDS) as (keyof typeof TARGET_FIELDS)[];
    if (fields.some((field) => after[field] !== before[field])) {
        state.config = Object.freeze({
            ...state.config,
            ...Object.fromEntries(fields.map((f) => [f, after[f]])),
        });
    }

    // Task order is observable in the event log; all task changes precede CPUs.
    for (const tcb of state.tasks) {
        const taskId = tcb.definition.id;
        const previous = before.taskStates[taskId];
        const next = after.taskStates[taskId];
        if (previous === next) continue;
        tcb.status = next;
        const owner = state.cpus.find((cpu) => cpu.running?.taskId === taskId);
        if (next === 'concluded') {
            const interrupted: JobRef[] = [];
            for (const job of tcb.jobs) {
                if (job.state === 'completed' || job.state === 'interrupted')
                    continue;
                job.state = 'interrupted';
                interrupted.push({ taskId, index: job.index });
            }
            if (owner !== undefined) {
                owner.running = null;
                owner.sliceElapsed = 0;
            }
            // A task that already finished naturally has its task-finished event (possibly logged at this same tick, before the edit stage per DEC-22); concluding it must not log a second one (DEC-41).
            if (
                !state.events.some(
                    (event) =>
                        event.kind === 'task-finished' &&
                        event.taskId === taskId,
                )
            ) {
                state.events.push({
                    kind: 'task-finished',
                    time: state.clock,
                    taskId,
                    interrupted,
                });
            }
            continue;
        }
        if (previous === 'forced') {
            state.events.push({ kind: 'unforced', time: state.clock, taskId });
            if (owner !== undefined) owner.sliceElapsed = 0;
        }
        if (next === 'suspended') {
            state.events.push({
                kind: 'suspension',
                time: state.clock,
                taskId,
                cpuId: owner?.id ?? null,
            });
            if (owner !== undefined && owner.running !== null) {
                const job = tcb.jobs[owner.running.index];
                if (job.state === 'running') job.state = 'ready';
                owner.running = null;
                owner.sliceElapsed = 0;
            }
        } else if (previous === 'suspended') {
            state.events.push({
                kind: 'resumption',
                time: state.clock,
                taskId,
            });
        }
        if (next === 'forced') {
            state.events.push({ kind: 'forced', time: state.clock, taskId });
        }
    }

    // Only the final target is materialized. Surviving CPUs keep their
    // slice; removed owners lose it without a fictitious preemption (DEC-37).
    if (state.cpus.length !== before.cpuCount) {
        throw new Error(
            `Cannot change the CPU count: ${state.cpus.length} CPUs exist but the edit started from ${before.cpuCount}.`,
        );
    }
    if (after.cpuCount < before.cpuCount) {
        const removed = state.cpus.splice(after.cpuCount);
        for (const cpu of removed) {
            const ref = cpu.running;
            if (ref !== null) {
                const job = state.tasks.find(
                    (t) => t.definition.id === ref.taskId,
                )?.jobs[ref.index];
                if (job === undefined) {
                    throw new Error(
                        `CPU ${cpu.id} owns job ${ref.taskId}#${ref.index}, which does not exist.`,
                    );
                }
                // A job that just completed or missed its deadline keeps its
                // state; only a running one returns to contention.
                if (job.state === 'running') job.state = 'ready';
            }
            state.events.push({
                kind: 'cpu-removed',
                time: state.clock,
                cpuId: cpu.id,
            });
        }
    } else if (after.cpuCount > before.cpuCount) {
        for (let id = before.cpuCount + 1; id <= after.cpuCount; id++) {
            state.cpus.push({
                id,
                running: null,
                sliceElapsed: 0,
                offSince: null,
            });
            state.events.push({
                kind: 'cpu-added',
                time: state.clock,
                cpuId: id,
            });
        }
    }
}
