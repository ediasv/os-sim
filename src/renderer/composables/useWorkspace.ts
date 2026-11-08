import { computed, ref, shallowRef } from 'vue';
import type { WorkspaceAction } from '../components/workspaceActions';
import type { ConfigIssue } from '../../core/config';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskId,
} from '../../core/domain';
import { loadConfig } from '../../core/loadConfig';
import {
    applySystem as applySystemEdit,
    newTaskValues,
    removeTask,
    saveTask as saveTaskEdit,
    type SystemValues,
    type TaskValues,
} from '../features/configuration/draft';
import { suggestTaskId } from '../../core/taskId';
import {
    buildAddTask,
    buildSystemEdit,
    buildTaskEdit,
    splitRefusals,
    type BuiltEdit,
} from '../features/editing/buildEdit';
import {
    addTaskForm,
    systemForm,
    taskForm,
    toAddTaskDraft,
    toSystemDraft,
    toTaskDraft,
    type FormField,
} from '../features/editing/forms';
import { buildGanttSvg } from '../features/export/ganttSvg';
import { projectInspection } from '../features/inspection/inspection';
import { reportError, type AppError, type CommandResult } from '../errors';
import type { RunResult } from '../../core/simulator';
import { useSimulation } from './useSimulation';

/**
 * Zoom steps of the Gantt, in percent (#38). Fixed steps keep the tick
 * labels legible and the readout exact; there is no free zoom.
 */
export const ZOOM_STEPS = [50, 75, 100, 150, 200] as const;
const DEFAULT_ZOOM_INDEX = ZOOM_STEPS.indexOf(100);

/**
 * Steps computed per chunk of "Executar tudo" (DEC-51). Between chunks the
 * window gets a turn to paint and answer input, so a long run stays responsive.
 */
export const RUN_CHUNK_STEPS = 200;

/** Message the workspace shows to the user, in the order it should appear. */
export interface Notice {
    readonly tone: 'danger' | 'warning' | 'success';
    readonly title?: string;
    /** One line per problem, separated by `\n`. */
    readonly message: string;
}

/** The modal the workspace is showing, if any; at most one at a time. */
export type WorkspaceDialog =
    | { readonly kind: 'system' }
    /** `editing` is the id being edited, `null` when adding. */
    | {
          readonly kind: 'task';
          readonly editing: TaskId | null;
          readonly initial: TaskValues;
      }
    | { readonly kind: 'remove'; readonly taskId: TaskId }
    /**
     * A valid file waits for confirmation before it replaces what the user
     * would lose (FE-04): the running session or the prepared configuration.
     */
    | {
          readonly kind: 'replace';
          readonly discards: 'session' | 'draft';
          readonly config: SystemConfig;
          readonly fileName: string | undefined;
          /** Shown once the file is accepted, not while it is in question. */
          readonly warnings: readonly Notice[];
      };
/** The edit form being shown, ready for `EditDialog` (#37, DEC-37). */
export interface EditorView {
    readonly kind: 'task' | 'system' | 'add';
    readonly title: string;
    readonly fields: readonly FormField[];
    readonly initial: Readonly<Record<string, string>>;
    /** Which ticks an accepted edit affects or discards (FE-11). */
    readonly notice: { readonly title: string; readonly message: string };
    /** The core's reason per refused field (REQ-05). */
    readonly errors: Readonly<Record<string, string>>;
    /** A refusal that belongs to the form as a whole. */
    readonly message: string | null;
    readonly dangerLabel?: string;
}

/** A question to answer before an edit that cannot be undone is sent. */
export interface Confirmation {
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
}

interface EditorState {
    readonly kind: EditorView['kind'];
    readonly taskId?: TaskId;
    readonly errors: Readonly<Record<string, string>>;
    readonly message: string | null;
}

interface PendingEdit {
    readonly action: 'finish' | 'remove';
    readonly taskId: TaskId;
    readonly built: BuiltEdit;
}

