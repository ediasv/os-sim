/**
 * The demonstration files of `demoConfigs/` (#45, A.3.3.7): each one is read
 * from disk, loaded with `loadConfig` and run with `createSimulator`, and the
 * facts promised in `demoConfigs/README.md` are checked. Expected instants
 * were derived by hand from the rules (DEC-04, DEC-09, DEC-16, DEC-18,
 * DEC-22) and the figures of section 2.4, never copied from the engine. The
 * schedules of figures 2.5 and 2.6 are also checked in `core/scenarios.test.ts`
 * (#21); here the point is that the files on disk produce them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, describe, expect, it } from 'vitest';
import { summarizeCpuOff } from '../core/cpuOff';
import { findInconsistencies } from '../core/consistency';
import { createSimulator } from '../core/createSimulator';
import type {
    JobRef,
    SimulationEvent,
    SimulationSnapshot,
} from '../core/domain';
import { loadConfig } from '../core/loadConfig';

const DIR = fileURLToPath(new URL('../../demoConfigs/', import.meta.url));

const text = (name: string) => readFileSync(DIR + name, 'utf8');

function load(name: string) {
    const result = loadConfig(text(name));
    assert(result.ok, `${name} must load: ${JSON.stringify(result)}`);
    return result;
}

/** Runs `ticks` steps, checking consistency after each; clock ends at `ticks`. */
function run(name: string, ticks: number): SimulationSnapshot {
    const sim = createSimulator(load(name).config);
    for (let step = 0; step < ticks; step++) {
        sim.tick();
        expect(
            findInconsistencies(sim.getLatestSnapshot()),
            `${name} after tick ${step + 1}`,
        ).toEqual([]);
    }
    return sim.getLatestSnapshot();
}

const ref = (taskId: number, index: number): JobRef => ({ taskId, index });
const of = (s: SimulationSnapshot, kind: SimulationEvent['kind']) =>
    s.events.filter((event) => event.kind === kind);
const act = (time: number, taskId: number, index: number): SimulationEvent => ({
    kind: 'activation',
    time,
    job: ref(taskId, index),
});
const done = (
    time: number,
    taskId: number,
    index: number,
): SimulationEvent => ({
    kind: 'completion',
    time,
    job: ref(taskId, index),
});
const miss = (time: number, job: JobRef): SimulationEvent => ({
    kind: 'deadline-miss',
    time,
    job,
});
const preempt = (
    time: number,
    preempted: JobRef,
    by: JobRef,
): SimulationEvent => ({ kind: 'preemption', time, cpuId: 1, preempted, by });
const slice = (cpuId: number, job: JobRef, start: number, end: number) => ({
    cpuId,
    job,
    start,
    end,
});

describe('demoConfigs: the directory', () => {
    it('holds exactly the files this test covers', () => {
        expect(readdirSync(DIR).filter((f) => f !== 'README.md')).toEqual([
            '01-rm-figura-2-5.txt',
            '02-edf-figura-2-6.txt',
            '03-rm-figura-2-6.txt',
            '04-multi-cpu-desliga-religa.txt',
            '05-preempcao-quantum-sorteio.txt',
            '06-aperiodica-periodo-padrao.txt',
            '07-sobrecarga-prazo-perdido.txt',
            '08-simulacao-longa.txt',
            '09-erros-diagnosticos.txt',
            '10-erros-sintaxe.txt',
        ]);
    });

    it.each([
        '01-rm-figura-2-5.txt',
        '02-edf-figura-2-6.txt',
        '03-rm-figura-2-6.txt',
        '04-multi-cpu-desliga-religa.txt',
        '05-preempcao-quantum-sorteio.txt',
        '07-sobrecarga-prazo-perdido.txt',
        '08-simulacao-longa.txt',
    ])('loads %s without warnings', (name) => {
        expect(load(name).warnings).toEqual([]);
    });
});

describe('01: RM, Table 2.1 / figure 2.5', () => {
    it('preempts C at 100, 150 and 200 and idles the CPU in [240, 300)', () => {
        const s = run('01-rm-figura-2-5.txt', 360);

        expect(load('01-rm-figura-2-5.txt').config).toMatchObject({
            algorithm: 'RM',
            quantum: 100,
            cpuCount: 1,
        });
        expect(of(s, 'preemption')).toEqual([
            preempt(100, ref(3, 0), ref(1, 1)),
            preempt(150, ref(3, 0), ref(2, 1)),
            preempt(200, ref(3, 0), ref(1, 2)),
        ]);
        expect(of(s, 'completion')).toContainEqual(done(240, 3, 0));
        expect(of(s, 'deadline-miss')).toEqual([]);
        expect(of(s, 'quantum-expired')).toEqual([]);
        expect(summarizeCpuOff(s)[0].intervals).toEqual([
            { start: 240, end: 300 },
        ]);
        expect(s.executions[0]).toEqual(slice(1, ref(1, 0), 0, 20));
        expect(s.executions.at(-1)).toEqual(slice(1, ref(2, 2), 320, 360));
    });
});

