/**
 * Edits made during the simulation (REQ-05, DEC-37, DEC-39). Owns the item
 * kinds, their validation in order over the state of the edit stage, and the
 * net change of a tick: items are folded onto an `EditTarget` (what the user
 * asked for), not onto the state, because only the end result of the tick's
 * edits counts (DEC-37 item 5). The engine then applies the difference
 * between the target before and after the edits, so edits that cancel out
 * leave no trace.
 *
 * Adding a kind (#116-#119) means adding a member to `EditItem`, a field to
 * `EditTarget` and a handler to `HANDLERS`, whose type demands one per kind.
 */
import { validateConfig, type ConfigField } from './config';
import type { AlgorithmId, DeepReadonly, SimulationState } from './domain';
import type { EditItemRefusal } from './refusal';

/** One change the user asks for. */
export type EditItem =
    | { readonly kind: 'algorithm'; readonly algorithm: AlgorithmId }
    | { readonly kind: 'quantum'; readonly quantum: number }
    | { readonly kind: 'cpuCount'; readonly cpuCount: number };

/** One edit (one form submission): its items, in order. */
export type Edit = readonly EditItem[];

/** Parameters the user asked for at the edit stage; grows with #116-#119. */
export interface EditTarget {
    readonly algorithm: AlgorithmId;
    readonly quantum: number;
    readonly cpuCount: number;
}

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
): { ok: true; value: EditTarget[F] } | { ok: false; reason: string } {
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
    return { ok: true, value: result.config[field] as EditTarget[F] };
}

const HANDLERS: Handlers = {
    cpuCount: (target, item, context) => {
        const checked = checkSystemField(
            target,
            'cpuCount',
            item.cpuCount,
            context,
        );
        if (!checked.ok) return checked;
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
                reason: `No scheduling policy is registered for algorithm ${checked.value}.`,
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
        const handler = Object.hasOwn(HANDLERS, String(kind))
            ? (HANDLERS[kind as EditItem['kind']] as (
                  target: EditTarget,
                  item: EditItem,
                  context: EditContext,
              ) => ItemResult)
            : undefined;
        if (handler === undefined) {
            refusals.push({
                index,
                kind: String(kind),
                reason: `Unknown edit item kind ${JSON.stringify(kind)}.`,
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
 * tick's edits (DEC-37 item 5). The configuration is replaced, never
 * mutated, because snapshots and restored states share it (DEC-35).
 * Algorithm and quantum record no event (DEC-37).
 */
export function applyNetChange(
    state: SimulationState,
    before: EditTarget,
    after: EditTarget,
): void {
    if (
        after.algorithm !== before.algorithm ||
        after.quantum !== before.quantum ||
        after.cpuCount !== before.cpuCount
    ) {
        state.config = Object.freeze({
            ...state.config,
            algorithm: after.algorithm,
            quantum: after.quantum,
            cpuCount: after.cpuCount,
        });
    }

    // Only the final target is materialized. Surviving CPUs keep their
    // slice; removed owners lose it without a fictitious preemption (DEC-37).
    if (after.cpuCount < before.cpuCount) {
        const removed = state.cpus.splice(after.cpuCount);
        for (const cpu of removed) {
            const ref = cpu.running;
            if (ref !== null) {
                const job = state.tasks.find(
                    (t) => t.definition.id === ref.taskId,
                )?.jobs[ref.index];
                if (job?.state === 'running') job.state = 'ready';
            }
            state.events.push({
                kind: 'cpu-removed',
                time: state.clock,
                cpuId: cpu.id,
            });
        }
    } else {
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
