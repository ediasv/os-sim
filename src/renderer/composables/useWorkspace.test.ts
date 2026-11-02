import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigFileResult } from '../../shared/configFile';
import type { ImageFileResult } from '../../shared/imageFile';
import { currentError, dismissError } from '../errors';
import { useWorkspace } from './useWorkspace';

// Lets a test make `next` fail like a core refusal, which no short
// configuration reaches (the core only refuses past its length limit).
const refuse = vi.hoisted(() => ({
    next: false,
    kind: 'refused' as 'refused' | 'unexpected',
    // Makes the snapshot hold one task more than its configuration lists, as
    // after an inclusion (the edit command itself only arrives with #37).
    extraTask: false,
}));
vi.mock('./useSimulation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./useSimulation')>();
    return {
        ...actual,
        useSimulation: () => {
            const sim = actual.useSimulation();
            return {
                ...sim,
                view: {
                    get value() {
                        const snapshot = sim.view.value;
                        return refuse.extraTask && snapshot
                            ? {
                                  ...snapshot,
                                  tasks: [...snapshot.tasks, snapshot.tasks[0]],
                              }
                            : snapshot;
                    },
                } as typeof sim.view,
                next: () =>
                    refuse.next
                        ? {
                              ok: false as const,
                              error: {
                                  kind: refuse.kind,
                                  message: 'Recusado pelo núcleo.',
                              },
                          }
                        : sim.next(),
            };
        },
    };
});

const TWO_TASKS = 'RM;5;2\n\n1;F0E0D0;0;3;5;5\n2;A0B0C0;0;1;4;4\n';

function stubFile(...results: ConfigFileResult[]) {
    const openConfigFile = vi.fn();
    for (const result of results) openConfigFile.mockResolvedValueOnce(result);
    vi.stubGlobal('window', { configFile: { openConfigFile } });
    return openConfigFile;
}

const loaded = (text: string): ConfigFileResult => ({
    status: 'loaded',
    path: '/c.txt',
    text,
});

async function prepared(text = TWO_TASKS) {
    stubFile(loaded(text));
    const workspace = useWorkspace();
    workspace.handle('load-config');
    await vi.waitFor(() =>
        expect(workspace.taskCount.value).toBeGreaterThan(0),
    );
    return workspace;
}

beforeEach(dismissError);
afterEach(() => {
    refuse.next = false;
    refuse.kind = 'refused';
    refuse.extraTask = false;
    vi.unstubAllGlobals();
    dismissError();
});

