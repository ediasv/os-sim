// Intents a workspace control can report. Components only emit these; the
// owner (App, later #36) decides which are available and what they do.
export type WorkspaceAction =
    | 'load-config'
    | 'configure-system'
    | 'add-task'
    | 'step-back'
    | 'step-forward'
    | 'restart'
    | 'run-all'
    | 'zoom-out'
    | 'zoom-in'
    | 'export-svg';
