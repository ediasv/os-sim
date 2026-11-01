import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigFileResult } from '../../shared/configFile';
import { currentError, dismissError } from '../errors';
import { useWorkspace } from './useWorkspace';

// Lets a test make `next` fail like a core refusal, which no short
// configuration reaches (the core only refuses past its length limit).
const refuse = vi.hoisted(() => ({ next: false }));
vi.mock('./useSimulation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./useSimulation')>();
    return {
        ...actual,
        useSimulation: () => {
            const sim = actual.useSimulation();
            return {
                ...sim,
                next: () =>
                    refuse.next
                        ? {
                              ok: false as const,
                              error: {
                                  kind: 'refused' as const,
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
    vi.unstubAllGlobals();
    dismissError();
});

describe('useWorkspace', () => {
    it('opens in preparation: defaults, no snapshot, only loading available', () => {
        const workspace = useWorkspace();

        expect(workspace.snapshot.value).toBeNull();
        expect(workspace.clock.value).toBeNull();
        expect(workspace.config.value).toMatchObject({
            algorithm: 'RM',
            quantum: 5,
            cpuCount: 1,
        });
        expect([...workspace.available.value]).toEqual(['load-config']);
    });

    it('loading a file prepares its configuration without starting', async () => {
        const workspace = await prepared();

        expect(workspace.snapshot.value).toBeNull();
        expect(workspace.config.value.cpuCount).toBe(2);
        expect(workspace.taskCount.value).toBe(2);
        expect(workspace.available.value.has('step-forward')).toBe(true);
        expect(workspace.available.value.has('restart')).toBe(false);
    });

    it('the first step publishes snapshot zero without running a tick', async () => {
        const workspace = await prepared();

        workspace.handle('step-forward');

        expect(workspace.clock.value).toBe(0);
        expect(workspace.snapshot.value?.executions).toEqual([]);
        expect(workspace.available.value.has('load-config')).toBe(false);
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
});
