<script setup lang="ts">
import { computed } from 'vue';
import type { DeepReadonly, SimulationSnapshot } from '../../../core/domain';
import { taskFill, textOn } from './colors';
import GanttMarkerGlyph from './GanttMarkerGlyph.vue';
import {
    buildGanttModel,
    LEGEND_MARKERS,
    MARKER_TEXT,
    type ExtraLegendItem,
} from './ganttModel';
import {
    BAR_HEIGHT,
    BAR_TOP,
    FORCED_STRIP,
    LABEL_WIDTH,
    LANE_HEIGHT,
    laneHeight,
    MARKER,
    MARKER_OFFSET,
    MARKER_STEP,
    TICK,
    textWidth,
} from './geometry';

// The on-screen Gantt (#38, FE-17, DEC-08). It draws the same model as the
// exported SVG (`buildGanttModel`), so tela and arquivo cannot disagree about
// the data; only the drawing differs. It receives the newest recorded snapshot,
// not the one at the history cursor, so stepping back keeps the future visible
// (FE-06); `cursor` only places the current-instant line.
const props = withDefaults(
    defineProps<{
        snapshot: DeepReadonly<SimulationSnapshot>;
        /** Tick shown by the history cursor. */
        cursor: number;
        /** Zoom factor on the 73 px tick; 1 is 100%. */
        scale?: number;
    }>(),
    { scale: 1 },
);

const model = computed(() => buildGanttModel(props.snapshot));
const unit = computed(() => TICK * props.scale);
const canvasWidth = computed(() => model.value.ticks * unit.value);
const x = (time: number): number => time * unit.value;
const gridStyle = computed(() => ({
    width: `${canvasWidth.value}px`,
    backgroundSize: `${unit.value}px 100%`,
}));

/** The longest label that fits the bar; the title carries the rest. */
function barLabel(
    cpuId: number,
    jobIndex: number,
    width: number,
): string | null {
    const full = `CPU ${cpuId} · #${jobIndex + 1}`;
    const short = `CPU ${cpuId}`;
    return (
        [full, short].find((text) => textWidth(text, 9) * 1.15 + 12 <= width) ??
        null
    );
}

const EXTRA_TEXT: Readonly<Record<ExtraLegendItem, string>> = {
    suspended: 'Suspensa (hachura escura)',
    forced: 'Forçada',
    'cpu-absent': 'CPU removida',
    'task-terminated': MARKER_TEXT['task-terminated'].legend,
};
</script>

