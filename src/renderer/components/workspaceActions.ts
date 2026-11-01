import type { IconName } from './icons';

// Intents a workspace control can report. Components only emit these; the
// owner (App, later #36) decides which are available and what they do.
export type WorkspaceAction =
    | 'load-config'
    | 'configure-system'
    | 'add-task'
    | 'edit-task'
    | 'step-back'
    | 'step-forward'
    | 'restart'
    | 'run-all'
    | 'zoom-out'
    | 'zoom-in'
    | 'export-svg';

// Single source for each intent's label and icon: several actions appear on
// more than one screen (toolbar, task panel, empty state), and the copies must
// not drift. The visual variant stays with each screen, where it differs.
export const ACTION_META: Readonly<
    Record<WorkspaceAction, { readonly label: string; readonly icon: IconName }>
> = {
    'load-config': { label: 'Carregar configuração', icon: 'folder' },
    'configure-system': { label: 'Sistema', icon: 'settings' },
    'add-task': { label: 'Adicionar tarefa', icon: 'plus' },
    'edit-task': { label: 'Editar tarefa selecionada', icon: 'edit' },
    'step-back': { label: 'Voltar tick', icon: 'step-back' },
    'step-forward': { label: 'Avançar tick', icon: 'step-forward' },
    restart: { label: 'Reiniciar', icon: 'restart' },
    'run-all': { label: 'Executar tudo', icon: 'run-all' },
    'zoom-out': { label: 'Diminuir zoom', icon: 'minus' },
    'zoom-in': { label: 'Aumentar zoom', icon: 'plus' },
    'export-svg': { label: 'Exportar SVG', icon: 'download' },
};

// Shared default for `available`: nothing wired yet, so every control renders
// disabled. Typed ReadonlySet because it is shared and must never be mutated
// (Object.freeze would not stop Set.add()).
export const NO_ACTIONS: ReadonlySet<WorkspaceAction> = new Set();
