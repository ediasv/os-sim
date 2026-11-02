import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigFileResult } from '../../shared/configFile';
import { currentError, dismissError } from '../errors';
import { useWorkspace } from './useWorkspace';

// Real core, real simulator: refusals below are the core's own answers.
const TWO_TASKS = 'RM;5;2\n\n1;F0E0D0;0;3;5;5\n2;A0B0C0;0;1;4;4\n';
const ONE_CPU = 'RM;5;1\n\n1;F0E0D0;0;3;5;5\n2;A0B0C0;0;1;4;4\n';
// One job per tick, so the ten activations are used up by tick 9.
const EVERY_TICK = 'RM;5;1\n\n1;F0E0D0;0;1;1;1\n';

type Workspace = ReturnType<typeof useWorkspace>;

async function started(text: string, ticks = 0): Promise<Workspace> {
    const result: ConfigFileResult = { status: 'loaded', path: '/c.txt', text };
    vi.stubGlobal('window', {
        configFile: { openConfigFile: vi.fn().mockResolvedValue(result) },
    });
    const workspace = useWorkspace();
    workspace.handle('load-config');
    await vi.waitFor(() =>
        expect(workspace.taskCount.value).toBeGreaterThan(0),
    );
    workspace.handle('step-forward');
    for (let i = 0; i < ticks; i++) workspace.handle('step-forward');
    return workspace;
}

/** Opens the form of a task, changes the given fields and submits it. */
function editTask(
    workspace: Workspace,
    taskId: string,
    changes: Record<string, string>,
): void {
    workspace.openTaskEdit(taskId);
    workspace.submitEditor({ ...workspace.editor.value!.initial, ...changes });
}

beforeEach(dismissError);
afterEach(() => vi.unstubAllGlobals());

describe('useWorkspace editing availability (#37)', () => {
    it('offers system and new-task edits only once the simulation started', async () => {
        vi.stubGlobal('window', { configFile: { openConfigFile: vi.fn() } });
        expect(useWorkspace().available.value.has('configure-system')).toBe(
            false,
        );
        const workspace = await started(TWO_TASKS);
        expect(workspace.available.value.has('configure-system')).toBe(true);
        expect(workspace.available.value.has('add-task')).toBe(true);
    });

    it('opening and closing a form changes nothing', async () => {
        const workspace = await started(TWO_TASKS, 2);
        const before = workspace.snapshot.value;

        workspace.openTaskEdit('2');
        expect(workspace.editor.value).toMatchObject({
            kind: 'task',
            title: 'Editar Tarefa 2',
        });
        expect(workspace.editor.value?.initial.color).toBe('A0B0C0');
        workspace.closeEditor();

        expect(workspace.editor.value).toBeNull();
        expect(workspace.snapshot.value).toBe(before);
    });
});

describe('useWorkspace applying edits (#37, DEC-37)', () => {
    it('applies a system edit at the shown tick and closes the form', async () => {
        const workspace = await started(TWO_TASKS, 2);
        workspace.handle('configure-system');
        expect(workspace.editor.value?.kind).toBe('system');

        workspace.submitEditor({
            algorithm: 'EDF',
            quantum: '2',
            cpuCount: '2',
        });

        expect(workspace.editor.value).toBeNull();
        expect(workspace.snapshot.value).toMatchObject({
            clock: 2,
            config: { algorithm: 'EDF', quantum: 2 },
        });
    });

    it('keeps the form open, the draft values and the step when an item is refused', async () => {
        const workspace = await started(TWO_TASKS, 2);
        const before = workspace.snapshot.value;

        // A valid color next to a period of zero: the whole edit is refused.
        editTask(workspace, '1', { color: '102030', period: '0' });

        expect(workspace.snapshot.value).toBe(before);
        expect(workspace.editor.value).not.toBeNull();
        expect(workspace.editor.value?.errors.period).toBeTruthy();
        expect(workspace.editor.value?.errors.color).toBeUndefined();
        expect(workspace.snapshot.value?.tasks[0].definition.color).toBe(
            'F0E0D0',
        );
    });

    it('tells the user when what they typed means no change, instead of doing nothing', async () => {
        const workspace = await started(TWO_TASKS, 2);
        const before = workspace.snapshot.value;

        // Same color in lowercase and the same duration with a leading zero.
        editTask(workspace, '1', { color: 'f0e0d0', duration: '03' });

        expect(workspace.editor.value?.message).toMatch(/nenhuma alteração/i);
        expect(workspace.snapshot.value).toBe(before);
    });

    it('rejects a malformed number before asking the core', async () => {
        const workspace = await started(TWO_TASKS, 2);
        const before = workspace.snapshot.value;

        editTask(workspace, '1', { duration: 'abc' });

        expect(workspace.editor.value?.errors.duration).toBeTruthy();
        expect(workspace.snapshot.value).toBe(before);
    });

    it('a later correct submission clears the refusals and applies', async () => {
        const workspace = await started(TWO_TASKS, 2);
        editTask(workspace, '1', { period: '0' });
        expect(workspace.editor.value?.errors.period).toBeTruthy();

        workspace.submitEditor({
            ...workspace.editor.value!.initial,
            period: '9',
        });

        expect(workspace.editor.value).toBeNull();
        expect(workspace.snapshot.value?.tasks[0].definition.period).toBe(9);
    });
});

