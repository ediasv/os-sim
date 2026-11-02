/**
 * Lane geometry shared by the on-screen Gantt and the exported SVG (#38, #39),
 * in pixels at 100% zoom. The values are those of the Figma components:
 * a 73 px tick, 44 px lanes holding a 28 px bar (DEC-08, FE-DEC-12).
 */

/** Width of one tick cell at 100%. */
export const TICK = 73;
/** Label column of a lane (task or CPU name). */
export const LABEL_WIDTH = 90;
export const LANE_HEIGHT = 44;
/** Top of the bar inside a lane. */
export const BAR_TOP = 8;
export const BAR_HEIGHT = 28;
/** Side of the 12 x 12 box every marker shape is drawn in. */
export const MARKER = 12;
/** Vertical step between markers that share a lane and an instant (FE-17). */
export const MARKER_STEP = 13;
/** Distance from the lane top to the top of the first marker. */
export const MARKER_OFFSET = 34;
/** Height of the strip that marks a forced segment along the bar's foot. */
export const FORCED_STRIP = 4;

/** A lane grows to hold its deepest marker stack instead of overlapping. */
export const laneHeight = (depth: number): number =>
    LANE_HEIGHT + (depth - 1) * MARKER_STEP;

/** Estimated advance of Inter text; viewers without the font differ a little. */
export const textWidth = (text: string, size: number): number =>
    text.length * size * 0.55;
