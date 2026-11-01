/**
 * Builds the exported Gantt image as SVG text (#39, DEC-08, FE-17, FE-18).
 *
 * The image comes only from a snapshot, never from the screen: it has no zoom,
 * scroll or window size, covers ticks `0..clock` whatever the history cursor
 * shows, and has no tick ceiling (A.2.4). The caller passes the latest
 * snapshot of the history.
 *
 * Scope of this version: execution slices, ready intervals, CPU-off bands and
 * the events the core records today. Suspended and forced segments, and CPU
 * gaps from removal, are left out because they need the events of #26
 * (DEC-37); `LEGEND_EVENTS` and the state samples list only what is drawn.
 *
 * The file is standalone, so colors are literals (the CSS tokens do not
 * exist outside the app); they match the dark theme of `tokens.css`.
 */
import type {
    DeepReadonly,
    JobRef,
    SimulationEvent,
    SimulationSnapshot,
    TaskId,
} from '../../../core/domain';
import { cpuOffSummary } from '../../snapshotQueries';

type Snapshot = DeepReadonly<SimulationSnapshot>;

const TICK_WIDTH = 28;
const MIN_ROW_HEIGHT = 40;
const LABEL_WIDTH = 96;
const MARGIN = 16;
const TITLE_HEIGHT = 32;
const RULER_HEIGHT = 24;
const CPU_ROW_HEIGHT = 24;
const SECTION_GAP = 16;
const BAR_INSET = 8;
const MARKER_SIZE = 9;
const LEGEND_ROW_HEIGHT = 22;
const LEGEND_COLUMN_WIDTH = 240;
/** Narrowest picture, so a short history still fits title and legend. */
const MIN_WIDTH = 760;

const THEME = {
    background: '#171a21',
    track: '#1c1f29',
    border: '#3d404f',
    text: '#edf0f5',
    textSecondary: '#9ea3b2',
    danger: '#e55454',
    warning: '#f2b840',
    accent: '#548cfa',
    off: '#141419',
} as const;

const FONT = "'Inter Variable', system-ui, 'Segoe UI', sans-serif";

export type MarkerKind =
    | 'activation'
    | 'completion'
    | 'task-finished'
    | 'deadline-miss'
    | 'tie-break'
    | 'preemption'
    | 'quantum-expired';

interface MarkerStyle {
    readonly label: string;
    /** Path centered on (0, 0) within `MARKER_SIZE`. */
    readonly path: string;
    readonly filled: boolean;
    readonly stroke: string;
}

const h = MARKER_SIZE / 2;

// A different shape per kind, so color is never the only cue (FE-17).
const MARKERS: Readonly<Record<MarkerKind, MarkerStyle>> = {
    activation: {
        label: 'Ingresso / ativação',
        path: `M0 ${-h} L${h} ${h} L${-h} ${h} Z`,
        filled: true,
        stroke: THEME.accent,
    },
    completion: {
        label: 'Término do job',
        path: `M${-h} ${-h} L${h} ${-h} L0 ${h} Z`,
        filled: true,
        stroke: THEME.text,
    },
    'task-finished': {
        label: 'Fim da tarefa',
        path: `M${-h} ${-h} H${h} V${h} H${-h} Z`,
        filled: true,
        stroke: THEME.text,
    },
    'deadline-miss': {
        label: 'Perda de prazo',
        path: `M${-h} ${-h} L${h} ${h} M${h} ${-h} L${-h} ${h}`,
        filled: false,
        stroke: THEME.danger,
    },
    'tie-break': {
        label: 'Sorteio',
        path: `M0 ${-h} L${h} 0 L0 ${h} L${-h} 0 Z`,
        filled: true,
        stroke: THEME.warning,
    },
    preemption: {
        label: 'Preempção',
        path: `M${-h} 0 L0 ${-h} L${h} 0 M${-h} ${h} L0 0 L${h} ${h}`,
        filled: false,
        stroke: THEME.warning,
    },
    'quantum-expired': {
        label: 'Quantum vencido',
        path: `M${h} 0 A${h} ${h} 0 1 1 ${-h} 0 A${h} ${h} 0 1 1 ${h} 0 Z`,
        filled: false,
        stroke: THEME.warning,
    },
};

