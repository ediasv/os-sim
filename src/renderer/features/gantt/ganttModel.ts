/**
 * Data model of the Gantt shared by the on-screen chart (#38) and the exported
 * SVG (#39, DEC-08, FE-17): which lanes exist, which segments and markers each
 * one holds, and the text that describes them. It decides nothing visual
 * (no pixels, colors of the theme or SVG), so both renderers show the same
 * facts and only differ in how they draw them.
 *
 * It is a pure function of one snapshot. Execution slices, events and CPU-off
 * intervals come from the core as recorded; the only derivation here is the
 * ready intervals, which the core does not store (see `readySpans`).
 */
import type {
    DeepReadonly,
    ExecutionSlice,
    JobRef,
    SimulationEvent,
    SimulationSnapshot,
    TaskId,
} from '../../../core/domain';
import { compareTaskIds } from '../../../core/taskId';
import { cpuOffSummary } from '../../snapshotQueries';

type Snapshot = DeepReadonly<SimulationSnapshot>;

export type MarkerKind =
    | 'activation'
    | 'completion'
    | 'task-finished'
    | 'deadline-miss'
    | 'tie-break'
    | 'preemption'
    | 'quantum-expired'
    // A concluded task with interrupted jobs; a natural end is 'task-finished'.
    | 'task-terminated';

/** Names shown on the markers and in the legend (A.2.2, A.4.3). */
export const MARKER_TEXT: Readonly<
    Record<MarkerKind, { label: string; legend: string }>
> = {
    activation: {
        label: 'Ingresso / ativação',
        legend: 'Ingresso / ativação',
    },
    completion: { label: 'Término do job', legend: 'Término do job' },
    'deadline-miss': {
        label: 'Perda de prazo',
        legend: 'Perda de prazo',
    },
    'tie-break': { label: 'Sorteio', legend: 'Sorteio (desempate)' },
    preemption: { label: 'Preempção', legend: 'Preempção' },
    'quantum-expired': {
        label: 'Quantum vencido',
        legend: 'Quantum vencido',
    },
    'task-finished': {
        label: 'Fim da tarefa',
        legend: 'Fim da tarefa (último job)',
    },
    'task-terminated': {
        label: 'Encerramento da tarefa',
        legend: 'Encerramento (jobs interrompidos)',
    },
};

/**
 * Legend entries that exist only when the history uses them: the states and
 * markers from edits (DEC-37). The base entries are always listed.
 */
export type ExtraLegendItem =
    | 'suspended'
    | 'forced'
    | 'cpu-absent'
    | 'task-terminated';

/** Legend text of those entries; shared so tela and SVG word them alike. */
export const EXTRA_LEGEND_TEXT: Readonly<Record<ExtraLegendItem, string>> = {
    suspended: 'Suspensa (hachura escura)',
    forced: 'Forçada',
    'cpu-absent': 'CPU removida',
    'task-terminated': MARKER_TEXT['task-terminated'].legend,
};

/** Legend order of the Figma frame. */
export const LEGEND_MARKERS: readonly MarkerKind[] = [
    'activation',
    'completion',
    'deadline-miss',
    'tie-break',
    'preemption',
    'quantum-expired',
    'task-finished',
];

export interface Span {
    readonly start: number;
    readonly end: number;
}

/** Ticks a job waits while eligible (see `readySpans`). */
export interface ReadySegment extends Span {
    readonly job: JobRef;
}

export interface GanttMarker {
    readonly kind: MarkerKind;
    /** Position of the event in `snapshot.events`; fixes a stable draw order. */
    readonly sequence: number;
    /** Exact instant: the marker sits on the boundary of this tick. */
    readonly time: number;
    /** Position among markers of the same lane and instant, from 0 (FE-17). */
    readonly level: number;
    readonly description: string;
}

export interface TaskLane {
    readonly id: TaskId;
    /** Configured color, six hex digits without `#`. */
    readonly color: string;
    readonly running: readonly ExecutionSlice[];
    readonly ready: readonly ReadySegment[];
    /** From `suspension` to `resumption`, the task end or the clock (REQ-09). */
    readonly suspended: readonly Span[];
    /** From `forced` to `unforced`, the task end or the clock (DEC-43). */
    readonly forced: readonly Span[];
    readonly markers: readonly GanttMarker[];
    /** Markers stacked at the busiest instant; at least 1. */
    readonly depth: number;
}

export interface CpuLane {
    readonly cpuId: number;
    /** Off intervals; an open one ends at the clock. */
    readonly off: readonly Span[];
    /**
     * Time the CPU did not exist, from `cpu-removed` to `cpu-added` (an open
     * one ends at the clock; a CPU added later is absent from 0). Not off time
     * (DEC-21 as revised by DEC-37).
     */
    readonly absent: readonly Span[];
}

export interface GanttModel {
    /** Axis length: ticks `0..clock`, never less than one. */
    readonly ticks: number;
    readonly clock: number;
    /** True when the last calculated state already ends every task (FE-18). */
    readonly final: boolean;
    /** Highest ID first, so the lowest sits next to the CPU lanes (A.2.5). */
    readonly taskLanes: readonly TaskLane[];
    readonly cpuLanes: readonly CpuLane[];
    readonly extraLegend: readonly ExtraLegendItem[];
}