<template>
    <div class="gantt-chart">
        <!-- Shared patterns; rows reference them by id. -->
        <svg class="gantt-chart__defs" width="0" height="0" aria-hidden="true">
            <defs>
                <pattern
                    id="gantt-suspended-hatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                >
                    <rect class="hatch__ground" width="6" height="6" />
                    <rect class="hatch__line" width="2" height="6" />
                </pattern>
                <pattern
                    id="gantt-absent-hatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                >
                    <rect class="hatch__thin" width="1" height="6" />
                </pattern>
            </defs>
        </svg>

        <div class="gantt-chart__scroll">
            <div
                class="gantt-chart__grid"
                :style="{ width: `${LABEL_WIDTH + canvasWidth}px` }"
            >
                <div class="gantt-chart__row gantt-chart__row--axis">
                    <div class="gantt-chart__label" />
                    <svg :width="canvasWidth" :height="24" aria-hidden="true">
                        <text
                            v-for="tick in model.ticks"
                            :key="tick"
                            data-tick
                            class="gantt-chart__tick"
                            :x="x(tick - 1) + unit / 2"
                            y="16"
                            text-anchor="middle"
                        >
                            {{ tick - 1 }}
                        </text>
                    </svg>
                </div>

                <div
                    v-for="lane in model.taskLanes"
                    :key="lane.id"
                    class="gantt-chart__row"
                    :data-task="lane.id"
                    :style="{ height: `${laneHeight(lane.depth)}px` }"
                >
                    <div
                        class="gantt-chart__label"
                        :title="`Tarefa ${lane.id}`"
                    >
                        <span
                            class="gantt-chart__chip"
                            :style="{ background: taskFill(lane.color) }"
                        />
                        <span class="gantt-chart__name"
                            >Tarefa {{ lane.id }}</span
                        >
                    </div>
                    <div class="gantt-chart__canvas" :style="gridStyle">
                        <svg
                            :width="canvasWidth"
                            :height="laneHeight(lane.depth)"
                        >
                            <rect
                                class="gantt-chart__track"
                                x="0"
                                :y="BAR_TOP"
                                :width="canvasWidth"
                                :height="BAR_HEIGHT"
                                rx="4"
                            />
                            <rect
                                v-for="span in lane.ready"
                                :key="`r${span.job.index}-${span.start}`"
                                data-state="ready"
                                :data-job="span.job.index"
                                class="gantt-chart__ready"
                                :x="x(span.start) + 1.75"
                                :y="BAR_TOP + 0.75"
                                :width="(span.end - span.start) * unit - 3.5"
                                :height="BAR_HEIGHT - 1.5"
                                rx="4"
                                :stroke="taskFill(lane.color)"
                            >
                                <title>
                                    Pronta: tarefa {{ lane.id }} #{{
                                        span.job.index + 1
                                    }}, [{{ span.start }}, {{ span.end }})
                                </title>
                            </rect>
                            <rect
                                v-for="span in lane.suspended"
                                :key="`s${span.start}`"
                                data-state="suspended"
                                class="gantt-chart__suspended"
                                :x="x(span.start) + 1"
                                :y="BAR_TOP"
                                :width="(span.end - span.start) * unit - 2"
                                :height="BAR_HEIGHT"
                                rx="4"
                            >
                                <title>
                                    Suspensa: tarefa {{ lane.id }}, [{{
                                        span.start
                                    }}, {{ span.end }})
                                </title>
                            </rect>
                            <g
                                v-for="slice in lane.running"
                                :key="`x${slice.start}-${slice.cpuId}`"
                                data-state="running"
                            >
                                <rect
                                    :x="x(slice.start) + 1"
                                    :y="BAR_TOP"
                                    :width="
                                        (slice.end - slice.start) * unit - 2
                                    "
                                    :height="BAR_HEIGHT"
                                    rx="4"
                                    :fill="taskFill(lane.color)"
                                >
                                    <title>
                                        Execução: tarefa {{ lane.id }} #{{
                                            slice.job.index + 1
                                        }}
                                        na CPU {{ slice.cpuId }}, [{{
                                            slice.start
                                        }}, {{ slice.end }})
                                    </title>
                                </rect>
                                <svg
                                    v-if="
                                        barLabel(
                                            slice.cpuId,
                                            slice.job.index,
                                            (slice.end - slice.start) * unit -
                                                2,
                                        ) !== null
                                    "
                                    :x="x(slice.start) + 1"
                                    :y="BAR_TOP"
                                    :width="
                                        (slice.end - slice.start) * unit - 2
                                    "
                                    :height="BAR_HEIGHT"
                                >
                                    <text
                                        class="gantt-chart__bar-text"
                                        x="6"
                                        y="18"
                                        :fill="textOn(lane.color)"
                                    >
                                        {{
                                            barLabel(
                                                slice.cpuId,
                                                slice.job.index,
                                                (slice.end - slice.start) *
                                                    unit -
                                                    2,
                                            )
                                        }}
                                    </text>
                                </svg>
                            </g>
                            <rect
                                v-for="span in lane.forced"
                                :key="`f${span.start}`"
                                data-state="forced"
                                class="gantt-chart__forced"
                                :x="x(span.start) + 1"
                                :y="BAR_TOP + BAR_HEIGHT - FORCED_STRIP"
                                :width="(span.end - span.start) * unit - 2"
                                :height="FORCED_STRIP"
                                rx="2"
                            >
                                <title>
                                    Forçada: tarefa {{ lane.id }}, [{{
                                        span.start
                                    }}, {{ span.end }})
                                </title>
                            </rect>
                            <line
                                data-current
                                class="gantt-chart__current"
                                :x1="x(cursor)"
                                :x2="x(cursor)"
                                y1="0"
                                :y2="laneHeight(lane.depth)"
                            />
                            <g
                                v-for="marker in lane.markers"
                                :key="marker.sequence"
                                :data-event="marker.kind"
                                :transform="`translate(${x(marker.time) - MARKER / 2} ${MARKER_OFFSET + marker.level * MARKER_STEP})`"
                            >
                                <title>{{ marker.description }}</title>
                                <GanttMarkerGlyph :kind="marker.kind" />
                            </g>
                        </svg>
                    </div>
                </div>

                <div class="gantt-chart__divider">
                    <span>PROCESSADORES</span>
                </div>

                <div
                    v-for="cpu in model.cpuLanes"
                    :key="cpu.cpuId"
                    class="gantt-chart__row"
                    :data-cpu="cpu.cpuId"
                    :style="{ height: `${LANE_HEIGHT}px` }"
                >
                    <div class="gantt-chart__label gantt-chart__label--cpu">
                        <span class="gantt-chart__name"
                            >CPU {{ cpu.cpuId }}</span
                        >
                    </div>
                    <div class="gantt-chart__canvas" :style="gridStyle">
                        <svg :width="canvasWidth" :height="LANE_HEIGHT">
                            <rect
                                class="gantt-chart__track"
                                x="0"
                                :y="BAR_TOP"
                                :width="canvasWidth"
                                :height="BAR_HEIGHT"
                                rx="4"
                            />
                            <rect
                                v-for="gap in cpu.absent"
                                :key="`a${gap.start}`"
                                data-state="cpu-absent"
                                class="gantt-chart__absent"
                                :x="x(gap.start) + 1"
                                :y="BAR_TOP"
                                :width="(gap.end - gap.start) * unit - 2"
                                :height="BAR_HEIGHT"
                                rx="4"
                            >
                                <title>
                                    CPU {{ cpu.cpuId }} removida: [{{
                                        gap.start
                                    }}, {{ gap.end }})
                                </title>
                            </rect>
                            <g
                                v-for="interval in cpu.off"
                                :key="`o${interval.start}`"
                                data-state="cpu-off"
                            >
                                <rect
                                    class="gantt-chart__off"
                                    :x="x(interval.start) + 1.75"
                                    :y="BAR_TOP + 0.75"
                                    :width="
                                        (interval.end - interval.start) * unit -
                                        3.5
                                    "
                                    :height="BAR_HEIGHT - 1.5"
                                    rx="4"
                                >
                                    <title>
                                        CPU {{ cpu.cpuId }} desligada: [{{
                                            interval.start
                                        }}, {{ interval.end }})
                                    </title>
                                </rect>
                                <svg
                                    :x="x(interval.start) + 1"
                                    :y="BAR_TOP"
                                    :width="
                                        (interval.end - interval.start) * unit -
                                        2
                                    "
                                    :height="BAR_HEIGHT"
                                >
                                    <text
                                        class="gantt-chart__bar-text gantt-chart__bar-text--muted"
                                        x="6"
                                        y="18"
                                    >
                                        Desligada
                                    </text>
                                </svg>
                            </g>
                            <line
                                data-current
                                class="gantt-chart__current"
                                :x1="x(cursor)"
                                :x2="x(cursor)"
                                y1="0"
                                :y2="LANE_HEIGHT"
                            />
                        </svg>
                    </div>
                </div>
            </div>
        </div>

        <ul class="gantt-chart__legend" aria-label="Legenda">
            <li>
                <span class="swatch swatch--running" />Executando (cor da
                tarefa)
            </li>
            <li>
                <span class="swatch swatch--ready" />Pronto (contorno tracejado)
            </li>
            <li v-for="kind in LEGEND_MARKERS" :key="kind">
                <svg width="12" height="12" aria-hidden="true">
                    <GanttMarkerGlyph :kind="kind" />
                </svg>
                {{ MARKER_TEXT[kind].legend }}
            </li>
            <li><span class="swatch swatch--off" />CPU desligada</li>
            <li><span class="swatch swatch--current" />Instante atual</li>
            <li v-for="item in model.extraLegend" :key="item">
                <svg
                    v-if="item === 'task-terminated'"
                    width="12"
                    height="12"
                    aria-hidden="true"
                >
                    <GanttMarkerGlyph kind="task-terminated" />
                </svg>
                <span v-else :class="['swatch', `swatch--${item}`]" />
                {{ EXTRA_TEXT[item] }}
            </li>
        </ul>
    </div>
