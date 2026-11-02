/**
 * Task color helpers shared by the on-screen Gantt and the exported SVG.
 * Task colors are input data (REQ-06), so they are used as given and only the
 * text drawn over them adapts (FE-DEC-10).
 */

/** Config colors are validated hex; anything else would only break the file. */
export function taskFill(color: string): string {
    return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : '#888888';
}

/** Black or white, whichever contrasts more with the task color (FE-DEC-10). */
export function textOn(color: string): string {
    const hex = taskFill(color).slice(1);
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