/** "#n" label of a job, as shown on segments and markers. */
export const jobLabel = (job: JobRef): string => `#${job.index + 1}`;

/** Task whose lane carries the marker of this event; null for CPU events. */
function eventTask(event: DeepReadonly<SimulationEvent>): TaskId | null {
    switch (event.kind) {
        case 'activation':
        case 'completion':
        case 'deadline-miss':
        case 'quantum-expired':
            return event.job.taskId;
        case 'preemption':
            return event.preempted.taskId;
        case 'tie-break':
            return event.winner.taskId;
        case 'task-finished':
            return event.taskId;
        default:
            return null;
    }
}

function eventDescription(
    event: DeepReadonly<SimulationEvent>,
    kind: MarkerKind,
): string {
    const label = MARKER_TEXT[kind].label;
    const at = `t = ${event.time}`;
    switch (event.kind) {
        case 'task-finished':
            return event.interrupted.length === 0
                ? `${label}: tarefa ${event.taskId}, ${at}`
                : `${label}: tarefa ${event.taskId}, jobs interrompidos: ${event.interrupted.map(jobLabel).join(', ')}, ${at}`;
        case 'preemption':
            return `${label}: tarefa ${event.preempted.taskId} ${jobLabel(event.preempted)} cedeu a CPU ${event.cpuId} à tarefa ${event.by.taskId} ${jobLabel(event.by)}, ${at}`;
        case 'tie-break':
            return `${label}: venceu tarefa ${event.winner.taskId} ${jobLabel(event.winner)} entre ${event.candidates.length} candidatos, ${at}`;
        case 'quantum-expired':
            return `${label}: tarefa ${event.job.taskId} ${jobLabel(event.job)} na CPU ${event.cpuId}, ${at}`;
        case 'activation':
        case 'completion':
        case 'deadline-miss':
            return `${label}: tarefa ${event.job.taskId} ${jobLabel(event.job)}, ${at}`;
        default:
            return at;
    }
}

/**
 * Ticks a job waits while eligible: from its activation, or from the
 * completion of the previous job when that came later (DEC-02), up to its own
 * completion or the snapshot clock, minus the slices it ran. A job still
 * behind an incomplete one has none: it shows only its activation marker
 * (DEC-08).
 */
function readySpans(
    snapshot: Snapshot,
    taskIndex: number,
    jobIndex: number,
    slices: readonly Span[],
    taskEnd: number | null,
): Span[] {
    const jobs = snapshot.tasks[taskIndex].jobs;
    const job = jobs[jobIndex];
    const previous = jobIndex > 0 ? jobs[jobIndex - 1] : null;
    if (previous !== null && previous.completedAt === null) {
        return [];
    }
    const from = Math.max(job.activation, previous?.completedAt ?? 0);
    // An interrupted job never completes, so the task end stops its waiting.
    const to = Math.min(
        job.completedAt ?? snapshot.clock,
        taskEnd ?? snapshot.clock,
    );
    const spans: Span[] = [];
    let cursor = from;
    for (const slice of slices) {
        if (slice.start > cursor) {
            spans.push({ start: cursor, end: Math.min(slice.start, to) });
        }
        cursor = Math.max(cursor, slice.end);
    }
    if (cursor < to) {
        spans.push({ start: cursor, end: to });
    }
    return spans.filter((span) => span.end > span.start);
}

/** True when the last calculated state already ends every task (FE-18). */
export function isFinalSnapshot(snapshot: Snapshot): boolean {
    const finished = new Set<TaskId>();
    for (const event of snapshot.events) {
        if (event.kind === 'task-finished') finished.add(event.taskId);
    }
    return snapshot.tasks.length > 0 && finished.size === snapshot.tasks.length;
}

/** Instant a task ended (`task-finished`), or null while it goes on. */
function taskEndTime(snapshot: Snapshot, id: TaskId): number | null {
    const event = snapshot.events.find(
        (e) => e.kind === 'task-finished' && e.taskId === id,
    );
    return event === undefined ? null : event.time;
}

/**
 * Spans of a task state delimited by events: from each `start` event to the
 * next `end` event of the task, the task end, or the clock when none came
 * (A.2.1, DEC-37). Empty spans are dropped.
 */
function stateSpans(
    snapshot: Snapshot,
    id: TaskId,
    start: 'suspension' | 'forced',
    end: 'resumption' | 'unforced',
): Span[] {
    const taskEnd = taskEndTime(snapshot, id);
    const spans: Span[] = [];
    let from: number | null = null;
    for (const event of snapshot.events) {
        if (!('taskId' in event) || event.taskId !== id) continue;
        if (event.kind === start && from === null) {
            from = event.time;
        } else if (event.kind === end && from !== null) {
            spans.push({ start: from, end: event.time });
            from = null;
        }
    }
    if (from !== null) {
        spans.push({
            start: from,
            end: Math.min(taskEnd ?? Infinity, snapshot.clock),
        });
    }
    return spans.filter((span) => span.end > span.start);
}