</template>

<style scoped>
.gantt-chart {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--spacing-sm);
    min-width: 0;
    min-height: 0;
}

.gantt-chart__defs {
    position: absolute;
}

.hatch__ground {
    fill: var(--color-bg-suspended);
}

.hatch__line {
    fill: var(--color-text-secondary);
}

.hatch__thin {
    fill: var(--color-border-default);
}

/* Horizontal scroll only for the time axis; labels stay in view. */
.gantt-chart__scroll {
    overflow: auto;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xl);
    background: var(--color-bg-surface);
    padding: var(--spacing-lg);
}

.gantt-chart__row {
    display: flex;
}

.gantt-chart__label {
    position: sticky;
    left: 0;
    z-index: 1;
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    width: 90px;
    box-sizing: border-box;
    padding-right: 6px;
    background: var(--color-bg-surface);
    font: var(--font-label-sm);
    color: var(--color-text-primary);
}

.gantt-chart__label--cpu {
    color: var(--color-text-secondary);
}

.gantt-chart__chip {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: var(--radius-xs);
}

.gantt-chart__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.gantt-chart__canvas {
    flex: none;
    background-image: linear-gradient(
        to right,
        var(--color-border-default) 1px,
        transparent 1px
    );
    background-repeat: repeat-x;
}

