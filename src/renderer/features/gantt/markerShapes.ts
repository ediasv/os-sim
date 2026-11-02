/**
 * Geometry of the event markers, drawn in a 12 x 12 box (the exported assets
 * of the Figma markers). Kept as data, without colors, so the exported SVG
 * (literal colors, standalone file) and the on-screen chart (theme tokens)
 * draw the same shapes and cannot drift apart (FE-17).
 */
import type { MarkerKind } from './ganttModel';

/** Theme color of a part; each renderer maps it to its own value. */
export type Paint = 'text' | 'success' | 'danger' | 'warning' | 'accent';

export interface ShapePart {
    readonly tag: 'path' | 'circle' | 'rect';
    /** Geometry attributes, in the order they are written. */
    readonly attrs: Readonly<Record<string, string | number>>;
    readonly paint: Paint;
    /**
     * `fill`: solid shape. `outline`: stroked shape with no fill. `line`:
     * stroked open path.
     */
    readonly mode: 'fill' | 'outline' | 'line';
    readonly strokeWidth?: number;
}

export const MARKER_SHAPES: Readonly<Record<MarkerKind, readonly ShapePart[]>> =
    {
        activation: [
            {
                tag: 'path',
                attrs: { d: 'M6 0.5L11.1962 8.75H0.803848L6 0.5Z' },
                paint: 'text',
                mode: 'fill',
            },
        ],
        completion: [
            {
                tag: 'circle',
                attrs: { cx: 6, cy: 6, r: 5 },
                paint: 'success',
                mode: 'fill',
            },
        ],
        'deadline-miss': [
            {
                tag: 'path',
                attrs: { d: 'M6 0L12 6L6 12L0 6L6 0Z' },
                paint: 'danger',
                mode: 'fill',
            },
        ],
        'tie-break': [
            {
                tag: 'path',
                attrs: {
                    d: 'M6 0L7.58702 3.81565L11.7063 4.1459L8.56785 6.83435L9.52671 10.8541L6 8.7L2.47329 10.8541L3.43215 6.83435L0.293661 4.1459L4.41298 3.81565L6 0Z',
                },
                paint: 'warning',
                mode: 'fill',
            },
        ],
        preemption: [
            {
                tag: 'path',
                attrs: { d: 'M6 11L0.803848 2.75L11.1962 2.75L6 11Z' },
                paint: 'accent',
                mode: 'fill',
            },
        ],
        'quantum-expired': [
            {
                tag: 'circle',
                attrs: { cx: 6, cy: 6, r: 4.5 },
                paint: 'text',
                mode: 'outline',
                strokeWidth: 2,
            },
        ],
        'task-finished': [
            {
                tag: 'rect',
                attrs: { x: 1, y: 1, width: 10, height: 10, rx: 1 },
                paint: 'success',
                mode: 'fill',
            },
        ],
        // A hollow square with a slash: the end of a task cut short, apart
        // from the solid square of a natural end.
        'task-terminated': [
            {
                tag: 'path',
                attrs: { d: 'M1 1H11V11H1Z' },
                paint: 'success',
                mode: 'outline',
                strokeWidth: 2,
            },
            {
                tag: 'path',
                attrs: { d: 'M3 9L9 3' },
                paint: 'success',
                mode: 'line',
                strokeWidth: 2,
            },
        ],
    };