describe('02 and 03: figure 2.6 under EDF and RM', () => {
    it('02: EDF meets every deadline; B keeps the CPU at t=40', () => {
        const s = run('02-edf-figura-2-6.txt', 55);

        expect(s.executions).toEqual([
            slice(1, ref(1, 0), 0, 10),
            slice(1, ref(2, 0), 10, 20),
            slice(1, ref(1, 1), 20, 30),
            slice(1, ref(2, 0), 30, 45),
            slice(1, ref(1, 2), 45, 55),
        ]);
        expect(of(s, 'deadline-miss')).toEqual([]);
        expect(of(s, 'preemption')).toEqual([
            preempt(20, ref(2, 0), ref(1, 1)),
        ]);
    });

    it('03: RM misses B at t=50 and still finishes it at t=55', () => {
        const s = run('03-rm-figura-2-6.txt', 55);

        expect(of(s, 'deadline-miss')).toEqual([miss(50, ref(2, 0))]);
        expect(s.executions.at(-1)).toEqual(slice(1, ref(2, 0), 50, 55));
        // The miss is logged before the activation at the same instant (DEC-22).
        const at50 = s.events.filter((event) => event.time === 50);
        expect(at50).toEqual([
            done(50, 1, 2),
            miss(50, ref(2, 0)),
            act(50, 2, 1),
        ]);
        expect(of(s, 'completion')).toContainEqual(done(55, 2, 0));
    });
});

describe('04: two CPUs, one switched off and on again', () => {
    it('shows CPU 2 off in [4, 12) and CPU 1 off in [8, 12)', () => {
        const s = run('04-multi-cpu-desliga-religa.txt', 13);

        expect(summarizeCpuOff(s)).toEqual([
            { cpuId: 1, intervals: [{ start: 8, end: 12 }], totalOff: 4 },
            { cpuId: 2, intervals: [{ start: 4, end: 12 }], totalOff: 8 },
        ]);
        expect(of(s, 'cpu-off')).toEqual([
            { kind: 'cpu-off', time: 4, cpuId: 2 },
            { kind: 'cpu-off', time: 8, cpuId: 1 },
        ]);
        expect(of(s, 'cpu-on')).toEqual([
            { kind: 'cpu-on', time: 12, cpuId: 1 },
            { kind: 'cpu-on', time: 12, cpuId: 2 },
        ]);
    });

    it('preempts task 2 on CPU 2 at t=2 and resumes it on CPU 1 at t=4', () => {
        const s = run('04-multi-cpu-desliga-religa.txt', 13);

        expect(of(s, 'preemption')).toEqual([
            {
                kind: 'preemption',
                time: 2,
                cpuId: 2,
                preempted: ref(2, 0),
                by: ref(3, 0),
            },
        ]);
        expect(s.executions).toEqual([
            slice(1, ref(1, 0), 0, 4),
            slice(2, ref(2, 0), 0, 2),
            slice(2, ref(3, 0), 2, 4),
            slice(1, ref(2, 0), 4, 8),
            slice(1, ref(3, 1), 12, 13),
            slice(2, ref(1, 1), 12, 13),
        ]);
    });
});