/** The parts of `spans` outside every span of `holes`. */
function subtractSpans(spans: readonly Span[], holes: readonly Span[]): Span[] {
    let rest: Span[] = [...spans];
    for (const hole of holes) {
        rest = rest.flatMap((span) => {
            if (hole.end <= span.start || hole.start >= span.end) return [span];
            return [
                { start: span.start, end: Math.min(hole.start, span.end) },
                { start: Math.max(hole.end, span.start), end: span.end },
            ].filter((part) => part.end > part.start);
        });
    }
    return rest;
}

/** Gaps in the existence of each CPU, from `cpu-removed` and `cpu-added`. */
function cpuAbsences(snapshot: Snapshot): Map<number, Span[]> {
    const gaps = new Map<number, Span[]>();
    const removedAt = new Map<number, number>();
    const seen = new Set<number>();
    for (const event of snapshot.events) {
        if (event.kind !== 'cpu-removed' && event.kind !== 'cpu-added')
            continue;
        const list = gaps.get(event.cpuId) ?? [];
        gaps.set(event.cpuId, list);
        if (event.kind === 'cpu-removed') {
            removedAt.set(event.cpuId, event.time);
        } else {
            // A CPU whose first existence event is an addition did not exist before.
            const from =
                removedAt.get(event.cpuId) ??
                (seen.has(event.cpuId) ? event.time : 0);
            list.push({ start: from, end: event.time });
            removedAt.delete(event.cpuId);
        }
        seen.add(event.cpuId);
    }
    for (const [cpuId, from] of removedAt) {
        gaps.get(cpuId)!.push({ start: from, end: snapshot.clock });
    }
    return gaps;
}

/**
 * Markers of one lane in event order. Events sharing the lane and the instant
 * stack: each gets the next `level`, so none hides another (FE-17).
 */
function laneMarkers(snapshot: Snapshot, id: TaskId): GanttMarker[] {
    const levels = new Map<number, number>();
    const markers: GanttMarker[] = [];
    for (const [sequence, event] of snapshot.events.entries()) {
        if (eventTask(event) !== id) continue;
        const level = levels.get(event.time) ?? 0;
        levels.set(event.time, level + 1);
        const kind: MarkerKind =
            event.kind === 'task-finished' && event.interrupted.length > 0
                ? 'task-terminated'
                : (event.kind as MarkerKind);
        markers.push({
            kind,
            sequence,
            time: event.time,
            level,
            description: eventDescription(event, kind),
        });
    }
    return markers;
}

export function buildGanttModel(snapshot: Snapshot): GanttModel {
    const order = snapshot.tasks
        .map((tcb, index) => ({ tcb, index }))
        .sort((a, b) =>
            compareTaskIds(b.tcb.definition.id, a.tcb.definition.id),
        );

    const taskLanes = order.map(({ tcb, index }): TaskLane => {
        const id = tcb.definition.id;
        const running = snapshot.executions
            .filter((slice) => slice.job.taskId === id)
            .sort((a, b) => a.start - b.start);
        const taskEnd = taskEndTime(snapshot, id);
        const suspended = stateSpans(snapshot, id, 'suspension', 'resumption');
        const forced = stateSpans(snapshot, id, 'forced', 'unforced');
        // A suspended task is drawn as suspended, not as waiting.
        const ready = tcb.jobs.flatMap((job, jobIndex) => {
            const own = running.filter(
                (slice) => slice.job.index === job.index,
            );
            return subtractSpans(
                readySpans(snapshot, index, jobIndex, own, taskEnd),
                suspended,
            ).map((span): ReadySegment => ({
                ...span,
                job: { taskId: id, index: jobIndex },
            }));
        });
        const markers = laneMarkers(snapshot, id);
        return {
            id,
            color: tcb.definition.color,
            running,
            ready,
            suspended,
            forced,
            markers,
            depth: Math.max(1, ...markers.map((m) => m.level + 1)),
        };
    });

    const absences = cpuAbsences(snapshot);
    const cpuLanes = cpuOffSummary(snapshot).map((cpu): CpuLane => ({
        cpuId: cpu.cpuId,
        off: cpu.intervals
            .map((i) => ({ start: i.start, end: i.end ?? snapshot.clock }))
            .filter((i) => i.end > i.start),
        absent: (absences.get(cpu.cpuId) ?? []).filter(
            (gap) => gap.end > gap.start,
        ),
    }));

    const extraLegend: ExtraLegendItem[] = [];
    if (taskLanes.some((l) => l.suspended.length > 0))
        extraLegend.push('suspended');
    if (taskLanes.some((l) => l.forced.length > 0)) extraLegend.push('forced');
    if (cpuLanes.some((l) => l.absent.length > 0))
        extraLegend.push('cpu-absent');
    if (
        taskLanes.some((l) =>
            l.markers.some((m) => m.kind === 'task-terminated'),
        )
    ) {
        extraLegend.push('task-terminated');
    }

    return {
        ticks: Math.max(snapshot.clock, 1),
        clock: snapshot.clock,
        final: isFinalSnapshot(snapshot),
        taskLanes,
        cpuLanes,
        extraLegend,
    };
}