.gantt-chart__canvas svg,
.gantt-chart__row--axis svg {
    display: block;
}

/*
 * Markers sit on tick boundaries, so those at t = 0 and at the last tick are
 * half outside the lane; only the lane SVG overflows, the nested text SVGs
 * keep clipping to their bar.
 */
.gantt-chart__canvas > svg {
    overflow: visible;
}

.gantt-chart__tick {
    font: var(--font-label-xs);
    fill: var(--color-text-secondary);
}

.gantt-chart__track {
    fill: var(--color-bg-track);
}

.gantt-chart__ready {
    fill: none;
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
}

.gantt-chart__suspended {
    fill: url(#gantt-suspended-hatch);
    stroke: var(--color-border-default);
}

.gantt-chart__forced {
    fill: var(--color-status-warning);
}

.gantt-chart__absent {
    fill: url(#gantt-absent-hatch);
    stroke: var(--color-border-default);
}

.gantt-chart__off {
    fill: var(--color-bg-raised);
    stroke: var(--color-border-default);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
}

.gantt-chart__bar-text {
    font: var(--font-badge-sm);
}

.gantt-chart__bar-text--muted {
    fill: var(--color-text-secondary);
}

.gantt-chart__current {
    stroke: var(--color-accent-default);
    stroke-width: 1.5;
    pointer-events: none;
}

.gantt-chart__divider {
    display: flex;
    align-items: center;
    height: 28px;
    font: var(--font-label-xs);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-default);
    position: sticky;
    left: 0;
}

.gantt-chart__legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs) var(--spacing-lg);
    margin: 0;
    padding: var(--spacing-sm) var(--spacing-lg);
    list-style: none;
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-xl);
    background: var(--color-bg-surface);
    font: var(--font-body-md);
    color: var(--color-text-secondary);
}

.gantt-chart__legend li {
    display: flex;
    align-items: center;
    gap: 8px;
}

.swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    box-sizing: border-box;
    border-radius: var(--radius-xs);
}

.swatch--running {
    background: var(--color-accent-default);
}

.swatch--ready {
    border: 1.5px dashed var(--color-accent-default);
}

.swatch--off {
    width: 16px;
    border: 1.5px dashed var(--color-border-default);
    background: var(--color-bg-raised);
}

.swatch--current {
    width: 2px;
    height: 14px;
    border-radius: 0;
    background: var(--color-accent-default);
}

.swatch--suspended {
    border: 1px solid var(--color-border-default);
    background: repeating-linear-gradient(
        45deg,
        var(--color-bg-suspended) 0 2px,
        var(--color-text-secondary) 2px 4px
    );
}

.swatch--forced {
    border-bottom: 3px solid var(--color-status-warning);
    background: var(--color-bg-track);
}

.swatch--cpu-absent {
    width: 16px;
    border: 1px solid var(--color-border-default);
    background: repeating-linear-gradient(
        45deg,
        transparent 0 3px,
        var(--color-border-default) 3px 4px
    );
}
</style>