describe('05: preemption, quantum expiry and a tie settled by the draw', () => {
    // Tasks 3 and 4 are twins (same period, duration and arrival), shorter
    // than task 1, so only they tie at t=0 and one CPU cuts the group.
    const run05 = () => run('05-preempcao-quantum-sorteio.txt', 14);

    it('draws the first job among the twins at t=0 and records it', () => {
        const draws = of(run05(), 'tie-break');

        expect(draws).toHaveLength(1);
        const [draw] = draws;
        assert(draw.kind === 'tie-break');
        expect(draw.time).toBe(0);
        expect(draw.candidates).toEqual([ref(3, 0), ref(4, 0)]);
        expect([ref(3, 0), ref(4, 0)]).toContainEqual(draw.winner);
    });

    it('runs winner, loser, task 2, loser, task 1 in the derived intervals', () => {
        const s = run05();
        const draw = of(s, 'tie-break')[0];
        assert(draw.kind === 'tie-break');
        const winner = draw.winner;
        const loser = draw.candidates.find(
            (job) => job.taskId !== winner.taskId,
        );
        assert(loser !== undefined);

        // The winner finishes exactly when its slice would expire (t=2), so
        // no expiry is logged for it. Task 2 (period 7) preempts the loser
        // at t=3 and task 1 at t=10, the instant task 1's second slice
        // expires: the expiry is logged first, then the activation and the
        // preemption (DEC-18, DEC-22). Task 1 has quantum slices [6, 8) and
        // [8, 10) and resumes at t=12 with 2 ticks left, ending at t=14.
        expect(s.executions).toEqual([
            slice(1, winner, 0, 2),
            slice(1, loser, 2, 3),
            slice(1, ref(2, 0), 3, 5),
            slice(1, loser, 5, 6),
            slice(1, ref(1, 0), 6, 10),
            slice(1, ref(2, 1), 10, 12),
            slice(1, ref(1, 0), 12, 14),
        ]);
        expect(of(s, 'preemption')).toEqual([
            preempt(3, loser, ref(2, 0)),
            preempt(10, ref(1, 0), ref(2, 1)),
        ]);
        expect(of(s, 'quantum-expired')).toEqual([
            { kind: 'quantum-expired', time: 8, cpuId: 1, job: ref(1, 0) },
            { kind: 'quantum-expired', time: 10, cpuId: 1, job: ref(1, 0) },
        ]);
        expect(s.events.filter((event) => event.time === 10)).toEqual([
            { kind: 'quantum-expired', time: 10, cpuId: 1, job: ref(1, 0) },
            act(10, 2, 1),
            preempt(10, ref(1, 0), ref(2, 1)),
        ]);
        expect(of(s, 'deadline-miss')).toEqual([]);
    });
});

describe('06: aperiodic tasks receive the default period (DEC-29)', () => {
    it('warns once per converted task, with line, field and value', () => {
        const result = load('06-aperiodica-periodo-padrao.txt');

        expect(result.config.tasks.map((task) => task.period)).toEqual([
            15, 15, 8,
        ]);
        expect(result.warnings).toEqual([
            {
                line: 2,
                field: 'periodo',
                value: null,
                valueKind: 'missing',
                origin: 'default-period',
                taskId: 1,
                message:
                    'Linha 2, campo periodo: toda tarefa precisa de período maior que zero; a tarefa 1 usará o período padrão de 15 ticks.',
            },
            {
                line: 3,
                field: 'periodo',
                value: '0',
                valueKind: 'received',
                origin: 'default-period',
                taskId: 2,
                message:
                    'Linha 3, campo periodo (valor 0): toda tarefa precisa de período maior que zero; a tarefa 2 usará o período padrão de 15 ticks.',
            },
        ]);
    });

    it('runs the converted tasks as periodic ones, reactivating at 15 and 17', () => {
        const s = run('06-aperiodica-periodo-padrao.txt', 21);

        expect(of(s, 'activation')).toEqual([
            act(0, 1, 0),
            act(0, 3, 0),
            act(2, 2, 0),
            act(8, 3, 1),
            act(15, 1, 1),
            act(16, 3, 2),
            act(17, 2, 1),
        ]);
        // At t=2, tasks 1 and 2 tie on RM priority and on deadline 12; the
        // earlier activation picks task 1, so no draw happens (DEC-16).
        expect(s.executions).toEqual([
            slice(1, ref(3, 0), 0, 2),
            slice(1, ref(1, 0), 2, 6),
            slice(1, ref(2, 0), 6, 8),
            slice(1, ref(3, 1), 8, 10),
            slice(1, ref(2, 0), 10, 11),
            slice(1, ref(1, 1), 15, 16),
            slice(1, ref(3, 2), 16, 18),
            slice(1, ref(1, 1), 18, 21),
        ]);
        expect(of(s, 'tie-break')).toEqual([]);
        expect(of(s, 'deadline-miss')).toEqual([]);
        expect(summarizeCpuOff(s)[0].intervals).toEqual([
            { start: 11, end: 15 },
        ]);
    });
});