/**
 * Orchestrates the workspace (#36): which configuration is being prepared,
 * when the simulator exists, and what each control does. It holds no
 * simulator object: it reads `useSimulation()`'s published snapshots and
 * sends commands (DEC-23).
 *
 * The simulator is created only when the user starts, so preparation never
 * runs the engine (FE-02, FE-DEC-14). Starting publishes snapshot zero without
 * executing `[0, 1)`; "Avançar tick" is the start action until then.
 */
export function useWorkspace() {
    const draft = shallowRef<SystemConfig>(DEFAULT_CONFIG);
    const simulation = shallowRef<ReturnType<typeof useSimulation> | null>(
        null,
    );
    const started = ref(false);
    /** A file dialog is open; its result is applied only if still preparing. */
    const loading = ref(false);
    /** A save dialog is open; a second export waits for it. */
    const exporting = ref(false);
    /** Base name of the loaded configuration file, shown in the exported title. */
    const fileName = ref<string | undefined>();
    const notices = shallowRef<readonly Notice[]>([]);
    const dialog = shallowRef<WorkspaceDialog | null>(null);
    /** Task chosen in the preparation list; the target of "Editar tarefa". */
    const selectedTaskId = ref<TaskId | null>(null);
    /** Draft state of the open edit form; the values live in the dialog. */
    const editorState = shallowRef<EditorState | null>(null);
    const pending = shallowRef<PendingEdit | null>(null);
    /** Index in `ZOOM_STEPS`; a view setting, so a restart keeps it. */
    const zoomIndex = ref(DEFAULT_ZOOM_INDEX);
    /** A full run is in progress; step and configuration controls wait for it (DEC-51). */
    const running = ref(false);

    /** Snapshot at the history cursor; null while preparing. */
    const snapshot = computed(() =>
        started.value ? (simulation.value?.view.value ?? null) : null,
    );
    /**
     * Newest recorded step, wherever the cursor is: the Gantt shows the whole
     * history, with the future still visible after stepping back (FE-06).
     * Reading `snapshot` first makes it recompute on every published step.
     */
    const history = computed(() =>
        snapshot.value === null ? null : simulation.value!.latest(),
    );
    const zoomPercent = computed(() => ZOOM_STEPS[zoomIndex.value]);
    const zoomScale = computed(() => zoomPercent.value / 100);
    /** Parameters shown: the running simulation's, else the prepared ones. */
    const config = computed(() => snapshot.value?.config ?? draft.value);
    const clock = computed(() => snapshot.value?.clock ?? null);
    /**
     * Tasks of the running snapshot, else of the prepared configuration. The
     * snapshot's `config.tasks` is the list as loaded: edits include tasks in
     * `snapshot.tasks` only (DEC-46), so counting the configuration would stay
     * behind.
     */
    const taskCount = computed(
        () => snapshot.value?.tasks.length ?? draft.value.tasks.length,
    );

    /** Tasks of the configuration being prepared; empty once it started. */
    const draftTasks = computed(() => (started.value ? [] : draft.value.tasks));

    const available = computed(() => {
        const actions = new Set<WorkspaceAction>();
        const idle = !loading.value && dialog.value === null && !running.value;
        // A valid file asks before replacing a session or a draft (FE-04).
        if (idle && editorState.value === null && pending.value === null) {
            actions.add('load-config');
        }
        // The configuration is edited only before the start; changing it
        // during the simulation belongs to #37.
        if (idle && !started.value) {
            actions.add('configure-system');
            actions.add('add-task');
            if (selectedTaskId.value !== null) actions.add('edit-task');
        }
        // Starting needs at least one task (FE-02). A full run starts the same
        // way, so it is offered on the same condition (DEC-51).
        const canStart = started.value || draft.value.tasks.length > 0;
        if (canStart && idle) actions.add('run-all');
        if (canStart && !running.value) actions.add('step-forward');
        if (
            snapshot.value !== null &&
            snapshot.value.clock > 0 &&
            !running.value
        ) {
            actions.add('step-back');
        }
        if (started.value && !running.value) actions.add('restart');
        // Editing runs on the simulator, so it exists only once started (#37).
        if (started.value && !running.value) {
            actions.add('configure-system');
            actions.add('add-task');
        }
        if (started.value && zoomIndex.value > 0) actions.add('zoom-out');
        if (started.value && zoomIndex.value < ZOOM_STEPS.length - 1) {
            actions.add('zoom-in');
        }
        // Any step may be exported (FE-18); the dialog is modal.
        if (started.value && !exporting.value) actions.add('export-svg');
        return actions;
    });

    function refusalNotice(error: AppError): Notice | null {
        // Unexpected errors already reached the banner (DEC-24).
        if (error.kind === 'unexpected') return null;
        return {
            tone: error.kind === 'config' ? 'danger' : 'warning',
            title:
                error.kind === 'config' ? 'Configuração recusada' : undefined,
            message: error.message,
        };
    }

    /** Shows a failure where the user acted; success clears old messages. */
    function settle(result: CommandResult): boolean {
        if (result.ok) {
            notices.value = [];
            return true;
        }
        // An unexpected failure reached the banner (DEC-24); the old message
        // no longer describes the state the user is in, so it goes too.
        const notice = refusalNotice(result.error);
        notices.value = notice === null ? [] : [notice];
        return false;
    }

    function start(): void {
        simulation.value ??= useSimulation();
        if (settle(simulation.value.load(draft.value))) started.value = true;
    }

    /** Lets the browser paint and handle input before the next chunk. */
    const yieldToUi = (): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, 0));

    /** The notice that reports how a full run ended, with its tick (DEC-49). */
    function outcomeNotice(
        result: Exclude<RunResult, { kind: 'paused' }>,
    ): Notice {
        if (result.kind === 'completed') {
            return {
                tone: 'success',
                title: 'Simulação concluída',
                message: `Todas as tarefas terminaram no tick ${result.snapshot.clock}.`,
            };
        }
        return {
            tone: 'warning',
            title: 'Simulação bloqueada',
            message: result.reason,
        };
    }

    /**
     * "Executar tudo" (REQ-04, DEC-49, DEC-51): starts when needed, then runs
     * in chunks until the run ends. Each chunk publishes its cursor, so the
     * step history stays available for "Voltar tick" once the run is over.
     */
    async function runToEnd(): Promise<void> {
        if (!started.value) {
            start();
            if (!started.value) return;
        }
        running.value = true;
        try {
            for (;;) {
                const outcome = simulation.value!.runAll(RUN_CHUNK_STEPS);
                if (!outcome.ok) {
                    settle(outcome);
                    return;
                }
                if (outcome.result.kind !== 'paused') {
                    notices.value = [outcomeNotice(outcome.result)];
                    return;
                }
                await yieldToUi();
            }
        } finally {
            running.value = false;
        }
    }

    async function openConfigFile(): Promise<void> {
        loading.value = true;
        let result;
        try {
            result = await window.configFile.openConfigFile();
        } catch (error) {
            reportError(error);
            return;
        } finally {
            loading.value = false;
        }
        if (result.status === 'canceled') return;
        if (result.status === 'failed') {
            notices.value = [
                {
                    tone: 'danger',
                    title: 'Não foi possível ler o arquivo',
                    message: result.message,
                },
            ];
            return;
        }

        const loaded = loadConfig(result.text);
        const next: Notice[] = [];
        if (!loaded.ok) {
            next.push({
                tone: 'danger',
                title: 'Configuração inválida',
                message: loaded.issues.map((issue) => issue.message).join('\n'),
            });
        }
        // Defaulted periods never block loading (DEC-29); they are listed
        // apart from the errors.
        if (loaded.warnings.length > 0) {
            next.push({
                tone: 'warning',
                title: 'Período padrão aplicado',
                message: loaded.warnings
                    .map((warning) => warning.message)
                    .join('\n'),
            });
        }
        if (!loaded.ok) {
            notices.value = next;
            return;
        }
        const accepted = {
            config: loaded.config,
            fileName: result.path.split(/[/\\]/).pop(),
            warnings: next,
        };
        // The user may have started or edited while the file dialog was
        // open, so what would be lost is decided only now. Until confirmed,
        // Reiniciar still reloads the session configuration (FE-05).
        const discards = started.value
            ? 'session'
            : draft.value !== DEFAULT_CONFIG
              ? 'draft'
              : null;
        if (discards === null) {
            replace(accepted);
            return;
        }
        dialog.value = { kind: 'replace', discards, ...accepted };
    }

    /**
     * Puts an accepted file in place of the session or draft and returns to
     * preparation without starting the engine (FE-04, FE-DEC-14).
     */
    function replace(accepted: {
        readonly config: SystemConfig;
        readonly fileName: string | undefined;
        readonly warnings: readonly Notice[];
    }): void {
        closeEditor();
        started.value = false;
        draft.value = accepted.config;
        fileName.value = accepted.fileName;
        selectedTaskId.value = accepted.config.tasks[0]?.id ?? null;
        notices.value = accepted.warnings;
        dialog.value = null;
    }

    function confirmReplace(): void {
        const current = dialog.value;
        if (current?.kind === 'replace') replace(current);
    }

    function cancelDialog(): void {
        dialog.value = null;
    }

    function selectTask(id: TaskId): void {
        if (draft.value.tasks.some((task) => task.id === id)) {
            selectedTaskId.value = id;
        }
    }

    function openTaskDialog(editing: TaskId | null): void {
        const existing = draft.value.tasks.find((task) => task.id === editing);
        dialog.value = {
            kind: 'task',
            editing: existing?.id ?? null,
            initial:
                existing === undefined
                    ? newTaskValues(draft.value)
                    : {
                          id: existing.id,
                          color: existing.color,
                          arrival: existing.arrival,
                          duration: existing.duration,
                          period: existing.period,
                          deadline: existing.deadline,
                      },
        };
    }

    /**
     * Applies the system form. The core's reasons come back for the form to
     * show; on a refusal the dialog and the draft stay as they were (FE-11).
     */
    function applySystem(values: SystemValues): readonly ConfigIssue[] {
        const result = applySystemEdit(draft.value, values);
        if (!result.ok) return result.issues;
        draft.value = result.config;
        dialog.value = null;
        return [];
    }

    /** Applies the task form, adding or editing as the open dialog says. */
    function saveTask(values: TaskValues): readonly ConfigIssue[] {
        const current = dialog.value;
        if (current?.kind !== 'task') return [];
        const result = saveTaskEdit(draft.value, values, current.editing);
        if (!result.ok) return result.issues;
        draft.value = result.config;
        selectedTaskId.value = values.id;
        dialog.value = null;
        return [];
    }

    /**
     * From the edit dialog to the confirmation of removal: of the prepared
     * task before the start, of the running simulation's task after it.
     */
    function requestRemove(): void {
        if (started.value) {
            requestRuntimeRemove();
            return;
        }
        const current = dialog.value;
        if (current?.kind === 'task' && current.editing !== null) {
            dialog.value = { kind: 'remove', taskId: current.editing };
        }
    }

    function confirmRemove(): void {
        const current = dialog.value;
        if (current?.kind !== 'remove') return;
        draft.value = removeTask(draft.value, current.taskId);
        selectedTaskId.value = draft.value.tasks[0]?.id ?? null;
        dialog.value = null;
    }

    /**
     * Exports the whole recorded history, whatever the cursor shows (FE-18).
     * Cancelling is silent; a write failure keeps the session and says why.
     */
    async function exportSvg(): Promise<void> {
        exporting.value = true;
        // A cancelled export must not leave the previous outcome on screen.
        notices.value = [];
        try {
            const content = buildGanttSvg(simulation.value!.latest(), {
                fileName: fileName.value,
                exportedAt: new Date(),
            });
            const result = await window.imageFile.saveImageFile({ content });
            if (result.status === 'saved') {
                notices.value = [
                    {
                        tone: 'success',
                        message: `Imagem salva em "${result.path}".`,
                    },
                ];
            } else if (result.status === 'failed') {
                notices.value = [
                    {
                        tone: 'danger',
                        title: 'Não foi possível exportar a imagem',
                        message: result.message,
                    },
                ];
            }
        } catch (error) {
            reportError(error);
        } finally {
            exporting.value = false;
        }
    }

    /** Closes one message the user chose to dismiss (confirmations only). */
    function dismissNotice(index: number): void {
        notices.value = notices.value.filter((_, i) => i !== index);
    }

    /**
     * What an accepted edit does to the history, said before it is sent
     * (FE-11): from the shown tick on, and the recorded steps after it go.
     */
    function historyNotice(clock: number): EditorView['notice'] {
        const ahead = simulation.value?.futureSteps() ?? 0;
        const last = clock + ahead;
        if (ahead === 0) {
            return {
                title: 'Alteração durante a simulação',
                message: `Vale a partir do tick ${clock}. Fatos anteriores ao tick ${clock} não mudam.`,
            };
        }
        return {
            title: `Editando no tick ${clock} de ${last}`,
            message: `Ao aplicar, ${discardPhrase(clock, ahead)} e a simulação é recalculada a partir do estado editado. Fatos anteriores ao tick ${clock} não mudam.`,
        };
    }

    /** Which recorded steps an accepted edit discards, worded for `ahead` of them. */
    function discardPhrase(clock: number, ahead: number): string {
        return ahead === 1
            ? `o tick ${clock + 1} do histórico é descartado`
            : `os ticks ${clock + 1}–${clock + ahead} do histórico são descartados`;
    }

    const editor = computed<EditorView | null>(() => {
        const state = editorState.value;
        const current = snapshot.value;
        if (state === null || current === null) return null;
        const notice = historyNotice(current.clock);
        const shown = { errors: state.errors, message: state.message, notice };
        if (state.kind === 'system') {
            return {
                kind: 'system',
                title: 'Configuração do sistema',
                ...systemForm(current.config),
                ...shown,
            };
        }
        if (state.kind === 'add') {
            return {
                kind: 'add',
                title: 'Adicionar tarefa',
                ...addTaskForm(
                    suggestTaskId(current.usedTaskIds),
                    current.clock,
                ),
                ...shown,
            };
        }
        const task = projectInspection(current).tasks.find(
            (candidate) => candidate.definition.id === state.taskId,
        );
        if (task === undefined) return null;
        return {
            kind: 'task',
            title: `Editar Tarefa ${task.definition.id}`,
            ...taskForm(task),
            ...shown,
            dangerLabel: 'Remover tarefa',
        };
    });

    const confirmation = computed<Confirmation | null>(() => {
        const request = pending.value;
        if (request === null) return null;
        if (request.action === 'finish') {
            return {
                title: `Encerrar Tarefa ${request.taskId}?`,
                message:
                    'Encerrar interrompe os jobs incompletos da tarefa e impede novas ativações. O histórico dela continua no Gantt.',
                confirmLabel: 'Encerrar',
            };
        }
        const clock = snapshot.value?.clock ?? 0;
        const ahead = simulation.value?.futureSteps() ?? 0;
        return {
            title: `Remover Tarefa ${request.taskId}?`,
            message:
                'A tarefa sai da simulação sem deixar rastro no Gantt. Só tarefa nunca ativada pode ser removida; para uma já ativada, encerre-a.' +
                (ahead > 0
                    ? ` Ao confirmar, ${discardPhrase(clock, ahead)}.`
                    : ''),
            confirmLabel: 'Remover',
        };
    });

    function openEditor(state: Omit<EditorState, 'errors' | 'message'>): void {
        if (!started.value) return;
        pending.value = null;
        editorState.value = { ...state, errors: {}, message: null };
    }

    const openTaskEdit = (taskId: TaskId): void =>
        openEditor({ kind: 'task', taskId });

    function closeEditor(): void {
        editorState.value = null;
        pending.value = null;
    }

    function showRefusals(
        errors: Readonly<Record<string, string>>,
        message: string | null,
    ): void {
        const state = editorState.value;
        if (state !== null) editorState.value = { ...state, errors, message };
    }

    /**
     * Sends one built edit. A refusal keeps the form open with the core's
     * reason on each field, so nothing the user typed is lost (FE-11).
     */
    function send(built: BuiltEdit): void {
        const result = simulation.value!.edit(built.items);
        pending.value = null;
        if (result.ok) {
            editorState.value = null;
            notices.value = [];
            return;
        }
        const { error } = result;
        if (error.kind === 'refused' && error.items !== undefined) {
            const { errors, message } = splitRefusals(
                built,
                error.items,
                error.message,
            );
            showRefusals(errors, message);
        } else {
            // An unexpected failure already reached the banner (DEC-24).
            showRefusals(
                {},
                error.kind === 'unexpected' ? null : error.message,
            );
        }
    }

    /** Builds the edit from what the form holds and sends it (REQ-05). */
    function submitEditor(values: Readonly<Record<string, string>>): void {
        const state = editorState.value;
        const current = snapshot.value;
        if (state === null || current === null || !started.value) return;

        let taskId: TaskId | undefined;
        let built;
        if (state.kind === 'system') {
            built = buildSystemEdit(
                toSystemDraft(systemForm(current.config).initial),
                toSystemDraft(values),
            );
        } else if (state.kind === 'add') {
            built = buildAddTask(toAddTaskDraft(values));
        } else {
            taskId = state.taskId!;
            const task = projectInspection(current).tasks.find(
                (candidate) => candidate.definition.id === taskId,
            );
            if (task === undefined) return;
            built = buildTaskEdit(
                taskId,
                toTaskDraft(taskForm(task).initial),
                toTaskDraft(values),
            );
        }

        if (!built.ok) {
            showRefusals(built.errors, null);
            return;
        }
        if (built.edit.items.length === 0) {
            // Typed values that equal the current ones (a color in another
            // case, a leading zero) enable Aplicar but change nothing.
            showRefusals(
                {},
                'Nenhuma alteração a aplicar: os valores são iguais aos atuais.',
            );
            return;
        }
        const finishes = built.edit.items.some(
            (item) => item.kind === 'taskState' && item.state === 'concluded',
        );
        if (finishes && taskId !== undefined) {
            pending.value = { action: 'finish', taskId, built: built.edit };
            return;
        }
        send(built.edit);
    }

    /** Asks to remove the task of the open form; the confirmation follows. */
    function requestRuntimeRemove(): void {
        const state = editorState.value;
        if (state?.kind !== 'task' || state.taskId === undefined) return;
        pending.value = {
            action: 'remove',
            taskId: state.taskId,
            built: {
                items: [{ kind: 'removeTask', taskId: state.taskId }],
                fields: ['remove'],
            },
        };
    }

    function confirmPending(): void {
        if (pending.value !== null) send(pending.value.built);
    }

    function cancelPending(): void {
        pending.value = null;
    }

    function handle(action: WorkspaceAction): void {
        if (!available.value.has(action)) return;
        switch (action) {
            // Before the start the forms edit the prepared configuration;
            // after it they edit the running simulation (#37).
            case 'configure-system':
                if (started.value) openEditor({ kind: 'system' });
                else dialog.value = { kind: 'system' };
                break;
            case 'add-task':
                if (started.value) openEditor({ kind: 'add' });
                else openTaskDialog(null);
                break;
            case 'load-config':
                void openConfigFile();
                break;
            case 'edit-task':
                openTaskDialog(selectedTaskId.value);
                break;
            case 'run-all':
                void runToEnd();
                break;
            case 'step-forward':
                if (!started.value) start();
                else settle(simulation.value!.next());
                break;
            case 'step-back':
                settle(simulation.value!.backward());
                break;
            case 'restart':
                closeEditor();
                settle(simulation.value!.load(draft.value));
                break;
            case 'zoom-in':
                zoomIndex.value += 1;
                break;
            case 'zoom-out':
                zoomIndex.value -= 1;
                break;
            case 'export-svg':
                void exportSvg();
                break;
            default:
                break;
        }
    }

    return {
        snapshot,
        history,
        zoomPercent,
        zoomScale,
        config,
        clock,
        taskCount,
        available,
        running,
        notices,
        dialog,
        draftTasks,
        selectedTaskId,
        editor,
        confirmation,
        handle,
        dismissNotice,
        selectTask,
        applySystem,
        saveTask,
        requestRemove,
        confirmRemove,
        confirmReplace,
        cancelDialog,
        openTaskEdit,
        closeEditor,
        submitEditor,
        confirmPending,
        cancelPending,
    };
}