describe('useWorkspace refusals by edit type (#37 criterion 2)', () => {
    it('refuses forcing more tasks than CPUs, on the state field', async () => {
        const workspace = await started(ONE_CPU, 1);
        editTask(workspace, '1', { state: 'forced' });
        expect(workspace.editor.value).toBeNull();

        editTask(workspace, '2', { state: 'forced' });

        expect(workspace.editor.value?.errors.state).toBeTruthy();
    });

    it('refuses a color another task already has', async () => {
        const workspace = await started(TWO_TASKS, 1);
        editTask(workspace, '1', { color: 'A0B0C0' });
        expect(workspace.editor.value?.errors.color).toBeTruthy();
    });

    it('refuses a new arrival once the task has activated', async () => {
        const workspace = await started(TWO_TASKS, 2);
        editTask(workspace, '1', { arrival: '7' });
        expect(workspace.editor.value?.errors.arrival).toBeTruthy();
    });

    it('refuses duration and deadline after the ten activations', async () => {
        const workspace = await started(EVERY_TICK, 10);
        editTask(workspace, '1', { duration: '2' });
        expect(workspace.editor.value?.errors.duration).toBeTruthy();

        workspace.closeEditor();
        editTask(workspace, '1', { deadline: '3' });
        expect(workspace.editor.value?.errors.deadline).toBeTruthy();
    });

    it('refuses a period of zero with its reason', async () => {
        const workspace = await started(TWO_TASKS, 2);
        editTask(workspace, '1', { period: '0' });
        expect(workspace.editor.value?.errors.period).toMatch(/\S/);
    });

    it('refuses a quantum and a CPU count of zero', async () => {
        const workspace = await started(TWO_TASKS, 2);
        workspace.handle('configure-system');
        workspace.submitEditor({
            algorithm: 'RM',
            quantum: '0',
            cpuCount: '2',
        });
        expect(workspace.editor.value?.errors.quantum).toBeTruthy();

        workspace.submitEditor({
            algorithm: 'RM',
            quantum: '5',
            cpuCount: '0',
        });
        expect(workspace.editor.value?.errors.cpuCount).toBeTruthy();
    });

    it('refuses a new task arriving before the shown tick, for the form as a whole', async () => {
        const workspace = await started(TWO_TASKS, 3);
        workspace.handle('add-task');

        workspace.submitEditor({
            ...workspace.editor.value!.initial,
            arrival: '0',
            duration: '2',
            deadline: '4',
        });

        expect(workspace.editor.value?.message).toMatch(/\S/);
        expect(workspace.snapshot.value?.tasks).toHaveLength(2);
    });

    it('refuses removing a task that already activated and keeps the form', async () => {
        const workspace = await started(TWO_TASKS, 2);
        workspace.openTaskEdit('1');
        workspace.requestRemove();
        expect(workspace.confirmation.value?.title).toBe('Remover Tarefa 1?');

        workspace.confirmPending();

        expect(workspace.confirmation.value).toBeNull();
        expect(workspace.editor.value?.message).toMatch(/\S/);
        expect(workspace.snapshot.value?.tasks).toHaveLength(2);
    });
});