describe('07: overload records missed deadlines without an error (DEC-10)', () => {
    it('loads, and logs misses at t=3, 6 and 12 while late jobs keep running', () => {
        const s = run('07-sobrecarga-prazo-perdido.txt', 12);

        // Task 3 has deadline 3 < duration 5; tasks 1 and 2 need 3/4 + 3/6.
        expect(of(s, 'deadline-miss')).toEqual([
            miss(3, ref(3, 0)),
            miss(6, ref(2, 0)),
            miss(12, ref(2, 1)),
        ]);
        expect(s.executions).toEqual([
            slice(1, ref(1, 0), 0, 3),
            slice(1, ref(2, 0), 3, 4),
            slice(1, ref(1, 1), 4, 7),
            slice(1, ref(2, 0), 7, 8),
            slice(1, ref(1, 2), 8, 11),
            slice(1, ref(2, 0), 11, 12),
        ]);
        // A late job completes normally; its miss was logged once (DEC-04).
        expect(of(s, 'completion')).toContainEqual(done(12, 2, 0));
        expect(of(s, 'preemption')).toEqual([
            preempt(4, ref(2, 0), ref(1, 1)),
            preempt(8, ref(2, 0), ref(1, 2)),
        ]);
        expect(s.events.filter((event) => event.time === 3)).toEqual([
            done(3, 1, 0),
            miss(3, ref(3, 0)),
        ]);
    });
});

describe('08: long simulation for export', () => {
    it('ends at t=457 with ten jobs per task, no miss and no inconsistency', () => {
        const { config } = load('08-simulacao-longa.txt');
        const sim = createSimulator(config);
        const finished = () =>
            of(sim.getLatestSnapshot(), 'task-finished').length;
        while (finished() < config.tasks.length) {
            expect(sim.getLatestSnapshot().clock).toBeLessThan(600);
            sim.tick();
        }
        const s = sim.getLatestSnapshot();

        // Total duration 25 <= shortest period 30, so each job ends before
        // the next of its task arrives. Task 5 (period 50) activates last, at
        // 9 * 50 = 450, when tasks 1 to 4 have stopped (last activations 270,
        // 315, 360, 405), so it runs alone: 450 + 7 = 457.
        expect(s.clock).toBe(457);
        expect(s.tasks.map((task) => task.jobs.length)).toEqual(
            Array(5).fill(10),
        );
        expect(s.tasks.map((task) => task.jobs.at(-1)?.activation)).toEqual([
            270, 315, 360, 405, 450,
        ]);
        expect(s.executions.at(-1)).toEqual(slice(1, ref(5, 9), 450, 457));
        expect(of(s, 'deadline-miss')).toEqual([]);
        expect(findInconsistencies(s)).toEqual([]);
    });
});

describe('09 and 10: files with errors show line, field and value (DEC-19)', () => {
    function issuesOf(name: string) {
        const result = loadConfig(text(name));
        assert(!result.ok, `${name} must be rejected`);
        return result.issues;
    }

    it('09: reports every semantic problem in file order', () => {
        const issues = issuesOf('09-erros-diagnosticos.txt');

        expect(
            issues.map(({ line, field, value, origin }) => ({
                line,
                field,
                value,
                origin,
            })),
        ).toEqual([
            { line: 1, field: 'quantum', value: '0', origin: 'core' },
            { line: 3, field: 'ingresso', value: '-1', origin: 'core' },
            { line: 3, field: 'cor', value: 'E41A1C', origin: 'core' },
            { line: 4, field: 'duracao', value: '0', origin: 'core' },
            { line: 4, field: 'prazo', value: '0', origin: 'core' },
            { line: 4, field: 'id', value: '1', origin: 'core' },
        ]);
        expect(issues.map((issue) => issue.message)).toEqual([
            'Linha 1, campo quantum: O campo quantum deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
            'Linha 3, campo ingresso: O campo ingresso deve ser um número inteiro maior ou igual a 0; valor recebido: -1.',
            'Linha 3, campo cor: A cor E41A1C já foi usada pela 1ª tarefa; cada tarefa precisa de uma cor diferente.',
            'Linha 4, campo duracao: O campo duracao deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
            'Linha 4, campo prazo: O campo prazo deve ser um número inteiro maior ou igual a 1; valor recebido: 0.',
            'Linha 4, campo id: O id 1 já foi usado pela 1ª tarefa; cada tarefa precisa de um id único.',
        ]);
    });

    it('10: reports only the syntax problems while a line is broken', () => {
        const issues = issuesOf('10-erros-sintaxe.txt');

        expect(issues).toEqual([
            {
                line: 3,
                field: 'ingresso',
                value: 'x',
                valueKind: 'received',
                origin: 'syntax',
                message:
                    'Linha 3, campo ingresso, valor "x": esperado um número.',
            },
            {
                line: 4,
                field: 'prazo',
                value: null,
                valueKind: 'missing',
                origin: 'syntax',
                message:
                    'Linha 4, campo prazo, valor ausente: campo obrigatório ausente; esperados 6 campos antes da lista_eventos opcional (formato: id;cor;ingresso;duracao;periodo;prazo;lista_eventos) e recebidos 5.',
            },
        ]);
    });
});