describe('useWorkspace', () => {
    it('opens in preparation: defaults, no snapshot, loading and editing available', () => {
        const workspace = useWorkspace();

        expect(workspace.snapshot.value).toBeNull();
        expect(workspace.clock.value).toBeNull();
        expect(workspace.config.value).toMatchObject({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
        });
        expect([...workspace.available.value].sort()).toEqual([
            'add-task',
            'configure-system',
            'load-config',
        ]);
    });

    it('loading a file prepares its configuration without starting', async () => {
        const workspace = await prepared();

        expect(workspace.snapshot.value).toBeNull();
        expect(workspace.config.value.cpuCount).toBe(2);
        expect(workspace.taskCount.value).toBe(2);
        expect(workspace.available.value.has('step-forward')).toBe(true);
        expect(workspace.available.value.has('restart')).toBe(false);
    });

    it('counts the tasks of the running snapshot, not the configuration it started from', async () => {
        const workspace = await prepared();
        refuse.extraTask = true;

        workspace.handle('step-forward');

        expect(workspace.config.value.tasks).toHaveLength(2);
        expect(workspace.taskCount.value).toBe(3);
    });

    it('the first step publishes snapshot zero without running a tick', async () => {
        const workspace = await prepared();

        workspace.handle('step-forward');

        expect(workspace.clock.value).toBe(0);
        expect(workspace.snapshot.value?.executions).toEqual([]);
        expect(workspace.available.value.has('configure-system')).toBe(false);
        expect(workspace.available.value.has('add-task')).toBe(false);
        expect(workspace.available.value.has('step-back')).toBe(false);
    });

    it('then steps forward and back through the recorded history', async () => {
        const workspace = await prepared();

        workspace.handle('step-forward');
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        expect(workspace.clock.value).toBe(2);

        workspace.handle('step-back');
        expect(workspace.clock.value).toBe(1);
        workspace.handle('step-forward');
        expect(workspace.clock.value).toBe(2);
        expect(workspace.snapshot.value?.executions.length).toBeGreaterThan(0);
    });

    it('restart returns to snapshot zero with the configuration of the session', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        workspace.handle('step-forward');

        workspace.handle('restart');

        expect(workspace.clock.value).toBe(0);
        expect(workspace.config.value.cpuCount).toBe(2);
        expect(workspace.available.value.has('step-back')).toBe(false);
    });

    it('does nothing for an action that is not available', () => {
        const workspace = useWorkspace();

        workspace.handle('step-forward');
        workspace.handle('restart');

        expect(workspace.snapshot.value).toBeNull();
        expect(workspace.notices.value).toEqual([]);
    });

    it('a canceled dialog changes nothing', async () => {
        const open = stubFile({ status: 'canceled' });
        const workspace = useWorkspace();

        workspace.handle('load-config');
        await vi.waitFor(() => expect(open).toHaveBeenCalled());
        await Promise.resolve();

        expect(workspace.taskCount.value).toBe(0);
        expect(workspace.notices.value).toEqual([]);
    });

    it('shows a read failure with its sentence and keeps the preparation', async () => {
        stubFile({
            status: 'failed',
            path: '/c.txt',
            reason: 'not-found',
            message:
                'Não foi possível ler /c.txt: o arquivo não foi encontrado.',
        });
        const workspace = useWorkspace();

        workspace.handle('load-config');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        expect(workspace.notices.value[0]).toMatchObject({
            tone: 'danger',
            message:
                'Não foi possível ler /c.txt: o arquivo não foi encontrado.',
        });
        expect(workspace.taskCount.value).toBe(0);
    });

    it('shows invalid content with line and reason and changes no state', async () => {
        const workspace = await prepared();
        stubFile(loaded('XX;5;1\n1;FFFFFF;0;1;5;5\n'));

        workspace.handle('load-config');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        expect(workspace.notices.value[0]).toMatchObject({
            tone: 'danger',
            title: 'Configuração inválida',
        });
        expect(workspace.notices.value[0]!.message).toMatch(
            /^Linha 1, campo algoritmo_escalonamento/,
        );
        expect(workspace.config.value.cpuCount).toBe(2);
        expect(workspace.taskCount.value).toBe(2);
    });

    it('loads a file with a missing period and warns per task, apart from errors (DEC-29)', async () => {
        const workspace = await prepared('RM;5;1\n1;FFFFFF;0;2;0;20\n');

        expect(workspace.taskCount.value).toBe(1);
        expect(workspace.notices.value).toHaveLength(1);
        expect(workspace.notices.value[0]).toMatchObject({
            tone: 'warning',
            title: 'Período padrão aplicado',
        });
        expect(workspace.notices.value[0]!.message).toMatch(
            /^Linha 2, campo periodo.*tarefa 1/,
        );
        expect(workspace.config.value.tasks[0]?.period).toBe(15);
    });

    it('a refusal appears as a message and keeps the step; success clears it', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        const before = workspace.snapshot.value;

        refuse.next = true;
        workspace.handle('step-forward');

        expect(workspace.notices.value).toEqual([
            {
                tone: 'warning',
                title: undefined,
                message: 'Recusado pelo núcleo.',
            },
        ]);
        expect(workspace.snapshot.value).toBe(before);
        expect(currentError.value).toBeNull();

        refuse.next = false;
        workspace.handle('step-forward');
        expect(workspace.notices.value).toEqual([]);
        expect(workspace.clock.value).toBe(2);
    });

    it('an unexpected failure clears the previous message instead of keeping it', async () => {
        const workspace = await prepared(TWO_TASKS);
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        refuse.next = true;
        workspace.handle('step-forward');
        expect(workspace.notices.value).toHaveLength(1);

        refuse.kind = 'unexpected';
        workspace.handle('step-forward');

        expect(workspace.notices.value).toEqual([]);
    });

    it('ignores a file chosen after the session started, so Reiniciar keeps the session configuration', async () => {
        let choose: (result: ConfigFileResult) => void = () => {};
        const openConfigFile = vi
            .fn<() => Promise<ConfigFileResult>>()
            .mockResolvedValueOnce(loaded(TWO_TASKS))
            .mockImplementationOnce(
                () => new Promise((resolve) => (choose = resolve)),
            );
        vi.stubGlobal('window', { configFile: { openConfigFile } });
        const workspace = useWorkspace();
        workspace.handle('load-config');
        await vi.waitFor(() => expect(workspace.taskCount.value).toBe(2));

        workspace.handle('load-config');
        expect(workspace.available.value.has('load-config')).toBe(false);
        workspace.handle('step-forward');
        expect(workspace.clock.value).toBe(0);
        choose(loaded('EDF;9;4\n\n1;FFFFFF;0;1;5;5\n'));
        await vi.waitFor(() => expect(openConfigFile).toHaveBeenCalledTimes(2));
        await new Promise((resolve) => setTimeout(resolve, 0));
        workspace.handle('restart');

        expect(workspace.config.value).toMatchObject({
            algorithm: 'RM',
            cpuCount: 2,
        });
        expect(workspace.taskCount.value).toBe(2);
    });

    it('does not open a second dialog while one is open', () => {
        const openConfigFile = vi.fn(
            () => new Promise<ConfigFileResult>(() => {}),
        );
        vi.stubGlobal('window', { configFile: { openConfigFile } });
        const workspace = useWorkspace();

        workspace.handle('load-config');
        workspace.handle('load-config');

        expect(openConfigFile).toHaveBeenCalledTimes(1);
    });
});