const LEGEND_EVENTS = Object.keys(MARKERS) as MarkerKind[];

const escapeXml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const jobLabel = (job: JobRef): string => `#${job.index + 1}`;

/** Config colors are validated hex; anything else would only break the file. */
function fill(color: string): string {
    return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : '#888888';
}

/** Black or white, whichever contrasts more with the task color (FE-DEC-10). */
function textOn(color: string): string {
    const hex = fill(color).slice(1);
    const channel = (offset: number): number => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance =
        0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    // Contrast with white is 1.05 / (L + 0.05); with black, (L + 0.05) / 0.05.
    return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
        ? '#000000'
        : '#ffffff';
}

/** Task whose row carries the marker of this event; null for CPU events. */
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

function eventDescription(event: DeepReadonly<SimulationEvent>): string {
    const label = MARKERS[event.kind as MarkerKind].label;
    const at = `t = ${event.time}`;
    switch (event.kind) {
        case 'task-finished':
            return `${label}: tarefa ${event.taskId}, ${at}`;
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
            return `${label}, ${at}`;
    }
}

interface Span {
    readonly start: number;
    readonly end: number;
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
): Span[] {
    const jobs = snapshot.tasks[taskIndex].jobs;
    const job = jobs[jobIndex];
    const previous = jobIndex > 0 ? jobs[jobIndex - 1] : null;
    if (previous !== null && previous.completedAt === null) {
        return [];
    }
    const from = Math.max(job.activation, previous?.completedAt ?? 0);
    const to = job.completedAt ?? snapshot.clock;
    const ran = snapshot.executions
        .filter(
            (slice) =>
                slice.job.taskId === job.taskId &&
                slice.job.index === job.index,
        )
        .sort((a, b) => a.start - b.start);
    const spans: Span[] = [];
    let cursor = from;
    for (const slice of ran) {
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

function marker(kind: MarkerKind, x: number, y: number, title: string): string {
    const style = MARKERS[kind];
    return (
        `<path d="${style.path}" transform="translate(${x} ${y})" ` +
        `fill="${style.filled ? style.stroke : 'none'}" stroke="${style.stroke}" ` +
        `stroke-width="1.5" data-event="${kind}"><title>${escapeXml(title)}</title></path>`
    );
}

export function buildGanttSvg(snapshot: Snapshot): string {
    const ticks = Math.max(snapshot.clock, 1);

    // Events sharing a row and an instant stack vertically (FE-17); the row
    // grows to hold the deepest stack instead of clipping or overlapping.
    const stackKey = (event: DeepReadonly<SimulationEvent>): string | null => {
        const task = eventTask(event);
        return task === null ? null : `${task}:${event.time}`;
    };
    const depth = new Map<string, number>();
    for (const event of snapshot.events) {
        const key = stackKey(event);
        if (key !== null) depth.set(key, (depth.get(key) ?? 0) + 1);
    }
    const deepest = Math.max(1, ...depth.values());
    const rowHeight = Math.max(
        MIN_ROW_HEIGHT,
        deepest * (MARKER_SIZE + 3) + 2 * BAR_INSET,
    );
    const plotWidth = ticks * TICK_WIDTH;
    const width = Math.max(MIN_WIDTH, LABEL_WIDTH + plotWidth + 2 * MARGIN);
    const x0 = MARGIN + LABEL_WIDTH;
    const tx = (time: number): number => x0 + time * TICK_WIDTH;

    // Highest ID at the top, lowest next to the X axis (A.2.5).
    const order = snapshot.tasks
        .map((tcb, index) => ({ tcb, index }))
        .sort((a, b) => b.tcb.definition.id - a.tcb.definition.id);
    const rowTop = new Map<TaskId, number>();
    order.forEach(({ tcb }, row) => {
        rowTop.set(tcb.definition.id, MARGIN + TITLE_HEIGHT + row * rowHeight);
    });
    const rowsBottom = MARGIN + TITLE_HEIGHT + order.length * rowHeight;
    const cpuTop = rowsBottom + RULER_HEIGHT + SECTION_GAP;
    const cpus = cpuOffSummary(snapshot);
    const cpusBottom = cpuTop + cpus.length * CPU_ROW_HEIGHT;
    const legendTop = cpusBottom + SECTION_GAP;
    const perLine = Math.max(
        1,
        Math.floor((width - 2 * MARGIN) / LEGEND_COLUMN_WIDTH),
    );
    const legendItems = LEGEND_EVENTS.length + 4;
    const height =
        legendTop +
        Math.ceil(legendItems / perLine) * LEGEND_ROW_HEIGHT +
        MARGIN;

    const out: string[] = [];
    const final = isFinalSnapshot(snapshot);
    const status = final ? 'final' : 'parcial';
    out.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" role="img" aria-label="Diagrama de Gantt, t = 0 a ${snapshot.clock}, ${status}">`,
        `<title>Diagrama de Gantt, t = 0 a ${snapshot.clock} (${status})</title>`,
        `<rect width="${width}" height="${height}" fill="${THEME.background}"/>`,
        `<text x="${MARGIN}" y="${MARGIN + 16}" font-size="15" font-weight="600" fill="${THEME.text}">Diagrama de Gantt · ${snapshot.config.algorithm} · ${snapshot.config.cpuCount} CPU(s) · t = 0 a ${snapshot.clock} · ${status}</text>`,
    );

    // Task rows: track, label, slices, ready outlines.
    for (const { tcb, index } of order) {
        const id = tcb.definition.id;
        const top = rowTop.get(id)!;
        const color = fill(tcb.definition.color);
        out.push(
            `<g data-task="${id}">`,
            `<rect x="${x0}" y="${top}" width="${plotWidth}" height="${rowHeight}" fill="${THEME.track}" stroke="${THEME.border}"/>`,
            `<rect x="${MARGIN}" y="${top + 12}" width="14" height="14" rx="3" fill="${color}"/>`,
            `<text x="${MARGIN + 20}" y="${top + rowHeight / 2 + 4}" font-size="12" fill="${THEME.text}">Tarefa ${id}</text>`,
        );
        tcb.jobs.forEach((_, jobIndex) => {
            for (const span of readySpans(snapshot, index, jobIndex)) {
                out.push(
                    `<rect data-state="ready" x="${tx(span.start)}" y="${top + BAR_INSET}" width="${(span.end - span.start) * TICK_WIDTH}" height="${rowHeight - 2 * BAR_INSET}" rx="3" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3"><title>Pronta: tarefa ${id} ${jobLabel({ taskId: id, index: jobIndex })}, [${span.start}, ${span.end})</title></rect>`,
                );
            }
        });
        const slices = snapshot.executions.filter(
            (slice) => slice.job.taskId === id,
        );
        for (const slice of slices) {
            const w = (slice.end - slice.start) * TICK_WIDTH;
            const text = `CPU ${slice.cpuId} · ${jobLabel(slice.job)}`;
            out.push(
                `<g data-state="running"><rect x="${tx(slice.start)}" y="${top + BAR_INSET}" width="${w}" height="${rowHeight - 2 * BAR_INSET}" rx="3" fill="${color}"><title>Execução: tarefa ${id} ${jobLabel(slice.job)} na CPU ${slice.cpuId}, [${slice.start}, ${slice.end})</title></rect>`,
                // Label only where it fits; the title carries it otherwise.
                w >= text.length * 5.5 + 4
                    ? `<text x="${tx(slice.start) + w / 2}" y="${top + rowHeight / 2 + 4}" font-size="10" text-anchor="middle" fill="${textOn(tcb.definition.color)}">${escapeXml(text)}</text>`
                    : '',
                '</g>',
            );
        }
        out.push('</g>');
    }

    // Events: stacked vertically when they share row and instant (FE-17).
    const stacked = new Map<string, number>();
    for (const event of snapshot.events) {
        const task = eventTask(event);
        const key = stackKey(event);
        if (task === null || key === null || !rowTop.has(task)) continue;
        const level = stacked.get(key) ?? 0;
        stacked.set(key, level + 1);
        const y =
            rowTop.get(task)! + MARKER_SIZE / 2 + 2 + level * (MARKER_SIZE + 3);
        out.push(
            marker(
                event.kind as MarkerKind,
                tx(event.time),
                y,
                eventDescription(event),
            ),
        );
    }

    // X axis: each number centered in its tick cell, ticks on the boundaries.
    out.push(
        `<line x1="${x0}" y1="${rowsBottom}" x2="${x0 + plotWidth}" y2="${rowsBottom}" stroke="${THEME.border}"/>`,
    );
    for (let t = 0; t <= ticks; t++) {
        out.push(
            `<line x1="${tx(t)}" y1="${rowsBottom}" x2="${tx(t)}" y2="${rowsBottom + 4}" stroke="${THEME.textSecondary}"/>`,
        );
        if (t < ticks) {
            out.push(
                `<text x="${tx(t) + TICK_WIDTH / 2}" y="${rowsBottom + 17}" font-size="10" text-anchor="middle" fill="${THEME.textSecondary}">${t}</text>`,
            );
        }
    }
    // Current instant: the last calculated boundary.
    out.push(
        `<line x1="${tx(snapshot.clock)}" y1="${MARGIN + TITLE_HEIGHT}" x2="${tx(snapshot.clock)}" y2="${rowsBottom + 4}" stroke="${THEME.accent}" stroke-width="2" data-current="${snapshot.clock}"><title>Instante atual: t = ${snapshot.clock}</title></line>`,
    );

    // CPU strips: the off intervals; an open one ends at the clock (DEC-08).
    cpus.forEach((cpu, row) => {
        const top = cpuTop + row * CPU_ROW_HEIGHT;
        out.push(
            `<g data-cpu="${cpu.cpuId}"><rect x="${x0}" y="${top}" width="${plotWidth}" height="${CPU_ROW_HEIGHT}" fill="${THEME.track}" stroke="${THEME.border}"/>`,
            `<text x="${MARGIN}" y="${top + 16}" font-size="12" fill="${THEME.text}">CPU ${cpu.cpuId}</text>`,
        );
        for (const interval of cpu.intervals) {
            const end = interval.end ?? snapshot.clock;
            if (end <= interval.start) continue;
            out.push(
                `<rect data-state="cpu-off" x="${tx(interval.start)}" y="${top + 3}" width="${(end - interval.start) * TICK_WIDTH}" height="${CPU_ROW_HEIGHT - 6}" fill="${THEME.off}" stroke="${THEME.textSecondary}" stroke-dasharray="2 2"><title>CPU ${cpu.cpuId} desligada: [${interval.start}, ${end})</title></rect>`,
            );
        }
        out.push('</g>');
    });

    // Legend: every marker kind, plus the states drawn above.
    const entries: string[] = [];
    for (const kind of LEGEND_EVENTS) {
        entries.push(`${kind}|${MARKERS[kind].label}`);
    }
    entries.push(
        'running|Execução (cor da tarefa, CPU · job)',
        'ready|Pronta (contorno tracejado)',
        'cpu-off|CPU desligada',
        'current|Instante atual',
    );
    entries.forEach((entry, i) => {
        const [key, label] = entry.split('|');
        const x = MARGIN + (i % perLine) * LEGEND_COLUMN_WIDTH;
        const y = legendTop + Math.floor(i / perLine) * LEGEND_ROW_HEIGHT + 11;
        let sample: string;
        if (key in MARKERS) {
            sample = marker(key as MarkerKind, x + 8, y, label);
        } else if (key === 'running') {
            sample = `<rect x="${x}" y="${y - 6}" width="16" height="12" rx="2" fill="${THEME.accent}"/>`;
        } else if (key === 'ready') {
            sample = `<rect x="${x}" y="${y - 6}" width="16" height="12" rx="2" fill="none" stroke="${THEME.accent}" stroke-dasharray="4 3"/>`;
        } else if (key === 'cpu-off') {
            sample = `<rect x="${x}" y="${y - 6}" width="16" height="12" fill="${THEME.off}" stroke="${THEME.textSecondary}" stroke-dasharray="2 2"/>`;
        } else {
            sample = `<line x1="${x + 8}" y1="${y - 7}" x2="${x + 8}" y2="${y + 7}" stroke="${THEME.accent}" stroke-width="2"/>`;
        }
        out.push(
            sample,
            `<text x="${x + 24}" y="${y + 4}" font-size="11" fill="${THEME.text}">${escapeXml(label)}</text>`,
        );
    });

    out.push('</svg>');
    return out.join('\n');
}
