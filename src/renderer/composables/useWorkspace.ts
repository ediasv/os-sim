import { computed, ref, shallowRef } from 'vue';
import type { WorkspaceAction } from '../components/workspaceActions';
import {
    DEFAULT_CONFIG,
    type SystemConfig,
    type TaskId,
} from '../../core/domain';
import { loadConfig } from '../../core/loadConfig';
import { suggestTaskId } from '../../core/taskId';
import {
    buildAddTask,
    buildSystemEdit,
    buildTaskEdit,
    refusalsByField,
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
import { useSimulation } from './useSimulation';

/** Message the workspace shows to the user, in the order it should appear. */
export interface Notice {
    readonly tone: 'danger' | 'warning' | 'success';
    readonly title?: string;
    /** One line per problem, separated by `\n`. */
    readonly message: string;
}

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
    /** Draft state of the open edit form; the values live in the dialog. */
    const editorState = shallowRef<EditorState | null>(null);
    const pending = shallowRef<PendingEdit | null>(null);

    /** Snapshot at the history cursor; null while preparing. */
    const snapshot = computed(() =>
        started.value ? (simulation.value?.view.value ?? null) : null,
    );
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

    const available = computed(() => {
        const actions = new Set<WorkspaceAction>();
        // Replacing a running session needs the confirmation of FE-04.
        if (!started.value && !loading.value) actions.add('load-config');
        // Starting needs at least one task (FE-02).
        if (started.value || draft.value.tasks.length > 0) {
            actions.add('step-forward');
        }
        if (snapshot.value !== null && snapshot.value.clock > 0) {
            actions.add('step-back');
        }
        if (started.value) actions.add('restart');
        // Editing runs on the simulator, so it exists only once started (#37).
        if (started.value) {
            actions.add('configure-system');
            actions.add('add-task');
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
        // The user may have started while the dialog was open: replacing the
        // draft now would change what Reiniciar reloads (FE-05).
        if (started.value) return;
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
        if (loaded.ok) {
            draft.value = loaded.config;
            fileName.value = result.path.split(/[/\\]/).pop();
        }
        notices.value = next;
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
        const discarded =
            ahead === 1
                ? `o tick ${last} do histórico é descartado`
                : `os ticks ${clock + 1}–${last} do histórico são descartados`;
        return {
            title: `Editando no tick ${clock} de ${last}`,
            message: `Ao aplicar, ${discarded} e a simulação é recalculada a partir do estado editado. Fatos anteriores ao tick ${clock} não mudam.`,
        };
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
                    ? ` Os ticks ${clock + 1}–${clock + ahead} do histórico são descartados.`
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
            const { task, remove, ...fieldErrors } = refusalsByField(
                built,
                error.items,
            );
            showRefusals(fieldErrors, task ?? remove ?? null);
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
        if (built.edit.items.length === 0) return;
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
    function requestRemove(): void {
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
            case 'configure-system':
                openEditor({ kind: 'system' });
                break;
            case 'add-task':
                openEditor({ kind: 'add' });
                break;
            case 'load-config':
                void openConfigFile();
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
            case 'export-svg':
                void exportSvg();
                break;
            default:
                break;
        }
    }

    return {
        snapshot,
        config,
        clock,
        taskCount,
        available,
        notices,
        editor,
        confirmation,
        handle,
        dismissNotice,
        openTaskEdit,
        closeEditor,
        submitEditor,
        requestRemove,
        confirmPending,
        cancelPending,
    };
}