describe('useWorkspace export (#39)', () => {
    function stubImage(...results: ImageFileResult[]) {
        const saveImageFile = vi.fn();
        for (const result of results) {
            saveImageFile.mockResolvedValueOnce(result);
        }
        vi.stubGlobal('window', { imageFile: { saveImageFile } });
        return saveImageFile;
    }

    it('is unavailable while preparing and available from the first snapshot', async () => {
        const workspace = await prepared();
        expect(workspace.available.value.has('export-svg')).toBe(false);

        workspace.handle('step-forward');

        expect(workspace.available.value.has('export-svg')).toBe(true);
    });

    it('exports the whole history even with the cursor stepped back', async () => {
        const workspace = await prepared();
        for (let i = 0; i < 5; i++) workspace.handle('step-forward');
        workspace.handle('step-back');
        workspace.handle('step-back');
        expect(workspace.clock.value).toBe(2);
        const save = stubImage({ status: 'saved', path: '/o/g.svg' });

        workspace.handle('export-svg');
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

        const { content } = save.mock.calls[0][0] as { content: string };
        expect(content).toContain('ticks 0–4');
        expect(workspace.clock.value).toBe(2);
    });

    it('confirms where the image was saved', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        stubImage({ status: 'saved', path: '/o/g.svg' });

        workspace.handle('export-svg');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        expect(workspace.notices.value[0]).toMatchObject({
            tone: 'success',
            message: 'Imagem salva em "/o/g.svg".',
        });
    });

    it('explains a write failure and keeps the session', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        stubImage({
            status: 'failed',
            path: '/o/g.svg',
            reason: 'permission-denied',
            message:
                'Não foi possível salvar o arquivo "/o/g.svg": permissão negada.',
        });

        workspace.handle('export-svg');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        expect(workspace.notices.value[0]).toMatchObject({
            tone: 'danger',
            message: expect.stringContaining('permissão negada'),
        });
        expect(workspace.clock.value).toBe(1);
        expect(workspace.available.value.has('export-svg')).toBe(true);
    });

    it('clears the previous outcome when a new export starts and is cancelled', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        stubImage(
            { status: 'saved', path: '/o/g.svg' },
            { status: 'canceled' },
        );
        workspace.handle('export-svg');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        workspace.handle('export-svg');
        await vi.waitFor(() =>
            expect(workspace.available.value.has('export-svg')).toBe(true),
        );

        expect(workspace.notices.value).toEqual([]);
    });

    it('dismissNotice removes only the chosen message', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        stubImage({ status: 'saved', path: '/o/g.svg' });
        workspace.handle('export-svg');
        await vi.waitFor(() => expect(workspace.notices.value).toHaveLength(1));

        workspace.dismissNotice(0);

        expect(workspace.notices.value).toEqual([]);
    });

    it('treats cancel as no error', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        const save = stubImage({ status: 'canceled' });

        workspace.handle('export-svg');
        await vi.waitFor(() => expect(save).toHaveBeenCalled());
        await vi.waitFor(() =>
            expect(workspace.available.value.has('export-svg')).toBe(true),
        );

        expect(workspace.notices.value).toEqual([]);
        expect(currentError.value).toBeNull();
    });

    it('does not open a second dialog while one is open', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        const saveImageFile = vi.fn(
            () => new Promise<ImageFileResult>(() => {}),
        );
        vi.stubGlobal('window', { imageFile: { saveImageFile } });

        workspace.handle('export-svg');
        workspace.handle('export-svg');

        expect(saveImageFile).toHaveBeenCalledTimes(1);
        expect(workspace.available.value.has('export-svg')).toBe(false);
    });

    it('reports an unexpected IPC failure through the banner', async () => {
        const workspace = await prepared();
        workspace.handle('step-forward');
        vi.stubGlobal('window', {
            imageFile: {
                saveImageFile: vi.fn().mockRejectedValue(new Error('ipc')),
            },
        });

        workspace.handle('export-svg');
        await vi.waitFor(() => expect(currentError.value).not.toBeNull());

        expect(workspace.available.value.has('export-svg')).toBe(true);
    });
});

