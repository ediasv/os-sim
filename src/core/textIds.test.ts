/**
 * End-to-end behavior of free-text task IDs (#133, DEC-48): a file with text
 * IDs loads and simulates, duplicates are refused with line and field, ties
 * are listed in natural order and IDs that name inherited object members work.
 */
import { describe, expect, it } from 'vitest';
import { createSimulator } from './createSimulator';
import { loadConfig } from './loadConfig';
import type { SimulationEvent } from './domain';

function simulate(text: string, ticks: number) {
    const loaded = loadConfig(text);
    if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
    const sim = createSimulator(loaded.config);
    for (let i = 0; i < ticks; i++) sim.tick();
    return sim;
}

describe('text IDs end to end (DEC-48)', () => {
    it('loads, simulates and shows tasks named A and tarefa-1', () => {
        const sim = simulate(
            'RM;2;1\nA;FF0000;0;2;5;5\ntarefa-1;00FF00;0;1;7;7',
            5,
        );
        const snapshot = sim.getLatestSnapshot();

        expect(snapshot.tasks.map((tcb) => tcb.definition.id)).toEqual([
            'A',
            'tarefa-1',
        ]);
        expect(
            snapshot.executions.map((s) => `${s.job.taskId}.${s.job.index}`),
        ).toEqual(['A.0', 'tarefa-1.0']);
    });

    it('refuses a duplicate id with the line and the field', () => {
        const loaded = loadConfig(
            'RM;2;1\nA;FF0000;0;2;5;5\n\na;00FF00;0;1;7;7',
        );

        expect(loaded.ok).toBe(false);
        if (loaded.ok) return;
        expect(loaded.issues).toHaveLength(1);
        expect(loaded.issues[0]).toMatchObject({ line: 4, field: 'id' });
        expect(loaded.issues[0].message).toContain('Linha 4, campo id');
    });

    it('lists tied jobs in natural order of their IDs', () => {
        const sim = simulate(
            [
                'RM;5;1',
                'b;FF0000;0;2;10;10',
                '10;00FF00;0;2;10;10',
                '2;0000FF;0;2;10;10',
                '',
            ].join('\n'),
            1,
        );
        const ties = sim
            .getLatestSnapshot()
            .events.filter(
                (
                    event,
                ): event is Extract<SimulationEvent, { kind: 'tie-break' }> =>
                    event.kind === 'tie-break',
            );

        expect(ties).toHaveLength(1);
        expect(ties[0].candidates.map((job) => job.taskId)).toEqual([
            '2',
            '10',
            'b',
        ]);
    });

    it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
        'accepts and edits a task whose id is %s',
        (id) => {
            const sim = simulate(`RM;2;1\n${id};FF0000;0;2;5;5`, 1);

            sim.edit([{ kind: 'taskColor', taskId: id, color: '00ff00' }]);

            expect(sim.getCurrentSnapshot().tasks[0].definition).toMatchObject({
                id,
                color: '00FF00',
            });
        },
    );

    it('refuses an edit that names an inherited member as a task', () => {
        const sim = simulate('RM;2;1\nA;FF0000;0;2;5;5', 1);

        expect(() =>
            sim.edit([
                { kind: 'taskColor', taskId: 'toString', color: 'aabbcc' },
            ]),
        ).toThrow(/Não existe a tarefa toString/);
    });
});
