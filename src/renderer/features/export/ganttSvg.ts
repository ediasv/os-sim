/**
 * Builds the exported Gantt image as SVG text (#39, DEC-08, FE-17, FE-18).
 *
 * The layout follows the Figma frame "Exportação SVG — layout da imagem"
 * (Telas page): header, a card with the tick axis on top, one lane per task
 * (highest ID on top, lowest next to the CPU lanes), a "PROCESSADORES"
 * divider, one lane per CPU, and a legend card. Lane geometry is the one of
 * the Figma components (73 px per tick, 44 px lanes, 28 px bars, 90 px label
 * column); the width is 98 + 90 + 9 + ticks x 73 px, with no tick ceiling.
 *
 * The image comes only from a snapshot, never from the screen: it has no zoom,
 * scroll or window size, covers ticks `0..clock` whatever the history cursor
 * shows (A.2.4). The caller passes the latest snapshot of the history.
 *
 * Scope of this version: execution, ready intervals, CPU-off intervals and the
 * events the core records today. Suspended and forced segments, and CPU gaps
 * from removal, are left out because they need the events of #26 (DEC-37);
 * the legend lists only what is drawn.
 *
 * The file is standalone, so colors are literals (the CSS tokens do not
 * exist outside the app); they are the dark-theme values of `tokens.css`.
 */
import type {
    DeepReadonly,
    JobRef,
    SimulationEvent,
    SimulationSnapshot,
    TaskId,
} from '../../../core/domain';
import { compareTaskIds } from '../../../core/taskId';
import { cpuOffSummary } from '../../snapshotQueries';

type Snapshot = DeepReadonly<SimulationSnapshot>;

export interface GanttSvgOptions {
    /** Name of the configuration file, shown in the title when known. */
    readonly fileName?: string;
    /** Instant shown in the header; omitted keeps the output reproducible. */
    readonly exportedAt?: Date;
}

const TICK = 73;
const LABEL_WIDTH = 90;
/** Right slack of a lane, as in the Figma frame (lane 1048 = 90 + 13 x 73 + 9). */
const LANE_SLACK = 9;
const LANE_HEIGHT = 44;
const BAR_TOP = 8;
const BAR_HEIGHT = 28;
const AXIS_HEIGHT = 24;
const DIVIDER_HEIGHT = 28;
const OUTER = 32;
const CARD_BORDER = 1;
const CARD_PAD = 16;
const HEADER_HEIGHT = 37;
const BLOCK_GAP = 16;
const MARKER = 12;
/** Vertical step between markers that share a lane and an instant (FE-17). */
const MARKER_STEP = 13;
const LEGEND_PAD_X = 16;
const LEGEND_PAD_Y = 12;
const LEGEND_GAP_X = 16;
const LEGEND_GAP_Y = 10;
const LEGEND_ROW = 15;
const MIN_WIDTH = 760;

const THEME = {
    app: '#171a21',
    surface: '#21242e',
    raised: '#292b38',
    track: '#1c1f29',
    border: '#3d404f',
    text: '#edf0f5',
    textSecondary: '#9ea3b2',
    success: '#4dbd78',
    danger: '#e55454',
    warning: '#f2b840',
    accent: '#548cfa',
} as const;

const FONT = "Inter, 'Inter Variable', system-ui, 'Segoe UI', sans-serif";

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
    readonly legend: string;
    /** Shape inside a 12 x 12 box (the exported assets of the Figma markers). */
    readonly shape: string;
}

const MARKERS: Readonly<Record<MarkerKind, MarkerStyle>> = {
    activation: {
        label: 'Ingresso / ativação',
        legend: 'Ingresso / ativação',
        shape: `<path d="M6 0.5L11.1962 8.75H0.803848L6 0.5Z" fill="${THEME.text}"/>`,
    },
    completion: {
        label: 'Término do job',
        legend: 'Término do job',
        shape: `<circle cx="6" cy="6" r="5" fill="${THEME.success}"/>`,
    },
    'deadline-miss': {
        label: 'Perda de prazo',
        legend: 'Perda de prazo',
        shape: `<path d="M6 0L12 6L6 12L0 6L6 0Z" fill="${THEME.danger}"/>`,
    },
    'tie-break': {
        label: 'Sorteio',
        legend: 'Sorteio (desempate)',
        shape: `<path d="M6 0L7.58702 3.81565L11.7063 4.1459L8.56785 6.83435L9.52671 10.8541L6 8.7L2.47329 10.8541L3.43215 6.83435L0.293661 4.1459L4.41298 3.81565L6 0Z" fill="${THEME.warning}"/>`,
    },
    preemption: {
        label: 'Preempção',
        legend: 'Preempção',
        shape: `<path d="M6 11L0.803848 2.75L11.1962 2.75L6 11Z" fill="${THEME.accent}"/>`,
    },
    'quantum-expired': {
        label: 'Quantum vencido',
        legend: 'Quantum vencido',
        shape: `<circle cx="6" cy="6" r="4.5" fill="none" stroke="${THEME.text}" stroke-width="2"/>`,
    },
    'task-finished': {
        label: 'Fim da tarefa',
        legend: 'Fim da tarefa (último job)',
        shape: `<rect x="1" y="1" width="10" height="10" rx="1" fill="${THEME.success}"/>`,
    },
};

