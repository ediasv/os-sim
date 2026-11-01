/**
 * Default color of an included task that came without one (DEC-46). It looks
 * random but is a pure function of the task ID: every edit recomputes its
 * tick from the previous snapshot, so a color from `Math.random` would change
 * each time the tick is edited again and the snapshot would stop depending
 * only on the previous one and the requested end state (DEC-37 item 2).
 */

/** Small seeded generator (mulberry32); the seed is the task ID. */
function generator(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Hue in degrees at a fixed saturation and lightness, so every color is legible on the Gantt. */
function hslToHex(hue: number): string {
    const s = 0.65;
    const l = 0.55;
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
        const k = (n + hue / 30) % 12;
        const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255)
            .toString(16)
            .padStart(2, '0');
    };
    return `${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

/**
 * First color of the ID's sequence that is not in `used` (uppercase hex
 * digits, as `validateConfig` normalizes them). The sequence never ends
 * before finding one, because there are far more colors than tasks.
 */
export function defaultTaskColor(
    taskId: number,
    used: ReadonlySet<string>,
): string {
    const next = generator(taskId);
    for (;;) {
        const color = hslToHex(next() * 360);
        if (!used.has(color)) return color;
    }
}
