/**
 * Characterization of numeric-ID configurations (#133, DEC-48): free-text IDs
 * must not change what a file with numeric IDs produces. The trace was taken
 * from the code before the ID became text, so it pins task order, event order
 * and CPU ownership as they were. IDs are rendered with `String` so the test
 * holds before and after the type change.
 */
import { describe, expect, it } from 'vitest';
import { createSimulator } from './createSimulator';
import { loadConfig } from './loadConfig';

/** Tasks listed out of numeric order, with ties, a deadline miss and 2 CPUs. */
const NUMERIC_FILE = [
    'EDF;2;2',
    '10;0000FF;0;3;6;4;',
    '2;00FF00;0;2;4;3;',
    '1;FF0000;1;3;5;5;',
    '',
].join('\n');

function trace(text: string, ticks: number) {
    const loaded = loadConfig(text);
    if (!loaded.ok) throw new Error('fixture must load');
    const sim = createSimulator(loaded.config);
    for (let i = 0; i < ticks; i++) sim.tick();
    const last = sim.getLatestSnapshot();
    return {
        taskOrder: last.tasks.map((tcb) => String(tcb.definition.id)),
        executions: last.executions.map(
            (s) =>
                `${s.cpuId}:${s.job.taskId}.${s.job.index}@${s.start}-${s.end}`,
        ),
        events: last.events.map((event) =>
            JSON.stringify(event, (key, value) =>
                key === 'taskId' ? String(value) : value,
            ),
        ),
    };
}

describe('numeric IDs keep their order and events', () => {
    it('matches the pre-#133 trace', () => {
        expect(trace(NUMERIC_FILE, 14)).toMatchInlineSnapshot(`
          {
            "events": [
              "{"kind":"activation","time":0,"job":{"taskId":"10","index":0}}",
              "{"kind":"activation","time":0,"job":{"taskId":"2","index":0}}",
              "{"kind":"activation","time":1,"job":{"taskId":"1","index":0}}",
              "{"kind":"completion","time":2,"job":{"taskId":"2","index":0}}",
              "{"kind":"quantum-expired","time":2,"cpuId":2,"job":{"taskId":"10","index":0}}",
              "{"kind":"completion","time":3,"job":{"taskId":"10","index":0}}",
              "{"kind":"cpu-off","time":3,"cpuId":2}",
              "{"kind":"activation","time":4,"job":{"taskId":"2","index":1}}",
              "{"kind":"quantum-expired","time":4,"cpuId":1,"job":{"taskId":"1","index":0}}",
              "{"kind":"cpu-on","time":4,"cpuId":2}",
              "{"kind":"completion","time":5,"job":{"taskId":"1","index":0}}",
              "{"kind":"cpu-off","time":5,"cpuId":1}",
              "{"kind":"completion","time":6,"job":{"taskId":"2","index":1}}",
              "{"kind":"activation","time":6,"job":{"taskId":"10","index":1}}",
              "{"kind":"activation","time":6,"job":{"taskId":"1","index":1}}",
              "{"kind":"cpu-on","time":6,"cpuId":1}",
              "{"kind":"activation","time":8,"job":{"taskId":"2","index":2}}",
              "{"kind":"quantum-expired","time":8,"cpuId":1,"job":{"taskId":"10","index":1}}",
              "{"kind":"quantum-expired","time":8,"cpuId":2,"job":{"taskId":"1","index":1}}",
              "{"kind":"completion","time":9,"job":{"taskId":"10","index":1}}",
              "{"kind":"completion","time":9,"job":{"taskId":"1","index":1}}",
              "{"kind":"cpu-off","time":9,"cpuId":2}",
              "{"kind":"completion","time":11,"job":{"taskId":"2","index":2}}",
              "{"kind":"activation","time":11,"job":{"taskId":"1","index":2}}",
              "{"kind":"activation","time":12,"job":{"taskId":"10","index":2}}",
              "{"kind":"activation","time":12,"job":{"taskId":"2","index":3}}",
              "{"kind":"cpu-on","time":12,"cpuId":2}",
              "{"kind":"quantum-expired","time":13,"cpuId":1,"job":{"taskId":"1","index":2}}",
              "{"kind":"completion","time":14,"job":{"taskId":"2","index":3}}",
              "{"kind":"completion","time":14,"job":{"taskId":"1","index":2}}",
              "{"kind":"cpu-off","time":14,"cpuId":2}",
            ],
            "executions": [
              "1:2.0@0-2",
              "2:10.0@0-3",
              "1:1.0@2-5",
              "2:2.1@4-6",
              "1:10.1@6-9",
              "2:1.1@6-9",
              "1:2.2@9-11",
              "1:1.2@11-14",
              "2:2.3@12-14",
            ],
            "taskOrder": [
              "10",
              "2",
              "1",
            ],
          }
        `);
    });
});