/** Legend order of the Figma frame. */
const LEGEND_MARKERS: readonly MarkerKind[] = [
    'activation',
    'completion',
    'deadline-miss',
    'tie-break',
    'preemption',
    'quantum-expired',
    'task-finished',
];

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

function eventDescription(event: DeepReadonly<SimulationEvent>): string {
    const at = `t = ${event.time}`;
    switch (event.kind) {
        case 'task-finished':
            return `${MARKERS[event.kind].label}: tarefa ${event.taskId}, ${at}`;
        case 'preemption':
            return `${MARKERS[event.kind].label}: tarefa ${event.preempted.taskId} ${jobLabel(event.preempted)} cedeu a CPU ${event.cpuId} à tarefa ${event.by.taskId} ${jobLabel(event.by)}, ${at}`;
        case 'tie-break':
            return `${MARKERS[event.kind].label}: venceu tarefa ${event.winner.taskId} ${jobLabel(event.winner)} entre ${event.candidates.length} candidatos, ${at}`;
        case 'quantum-expired':
            return `${MARKERS[event.kind].label}: tarefa ${event.job.taskId} ${jobLabel(event.job)} na CPU ${event.cpuId}, ${at}`;
        case 'activation':
        case 'completion':
        case 'deadline-miss':
            return `${MARKERS[event.kind].label}: tarefa ${event.job.taskId} ${jobLabel(event.job)}, ${at}`;
        default:
            return at;
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
    slices: readonly Span[],
): Span[] {
    const jobs = snapshot.tasks[taskIndex].jobs;
    const job = jobs[jobIndex];
    const previous = jobIndex > 0 ? jobs[jobIndex - 1] : null;
    if (previous !== null && previous.completedAt === null) {
        return [];
    }
    const from = Math.max(job.activation, previous?.completedAt ?? 0);
    const to = job.completedAt ?? snapshot.clock;
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

/** Estimated advance of Inter text; viewers without the font differ a little. */
const textWidth = (text: string, size: number): number =>
    text.length * size * 0.55;

const two = (n: number): string => String(n).padStart(2, '0');

function formatInstant(date: Date): string {
    return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

const plural = (n: number, one: string, many: string): string =>
    `${n} ${n === 1 ? one : many}`;

function markerShape(
    kind: MarkerKind,
    x: number,
    y: number,
    title: string,
): string {
    return `<g transform="translate(${x} ${y})" data-event="${kind}"><title>${escapeXml(title)}</title>${MARKERS[kind].shape}</g>`;
}

export function buildGanttSvg(
    snapshot: Snapshot,
    options: GanttSvgOptions = {},
): string {
    const ticks = Math.max(snapshot.clock, 1);
    const canvasWidth = ticks * TICK;
    const laneWidth = LABEL_WIDTH + canvasWidth + LANE_SLACK;
    const cardInset = CARD_BORDER + CARD_PAD;
    const cardWidth = Math.max(
        laneWidth + 2 * cardInset,
        MIN_WIDTH - 2 * OUTER,
    );
    const width = cardWidth + 2 * OUTER;
    const laneX = OUTER + cardInset;
    const canvasX = laneX + LABEL_WIDTH;
    const tx = (time: number): number => canvasX + time * TICK;

    // Events sharing a lane and an instant stack vertically (FE-17); the lane
    // grows to hold the deepest stack instead of overlapping the next one.
    const stackKey = (event: DeepReadonly<SimulationEvent>): string | null => {
        const task = eventTask(event);
        return task === null ? null : `${task}:${event.time}`;
    };
    const depth = new Map<string, number>();
    const laneDepth = new Map<TaskId, number>();
    for (const event of snapshot.events) {
        const key = stackKey(event);
        const task = eventTask(event);
        if (key === null || task === null) continue;
        const next = (depth.get(key) ?? 0) + 1;
        depth.set(key, next);
        laneDepth.set(task, Math.max(laneDepth.get(task) ?? 1, next));
    }

    // Highest ID at the top, lowest next to the CPU lanes (A.2.5).
    const order = snapshot.tasks
        .map((tcb, index) => ({ tcb, index }))
        .sort((a, b) =>
            compareTaskIds(b.tcb.definition.id, a.tcb.definition.id),
        );
    const laneTop = new Map<TaskId, number>();
    const laneHeight = (id: TaskId): number =>
        LANE_HEIGHT + ((laneDepth.get(id) ?? 1) - 1) * MARKER_STEP;
    const cardTop = OUTER + HEADER_HEIGHT + BLOCK_GAP;
    let y = cardTop + cardInset + AXIS_HEIGHT;
    for (const { tcb } of order) {
        laneTop.set(tcb.definition.id, y);
        y += laneHeight(tcb.definition.id);
    }
    const dividerTop = y;
    const cpus = cpuOffSummary(snapshot);
    const cpuTop = dividerTop + DIVIDER_HEIGHT;
    const cardBottom = cpuTop + cpus.length * LANE_HEIGHT + cardInset;
    const cardHeight = cardBottom - cardTop;

    // Legend: items flow and wrap like the Figma auto-layout.
    const legendItems: { key: string; text: string; glyph: number }[] = [
        { key: 'running', text: 'Executando (cor da tarefa)', glyph: 12 },
        { key: 'ready', text: 'Pronto (contorno tracejado)', glyph: 12 },
        ...LEGEND_MARKERS.map((kind) => ({
            key: kind,
            text: MARKERS[kind].legend,
            glyph: 12,
        })),
        { key: 'cpu-off', text: 'CPU desligada', glyph: 16 },
    ];
    const legendTop = cardBottom + BLOCK_GAP;
    const legendInner = cardWidth - 2 * CARD_BORDER - 2 * LEGEND_PAD_X;
    const placed: { x: number; row: number; item: (typeof legendItems)[0] }[] =
        [];
    let rowX = 0;
    let row = 0;
    for (const item of legendItems) {
        const w = item.glyph + 8 + Math.ceil(textWidth(item.text, 12)) + 4;
        if (rowX > 0 && rowX + w > legendInner) {
            row++;
            rowX = 0;
        }
        placed.push({ x: rowX, row, item });
        rowX += w + LEGEND_GAP_X;
    }
    const legendHeight =
        2 * CARD_BORDER +
        2 * LEGEND_PAD_Y +
        (row + 1) * LEGEND_ROW +
        row * LEGEND_GAP_Y;
    const height = legendTop + legendHeight + OUTER;

    const final = isFinalSnapshot(snapshot);
    const sample = order.at(-1)?.tcb.definition.color;
    const sampleColor = sample === undefined ? THEME.accent : fill(sample);
    const heading = `os-sim${options.fileName ? ` — ${options.fileName}` : ''}`;
    const meta = [
        snapshot.config.algorithm,
        `quantum ${snapshot.config.quantum}`,
        plural(snapshot.config.cpuCount, 'CPU', 'CPUs'),
        plural(snapshot.tasks.length, 'tarefa', 'tarefas'),
        `ticks 0–${snapshot.clock}`,
        ...(final ? [] : ['resultado parcial']),
        ...(options.exportedAt
            ? [`exportado em ${formatInstant(options.exportedAt)}`]
            : []),
    ].join('  ·  ');

    const out: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}" role="img" aria-label="Diagrama de Gantt, ticks 0 a ${snapshot.clock}, ${final ? 'final' : 'parcial'}">`,
        `<title>Diagrama de Gantt, ticks 0 a ${snapshot.clock} (${final ? 'final' : 'parcial'})</title>`,
        `<defs><pattern id="tick-grid" x="${canvasX}" y="0" width="${TICK}" height="${LANE_HEIGHT}" patternUnits="userSpaceOnUse"><rect width="1" height="${LANE_HEIGHT}" fill="${THEME.border}"/></pattern></defs>`,
        `<rect width="${width}" height="${height}" fill="${THEME.app}"/>`,
        `<text x="${OUTER}" y="${OUTER + 14}" font-size="15" font-weight="600" fill="${THEME.text}">${escapeXml(heading)}</text>`,
        `<text x="${OUTER}" y="${OUTER + 33}" font-size="12" fill="${THEME.textSecondary}" xml:space="preserve">${escapeXml(meta)}</text>`,
        `<rect x="${OUTER + 0.5}" y="${cardTop + 0.5}" width="${cardWidth - 1}" height="${cardHeight - 1}" rx="12" fill="${THEME.surface}" stroke="${THEME.border}"/>`,
    ];

    /**
     * Track and gridlines of one lane, the Figma "Gantt/Lane grid". The
     * boundaries are one repeating pattern instead of a line per tick, so the
     * file grows with the lanes, not with ticks x lanes.
     */
    const grid = (top: number, laneH: number): string =>
        `<rect x="${canvasX}" y="${top + BAR_TOP}" width="${canvasWidth}" height="${BAR_HEIGHT}" rx="4" fill="${THEME.track}"/>` +
        `<rect x="${canvasX}" y="${top}" width="${canvasWidth}" height="${laneH}" fill="url(#tick-grid)"/>` +
        `<line x1="${tx(ticks) - 0.5}" y1="${top}" x2="${tx(ticks) - 0.5}" y2="${top + laneH}" stroke="${THEME.border}"/>`;

    /**
     * Text clipped to its box, as the Figma bars (overflow-clip): a nested
     * <svg> clips by default, so a wider fallback font never spills over the
     * neighbouring bar.
     */
    const clippedText = (
        x: number,
        top: number,
        w: number,
        text: string,
        color: string,
    ): string =>
        `<svg x="${x}" y="${top + BAR_TOP}" width="${w}" height="${BAR_HEIGHT}"><text x="6" y="18" font-size="9" font-weight="700" fill="${color}">${escapeXml(text)}</text></svg>`;

    // Time axis: each number centered in its tick cell.
    const axisTop = cardTop + cardInset;
    for (let t = 0; t < ticks; t++) {
        out.push(
            `<text x="${tx(t) + TICK / 2}" y="${axisTop + 16}" font-size="10" text-anchor="middle" fill="${THEME.textSecondary}">${t}</text>`,
        );
    }

    // Task lanes: grid, ready outlines, execution bars.
    for (const { tcb, index } of order) {
        const id = tcb.definition.id;
        const top = laneTop.get(id)!;
        const color = fill(tcb.definition.color);
        const slices = snapshot.executions
            .filter((slice) => slice.job.taskId === id)
            .sort((a, b) => a.start - b.start);
        out.push(
            `<g data-task="${id}">`,
            grid(top, laneHeight(id)),
            `<rect x="${laneX}" y="${top + 16}" width="12" height="12" rx="3" fill="${color}"/>`,
            `<text x="${laneX + 18}" y="${top + 26}" font-size="12" font-weight="500" fill="${THEME.text}">Tarefa ${id}</text>`,
        );
        tcb.jobs.forEach((job, jobIndex) => {
            const own = slices.filter((slice) => slice.job.index === job.index);
            for (const span of readySpans(snapshot, index, jobIndex, own)) {
                out.push(
                    `<rect data-state="ready" x="${tx(span.start) + 1.75}" y="${top + BAR_TOP + 0.75}" width="${(span.end - span.start) * TICK - 3.5}" height="${BAR_HEIGHT - 1.5}" rx="4" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3"><title>Pronta: tarefa ${id} ${jobLabel({ taskId: id, index: jobIndex })}, [${span.start}, ${span.end})</title></rect>`,
                );
            }
        });
        for (const slice of slices) {
            const w = (slice.end - slice.start) * TICK - 2;
            const full = `CPU ${slice.cpuId} · ${jobLabel(slice.job)}`;
            const short = `CPU ${slice.cpuId}`;
            // The longest label that fits; the title carries it otherwise.
            const label = [full, short].find(
                (text) => textWidth(text, 9) * 1.15 + 12 <= w,
            );
            out.push(
                `<g data-state="running"><rect x="${tx(slice.start) + 1}" y="${top + BAR_TOP}" width="${w}" height="${BAR_HEIGHT}" rx="4" fill="${color}"><title>Execução: tarefa ${id} ${jobLabel(slice.job)} na CPU ${slice.cpuId}, [${slice.start}, ${slice.end})</title></rect>`,
                label === undefined
                    ? ''
                    : clippedText(
                          tx(slice.start) + 1,
                          top,
                          w,
                          label,
                          textOn(tcb.definition.color),
                      ),
                '</g>',
            );
        }
        out.push('</g>');
    }

    // CPU divider and CPU lanes: the off intervals, an open one ending at the
    // clock (DEC-08).
    out.push(
        `<text x="${laneX}" y="${dividerTop + 22}" font-size="10" font-weight="500" fill="${THEME.textSecondary}">PROCESSADORES</text>`,
        `<line x1="${laneX + 96}" y1="${dividerTop + 17.5}" x2="${laneX + laneWidth}" y2="${dividerTop + 17.5}" stroke="${THEME.border}"/>`,
    );
    cpus.forEach((cpu, i) => {
        const top = cpuTop + i * LANE_HEIGHT;
        out.push(
            `<g data-cpu="${cpu.cpuId}">`,
            grid(top, LANE_HEIGHT),
            `<text x="${laneX}" y="${top + 26}" font-size="12" font-weight="500" fill="${THEME.textSecondary}">CPU ${cpu.cpuId}</text>`,
        );
        for (const interval of cpu.intervals) {
            const end = interval.end ?? snapshot.clock;
            if (end <= interval.start) continue;
            const w = (end - interval.start) * TICK - 2;
            out.push(
                `<rect data-state="cpu-off" x="${tx(interval.start) + 1.75}" y="${top + BAR_TOP + 0.75}" width="${w - 1.5}" height="${BAR_HEIGHT - 1.5}" rx="4" fill="${THEME.raised}" stroke="${THEME.border}" stroke-width="1.5" stroke-dasharray="4 3"><title>CPU ${cpu.cpuId} desligada: [${interval.start}, ${end})</title></rect>`,
                clippedText(
                    tx(interval.start) + 1,
                    top,
                    w,
                    'Desligada',
                    THEME.textSecondary,
                ),
            );
        }
        out.push('</g>');
    });

    // Markers last, so no lane covers them. They sit on the tick boundary,
    // centered 40 px below the lane top; coincident ones stack downward.
    const level = new Map<string, number>();
    for (const event of snapshot.events) {
        const task = eventTask(event);
        const key = stackKey(event);
        if (task === null || key === null || !laneTop.has(task)) continue;
        const at = level.get(key) ?? 0;
        level.set(key, at + 1);
        out.push(
            markerShape(
                event.kind as MarkerKind,
                tx(event.time) - MARKER / 2,
                laneTop.get(task)! + 34 + at * MARKER_STEP,
                eventDescription(event),
            ),
        );
    }

    // Legend card.
    out.push(
        `<rect x="${OUTER + 0.5}" y="${legendTop + 0.5}" width="${cardWidth - 1}" height="${legendHeight - 1}" rx="12" fill="${THEME.surface}" stroke="${THEME.border}"/>`,
    );
    for (const { x, row: r, item } of placed) {
        const gx = OUTER + CARD_BORDER + LEGEND_PAD_X + x;
        const gy =
            legendTop +
            CARD_BORDER +
            LEGEND_PAD_Y +
            r * (LEGEND_ROW + LEGEND_GAP_Y);
        let glyph: string;
        if (item.key in MARKERS) {
            glyph = markerShape(
                item.key as MarkerKind,
                gx,
                gy + 1.5,
                MARKERS[item.key as MarkerKind].label,
            );
        } else if (item.key === 'running') {
            glyph = `<rect x="${gx}" y="${gy + 1.5}" width="12" height="12" rx="3" fill="${sampleColor}"/>`;
        } else if (item.key === 'ready') {
            glyph = `<rect x="${gx + 0.75}" y="${gy + 2.25}" width="10.5" height="10.5" rx="3" fill="none" stroke="${sampleColor}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
        } else {
            glyph = `<rect x="${gx + 0.75}" y="${gy + 2.25}" width="14.5" height="10.5" rx="4" fill="${THEME.raised}" stroke="${THEME.border}" stroke-width="1.5" stroke-dasharray="3 2"/>`;
        }
        out.push(
            glyph,
            `<text x="${gx + item.glyph + 8}" y="${gy + 11.5}" font-size="12" fill="${THEME.textSecondary}">${escapeXml(item.text)}</text>`,
        );
    }

    out.push('</svg>');
    return out.join('\n');
}
