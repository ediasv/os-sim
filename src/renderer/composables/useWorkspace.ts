import { computed, ref, shallowRef } from 'vue';
import type { WorkspaceAction } from '../components/workspaceActions';
import type { ConfigIssue } from '../../core/config';
import { DEFAULT_CONFIG, type SystemConfig } from '../../core/domain';
import { loadConfig } from '../../core/loadConfig';
import {
    applySystem as applySystemEdit,
    type SystemValues,
} from '../features/configuration/draft';
import { buildGanttSvg } from '../features/export/ganttSvg';
import { reportError, type AppError, type CommandResult } from '../errors';
import { useSimulation } from './useSimulation';

/** Message the workspace shows to the user, in the order it should appear. */
export interface Notice {
    readonly tone: 'danger' | 'warning' | 'success';
    readonly title?: string;
    /** One line per problem, separated by `\n`. */
    readonly message: string;
}

/** The modal the workspace is showing, if any; at most one at a time. */
export type WorkspaceDialog = { readonly kind: 'system' };

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

    /** Snapshot at the history cursor; null while preparing. */
    const snapshot = computed(() =>
        started.value ? (simulation.value?.view.value ?? null) : null,
    );
    /** Parameters shown: the running simulation's, else the prepared ones. */
    const config = computed(() => snapshot.value?.config ?? draft.value);
    const clock = computed(() => snapshot.value?.clock ?? null);
    const taskCount = computed(() => config.value.tasks.length);

    const available = computed(() => {
        const actions = new Set<WorkspaceAction>();
        const idle = !loading.value && dialog.value === null;
        // Replacing a running session needs the confirmation of FE-04.
        if (!started.value && idle) actions.add('load-config');
        // The configuration is edited only before the start; changing it
        // during the simulation belongs to #37.
        if (idle && !started.value) {
            actions.add('configure-system');
        }
        // Starting needs at least one task (FE-02).
        if (started.value || draft.value.tasks.length > 0) {
            actions.add('step-forward');
        }
        if (snapshot.value !== null && snapshot.value.clock > 0) {
            actions.add('step-back');
        }
        if (started.value) actions.add('restart');
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

    function cancelDialog(): void {
        dialog.value = null;
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

    function handle(action: WorkspaceAction): void {
        if (!available.value.has(action)) return;
        switch (action) {
            case 'load-config':
                void openConfigFile();
                break;
            case 'configure-system':
                dialog.value = { kind: 'system' };
                break;
            case 'step-forward':
                if (!started.value) start();
                else settle(simulation.value!.next());
                break;
            case 'step-back':
                settle(simulation.value!.backward());
                break;
            case 'restart':
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
        dialog,
        handle,
        dismissNotice,
        applySystem,
        cancelDialog,
    };
}