describe('useWorkspace adding and removing tasks (#37, DEC-29, DEC-48)', () => {
    it('adds a task with the suggested ID and the default period 15', async () => {
        const workspace = await started(TWO_TASKS, 2);
        workspace.handle('add-task');
        const { initial } = workspace.editor.value!;
        expect(initial).toMatchObject({ id: '3', arrival: '2', period: '15' });

        workspace.submitEditor({ ...initial, duration: '2', deadline: '6' });

        expect(workspace.editor.value).toBeNull();
        const added = workspace.snapshot.value?.tasks[2];
        expect(added?.definition).toMatchObject({ id: '3', period: 15 });
    });

    it('removes a task that never activated, after confirming', async () => {
        const workspace = await started(TWO_TASKS, 1);
        workspace.handle('add-task');
        workspace.submitEditor({
            ...workspace.editor.value!.initial,
            arrival: '9',
            duration: '2',
            deadline: '6',
        });
        expect(workspace.snapshot.value?.tasks).toHaveLength(3);

        workspace.openTaskEdit('3');
        workspace.requestRemove();
        workspace.confirmPending();

        expect(workspace.snapshot.value?.tasks).toHaveLength(2);
        expect(workspace.editor.value).toBeNull();
    });
});

describe('useWorkspace discard wording (#37)', () => {
    it('words one discarded step in the singular in the banner and in the removal question', async () => {
        const workspace = await started(TWO_TASKS, 2);
        workspace.handle('step-back');
        workspace.openTaskEdit('1');
        expect(workspace.editor.value?.notice.message).toContain(
            'o tick 2 do histórico é descartado',
        );

        workspace.requestRemove();

        expect(workspace.confirmation.value?.message).toContain(
            'o tick 2 do histórico é descartado',
        );
        expect(workspace.confirmation.value?.message).not.toContain('2–2');
    });
});

describe('useWorkspace finishing a task (#37, FE-13)', () => {
    it('asks for confirmation and only then finishes the task', async () => {
        const workspace = await started(TWO_TASKS, 1);
        const before = workspace.snapshot.value;

        editTask(workspace, '1', { state: 'concluded' });
        expect(workspace.confirmation.value?.title).toBe('Encerrar Tarefa 1?');
        expect(workspace.confirmation.value?.message).toContain(
            'interrompe os jobs incompletos',
        );
        expect(workspace.snapshot.value).toBe(before);

        workspace.cancelPending();
        expect(workspace.confirmation.value).toBeNull();
        expect(workspace.editor.value).not.toBeNull();
        expect(workspace.snapshot.value).toBe(before);

        workspace.submitEditor({
            ...workspace.editor.value!.initial,
            state: 'concluded',
        });
        workspace.confirmPending();

        expect(workspace.snapshot.value?.tasks[0].status).toBe('concluded');
        expect(workspace.editor.value).toBeNull();
    });
});

describe('useWorkspace editing in the past (#37, FE-11, DEC-06)', () => {
    it('says which ticks an accepted edit discards, and discards them only on acceptance', async () => {
        const workspace = await started(TWO_TASKS, 3);
        workspace.handle('step-back');
        workspace.handle('step-back');
        expect(workspace.clock.value).toBe(1);

        workspace.openTaskEdit('1');
        expect(workspace.editor.value?.notice).toMatchObject({
            title: 'Editando no tick 1 de 3',
        });
        expect(workspace.editor.value?.notice?.message).toContain(
            'ticks 2–3 do histórico são descartados',
        );

        // A refused edit leaves the future: stepping forward still shows it.
        workspace.submitEditor({
            ...workspace.editor.value!.initial,
            period: '0',
        });
        workspace.closeEditor();
        workspace.handle('step-forward');
        expect(workspace.clock.value).toBe(2);

        workspace.handle('step-back');
        editTask(workspace, '1', { color: '102030' });

        expect(workspace.clock.value).toBe(1);
        workspace.openTaskEdit('1');
        expect(workspace.editor.value?.notice?.title).toBe(
            'Alteração durante a simulação',
        );
        expect(currentError.value).toBeNull();
    });
});
