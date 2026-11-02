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
 * Lanes, segments, markers and their descriptions come from `ganttModel`, the
 * same model the on-screen Gantt draws (#38); this file only turns it into
 * SVG, so the two views cannot disagree about the data.
 *
 * The image comes only from a snapshot, never from the screen: it has no zoom,
 * scroll or window size, covers ticks `0..clock` whatever the history cursor
 * shows (A.2.4). The caller passes the latest snapshot of the history.
 *
 * Drawn: execution, ready intervals, CPU-off intervals and the task markers,
 * plus the states edits produce (DEC-37): suspended segments (dark hatch),
 * forced segments (strip along the bar's foot), CPU gaps between removal and
 * addition (light hatch, not counted as off) and the end of a task with
 * interrupted jobs. The legend always lists the base entries; the entries of
 * the edit states appear only when the history drew them.
 *
 * The file is standalone, so colors are literals (the CSS tokens do not
 * exist outside the app); they are the dark-theme values of `tokens.css`.
 */
import type {
    DeepReadonly,
    SimulationSnapshot,
    TaskId,
} from '../../../core/domain';
import {
    buildGanttModel,
    EXTRA_LEGEND_TEXT,
    jobLabel,
    LEGEND_MARKERS,
    MARKER_TEXT,
    type MarkerKind,
} from '../gantt/ganttModel';
import { taskFill as fill, textOn } from '../gantt/colors';
import {
    BAR_HEIGHT,
    BAR_TOP,
    FORCED_STRIP,
    LABEL_WIDTH,
    LANE_HEIGHT,
    laneHeight as laneHeightFor,
    MARKER,
    MARKER_OFFSET,
    MARKER_STEP,
    textWidth,
    TICK,
} from '../gantt/geometry';
import { MARKER_SHAPES, type Paint } from '../gantt/markerShapes';

type Snapshot = DeepReadonly<SimulationSnapshot>;

export interface GanttSvgOptions {
    /** Name of the configuration file, shown in the title when known. */
    readonly fileName?: string;
    /** Instant shown in the header; omitted keeps the output reproducible. */
    readonly exportedAt?: Date;
}

/** Right slack of a lane, as in the Figma frame (lane 1048 = 90 + 13 x 73 + 9). */
const LANE_SLACK = 9;
const AXIS_HEIGHT = 24;
const DIVIDER_HEIGHT = 28;
const OUTER = 32;
const CARD_BORDER = 1;
const CARD_PAD = 16;
const HEADER_HEIGHT = 37;
const BLOCK_GAP = 16;
/** `--color-bg-suspended` of tokens.css, as the on-screen hatch uses. */
const SUSPENDED_FILL = '#141419';

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

const PAINT: Readonly<Record<Paint, string>> = {
    text: THEME.text,
    success: THEME.success,
    danger: THEME.danger,
    warning: THEME.warning,
    accent: THEME.accent,
};

/** Marker shape inside its 12 x 12 box, with the literal theme colors. */
function shapeOf(kind: MarkerKind): string {
    return MARKER_SHAPES[kind]
        .map((part) => {
            const geometry = Object.entries(part.attrs)
                .map(([name, value]) => `${name}="${value}"`)
                .join(' ');
            const color = PAINT[part.paint];
            const paint =
                part.mode === 'fill'
                    ? `fill="${color}"`
                    : `${part.mode === 'outline' ? 'fill="none" ' : ''}stroke="${color}" stroke-width="${part.strokeWidth}"`;
            return `<${part.tag} ${geometry} ${paint}/>`;
        })
        .join('');
}

const escapeXml = (text: string): string =>
    Array.from(text, (character) => {
        const code = character.codePointAt(0)!;
        return code === 9 ||
            code === 10 ||
            code === 13 ||
            (code >= 0x20 && code <= 0xd7ff) ||
            (code >= 0xe000 && code <= 0xfffd) ||
            (code >= 0x10000 && code <= 0x10ffff)
            ? character
            : '\uFFFD';
    })
        .join('')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Room for the lane label: the label column minus the color chip and a gap. */
const LANE_LABEL_WIDTH = LABEL_WIDTH - 18 - 6;
const LANE_LABEL_SIZE = 12;

/**
 * Lane label of a task, already escaped. A long text ID (DEC-48) would run
 * into the bars, so it is cut with an ellipsis and the whole ID goes in a
 * tooltip; short and numeric IDs keep the plain "Tarefa <id>" label.
 */
function laneLabel(id: string): string {
    const full = `Tarefa ${id}`;
    if (textWidth(full, LANE_LABEL_SIZE) <= LANE_LABEL_WIDTH) {
        return escapeXml(full);
    }
    const room = Math.floor(LANE_LABEL_WIDTH / (LANE_LABEL_SIZE * 0.55));
    const cut = `${Array.from(id)
        .slice(0, room - 1)
        .join('')}…`;
    return `${escapeXml(cut)}<title>${escapeXml(full)}</title>`;
}

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
    return `<g transform="translate(${x} ${y})" data-event="${kind}"><title>${escapeXml(title)}</title>${shapeOf(kind)}</g>`;
}

export function buildGanttSvg(
    snapshot: Snapshot,
    options: GanttSvgOptions = {},
): string {
    const model = buildGanttModel(snapshot);
    const ticks = model.ticks;
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

    // Highest ID at the top, lowest next to the CPU lanes (A.2.5); a lane grows
    // to hold its deepest marker stack (FE-17) instead of overlapping the next.
    const order = model.taskLanes;
    const lanes = new Map(order.map((lane) => [lane.id, lane]));
    const laneTop = new Map<TaskId, number>();
    const laneHeight = (id: TaskId): number =>
        laneHeightFor(lanes.get(id)!.depth);
    const cardTop = OUTER + HEADER_HEIGHT + BLOCK_GAP;
    let y = cardTop + cardInset + AXIS_HEIGHT;
    for (const lane of order) {
        laneTop.set(lane.id, y);
        y += laneHeight(lane.id);
    }
    const dividerTop = y;
    const cpus = model.cpuLanes;
    const cpuTop = dividerTop + DIVIDER_HEIGHT;
    const cardBottom = cpuTop + cpus.length * LANE_HEIGHT + cardInset;
    const cardHeight = cardBottom - cardTop;

    // Legend: items flow and wrap like the Figma auto-layout.
    const legendItems: { key: string; text: string; glyph: number }[] = [
        { key: 'running', text: 'Executando (cor da tarefa)', glyph: 12 },
        { key: 'ready', text: 'Pronto (contorno tracejado)', glyph: 12 },
        ...LEGEND_MARKERS.map((kind) => ({
            key: kind,
            text: MARKER_TEXT[kind].legend,
            glyph: 12,
        })),
        { key: 'cpu-off', text: 'CPU desligada', glyph: 16 },
        ...model.extraLegend.map((key) => ({
            key,
            text: EXTRA_LEGEND_TEXT[key],
            glyph: key === 'cpu-absent' ? 16 : 12,
        })),
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

    const final = model.final;
    // Hatch patterns exist only when the history draws the states that use them.
    const hatchDefs =
        (model.extraLegend.includes('suspended')
            ? `<pattern id="suspended-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${SUSPENDED_FILL}"/><rect width="2" height="6" fill="${THEME.textSecondary}"/></pattern>`
            : '') +
        (model.extraLegend.includes('cpu-absent')
            ? `<pattern id="absent-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="6" fill="${THEME.border}"/></pattern>`
            : '');
    const sample = order.at(-1)?.color;
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
        `<defs><pattern id="tick-grid" x="${canvasX}" y="0" width="${TICK}" height="${LANE_HEIGHT}" patternUnits="userSpaceOnUse"><rect width="1" height="${LANE_HEIGHT}" fill="${THEME.border}"/></pattern>${hatchDefs}</defs>`,
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
    for (const lane of order) {
        const id = lane.id;
        const top = laneTop.get(id)!;
        const color = fill(lane.color);
        out.push(
            `<g data-task="${escapeXml(id)}">`,
            grid(top, laneHeight(id)),
            `<rect x="${laneX}" y="${top + 16}" width="12" height="12" rx="3" fill="${color}"/>`,
            `<text x="${laneX + 18}" y="${top + 26}" font-size="12" font-weight="500" fill="${THEME.text}">${laneLabel(id)}</text>`,
        );
        for (const span of lane.ready) {
            out.push(
                `<rect data-state="ready" x="${tx(span.start) + 1.75}" y="${top + BAR_TOP + 0.75}" width="${(span.end - span.start) * TICK - 3.5}" height="${BAR_HEIGHT - 1.5}" rx="4" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3"><title>Pronta: tarefa ${escapeXml(id)} ${jobLabel(span.job)}, [${span.start}, ${span.end})</title></rect>`,
            );
        }
        for (const span of lane.suspended) {
            const w = (span.end - span.start) * TICK - 2;
            out.push(
                `<rect data-state="suspended" x="${tx(span.start) + 1}" y="${top + BAR_TOP}" width="${w}" height="${BAR_HEIGHT}" rx="4" fill="url(#suspended-hatch)" stroke="${THEME.border}"><title>Suspensa: tarefa ${escapeXml(id)}, [${span.start}, ${span.end})</title></rect>`,
            );
        }
        for (const slice of lane.running) {
            const w = (slice.end - slice.start) * TICK - 2;
            const full = `CPU ${slice.cpuId} · ${jobLabel(slice.job)}`;
            const short = `CPU ${slice.cpuId}`;
            // The longest label that fits; the title carries it otherwise.
            const label = [full, short].find(
                (text) => textWidth(text, 9) * 1.15 + 12 <= w,
            );
            out.push(
                `<g data-state="running"><rect x="${tx(slice.start) + 1}" y="${top + BAR_TOP}" width="${w}" height="${BAR_HEIGHT}" rx="4" fill="${color}"><title>Execução: tarefa ${escapeXml(id)} ${jobLabel(slice.job)} na CPU ${slice.cpuId}, [${slice.start}, ${slice.end})</title></rect>`,
                label === undefined
                    ? ''
                    : clippedText(
                          tx(slice.start) + 1,
                          top,
                          w,
                          label,
                          textOn(lane.color),
                      ),
                '</g>',
            );
        }
        // Forced: a strip along the foot of the bar, over whatever runs there,
        // so a forced task stays readable even while it waits for a CPU.
        for (const span of lane.forced) {
            const w = (span.end - span.start) * TICK - 2;
            out.push(
                `<rect data-state="forced" x="${tx(span.start) + 1}" y="${top + BAR_TOP + BAR_HEIGHT - FORCED_STRIP}" width="${w}" height="${FORCED_STRIP}" rx="2" fill="${THEME.warning}"><title>Forçada: tarefa ${escapeXml(id)}, [${span.start}, ${span.end})</title></rect>`,
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
        for (const gap of cpu.absent) {
            const w = (gap.end - gap.start) * TICK - 2;
            out.push(
                `<rect data-state="cpu-absent" x="${tx(gap.start) + 1}" y="${top + BAR_TOP}" width="${w}" height="${BAR_HEIGHT}" rx="4" fill="url(#absent-hatch)" stroke="${THEME.border}"><title>CPU ${cpu.cpuId} removida: [${gap.start}, ${gap.end})</title></rect>`,
            );
        }
        for (const interval of cpu.off) {
            const end = interval.end;
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
    const markers = order
        .flatMap((lane) =>
            lane.markers.map((marker) => ({
                marker,
                top: laneTop.get(lane.id)!,
            })),
        )
        .sort((a, b) => a.marker.sequence - b.marker.sequence);
    for (const { marker, top } of markers) {
        out.push(
            markerShape(
                marker.kind,
                tx(marker.time) - MARKER / 2,
                top + MARKER_OFFSET + marker.level * MARKER_STEP,
                marker.description,
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
        if (item.key in MARKER_TEXT) {
            glyph = markerShape(
                item.key as MarkerKind,
                gx,
                gy + 1.5,
                MARKER_TEXT[item.key as MarkerKind].label,
            );
        } else if (item.key === 'running') {
            glyph = `<rect x="${gx}" y="${gy + 1.5}" width="12" height="12" rx="3" fill="${sampleColor}"/>`;
        } else if (item.key === 'suspended') {
            glyph = `<rect x="${gx + 0.5}" y="${gy + 2}" width="11" height="11" rx="3" fill="url(#suspended-hatch)" stroke="${THEME.border}"/>`;
        } else if (item.key === 'forced') {
            glyph = `<rect x="${gx + 0.75}" y="${gy + 2.25}" width="10.5" height="10.5" rx="3" fill="none" stroke="${sampleColor}" stroke-width="1.5"/><rect x="${gx + 1}" y="${gy + 9.5}" width="10" height="3" rx="1.5" fill="${THEME.warning}"/>`;
        } else if (item.key === 'cpu-absent') {
            glyph = `<rect x="${gx + 0.5}" y="${gy + 2}" width="15" height="11" rx="4" fill="url(#absent-hatch)" stroke="${THEME.border}"/>`;
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