describe('useWorkspace export file name (#39)', () => {
    it.each([String.raw`C:\pastas\tarefas.txt`, '/home/u/tarefas.txt'])(
        'puts the base name of %s in the exported title',
        async (path) => {
            stubFile({ status: 'loaded', path, text: TWO_TASKS });
            const workspace = useWorkspace();
            workspace.handle('load-config');
            await vi.waitFor(() =>
                expect(workspace.taskCount.value).toBeGreaterThan(0),
            );
            workspace.handle('step-forward');
            const saveImageFile = vi
                .fn()
                .mockResolvedValue({ status: 'canceled' });
            vi.stubGlobal('window', { imageFile: { saveImageFile } });

            workspace.handle('export-svg');
            await vi.waitFor(() => expect(saveImageFile).toHaveBeenCalled());

            expect(saveImageFile.mock.calls[0][0].content).toContain(
                '>os-sim — tarefas.txt</text>',
            );
        },
    );
});

describe('useWorkspace preparation edits (#36 part 2)', () => {
    const task = (overrides = {}) => ({
        id: '1',
        color: 'F0E0D0',
        arrival: 0,
        duration: 3,
        period: 15,
        deadline: 10,
        ...overrides,
    });

    it('opens the system dialog and applies new values to the draft', () => {
        const workspace = useWorkspace();

        workspace.handle('configure-system');
        expect(workspace.dialog.value).toEqual({ kind: 'system' });

        const issues = workspace.applySystem({
            algorithm: 'EDF',
            quantum: 2,
            cpuCount: 3,
        });

        expect(issues).toEqual([]);
        expect(workspace.dialog.value).toBeNull();
        expect(workspace.config.value).toMatchObject({
            algorithm: 'EDF',
            quantum: 2,
            cpuCount: 3,
        });
        expect(workspace.snapshot.value).toBeNull();
    });

    it('an invalid system edit returns the core reasons, keeps the dialog and the draft', () => {
        const workspace = useWorkspace();
        workspace.handle('configure-system');

        const issues = workspace.applySystem({
            algorithm: 'RM',
            quantum: 0,
            cpuCount: 1,
        });

        expect(issues).toHaveLength(1);
        expect(issues[0].message).toContain('quantum');
        expect(workspace.dialog.value).toEqual({ kind: 'system' });
        expect(workspace.config.value.quantum).toBe(5);
    });

    it('adding a task starts from period 15, selects it and enables starting', () => {
        const workspace = useWorkspace();

        workspace.handle('add-task');

        expect(workspace.dialog.value).toEqual({
            kind: 'task',
            editing: null,
            initial: expect.objectContaining({ id: '1', period: 15 }),
        });
        expect(workspace.saveTask(task())).toEqual([]);
        expect(workspace.taskCount.value).toBe(1);
        expect(workspace.selectedTaskId.value).toBe('1');
        expect(workspace.dialog.value).toBeNull();
        expect(workspace.available.value.has('step-forward')).toBe(true);
        expect(workspace.available.value.has('edit-task')).toBe(true);
    });

    it('period zero is refused with its reason and nothing changes', () => {
        const workspace = useWorkspace();
        workspace.handle('add-task');

        const issues = workspace.saveTask(task({ period: 0 }));

        expect(issues).toEqual([
            expect.objectContaining({
                field: 'period',
                message: expect.stringContaining('maior que zero'),
            }),
        ]);
        expect(workspace.taskCount.value).toBe(0);
        expect(workspace.dialog.value).not.toBeNull();
    });

    it('edits the selected task in place', () => {
        const workspace = useWorkspace();
        workspace.handle('add-task');
        workspace.saveTask(task());
        workspace.handle('add-task');
        workspace.saveTask(task({ id: '2', color: 'A0B0C0' }));
        workspace.selectTask('1');

        workspace.handle('edit-task');
        expect(workspace.dialog.value).toMatchObject({
            kind: 'task',
            editing: '1',
            initial: expect.objectContaining({ id: '1', duration: 3 }),
        });
        expect(workspace.saveTask(task({ duration: 7 }))).toEqual([]);

        expect(workspace.config.value.tasks.map((t) => t.duration)).toEqual([
            7, 3,
        ]);
    });

    it('removal asks first; confirming drops the task, cancelling keeps it', () => {
        const workspace = useWorkspace();
        workspace.handle('add-task');
        workspace.saveTask(task());
        workspace.handle('edit-task');

        workspace.requestRemove();
        expect(workspace.dialog.value).toEqual({ kind: 'remove', taskId: '1' });
        workspace.cancelDialog();
        expect(workspace.taskCount.value).toBe(1);
        expect(workspace.dialog.value).toBeNull();

        workspace.handle('edit-task');
        workspace.requestRemove();
        workspace.confirmRemove();

        expect(workspace.taskCount.value).toBe(0);
        expect(workspace.selectedTaskId.value).toBeNull();
        expect(workspace.available.value.has('step-forward')).toBe(false);
    });

    it('does not open another dialog while one is open', () => {
        const workspace = useWorkspace();
        workspace.handle('configure-system');

        expect(workspace.available.value.has('add-task')).toBe(false);
        expect(workspace.available.value.has('load-config')).toBe(false);
        workspace.handle('add-task');
        workspace.handle('load-config');

        expect(workspace.dialog.value).toEqual({ kind: 'system' });
    });

    it('edits made in preparation survive a restart of the session (FE-05)', () => {
        const workspace = useWorkspace();
        workspace.handle('add-task');
        workspace.saveTask(task());
        workspace.handle('step-forward');
        workspace.handle('step-forward');

        workspace.handle('restart');

        expect(workspace.clock.value).toBe(0);
        expect(workspace.taskCount.value).toBe(1);
    });
});
