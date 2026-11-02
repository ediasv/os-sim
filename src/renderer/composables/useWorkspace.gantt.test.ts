import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from './useWorkspace';

const TWO_TASKS = 'RM;5;2\n\n1;F0E0D0;0;3;5;5\n2;A0B0C0;0;1;4;4\n';

async function started() {
    vi.stubGlobal('window', {
        configFile: {
            openConfigFile: vi.fn().mockResolvedValue({
                status: 'loaded',
                path: '/c.txt',
                text: TWO_TASKS,
            }),
        },
    });
    const workspace = useWorkspace();
    workspace.handle('load-config');
    await vi.waitFor(() =>
        expect(workspace.taskCount.value).toBeGreaterThan(0),
    );
    workspace.handle('step-forward');
    return workspace;
}

afterEach(() => vi.unstubAllGlobals());

describe('useWorkspace Gantt data and zoom (#38)', () => {
    it('has no Gantt data and no zoom while preparing', () => {
        const workspace = useWorkspace();

        expect(workspace.history.value).toBeNull();
        expect(workspace.available.value.has('zoom-in')).toBe(false);
        expect(workspace.available.value.has('zoom-out')).toBe(false);
    });

    it('keeps the whole history for the chart while the cursor steps back', async () => {
        const workspace = await started();
        workspace.handle('step-forward');
        workspace.handle('step-forward');
        workspace.handle('step-back');

        expect(workspace.snapshot.value!.clock).toBe(1);
        expect(workspace.history.value!.clock).toBe(2);
    });

    it('starts at 100% and moves through fixed zoom steps', async () => {
        const workspace = await started();

        expect(workspace.zoomPercent.value).toBe(100);
        expect(workspace.zoomScale.value).toBe(1);
        workspace.handle('zoom-in');
        expect(workspace.zoomPercent.value).toBe(150);
        workspace.handle('zoom-out');
        workspace.handle('zoom-out');
        expect(workspace.zoomPercent.value).toBe(75);
        expect(workspace.zoomScale.value).toBe(0.75);
    });

    it('stops zooming at the ends of the steps', async () => {
        const workspace = await started();

        for (let i = 0; i < 10; i++) workspace.handle('zoom-in');
        expect(workspace.zoomPercent.value).toBe(200);
        expect(workspace.available.value.has('zoom-in')).toBe(false);
        expect(workspace.available.value.has('zoom-out')).toBe(true);

        for (let i = 0; i < 10; i++) workspace.handle('zoom-out');
        expect(workspace.zoomPercent.value).toBe(50);
        expect(workspace.available.value.has('zoom-out')).toBe(false);
        expect(workspace.available.value.has('zoom-in')).toBe(true);
    });

    it('keeps the zoom when the simulation restarts', async () => {
        const workspace = await started();
        workspace.handle('zoom-in');
        workspace.handle('restart');

        expect(workspace.zoomPercent.value).toBe(150);
    });
});
