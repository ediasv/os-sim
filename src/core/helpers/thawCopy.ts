/**
 * Recursive copy of plain data (objects, arrays and primitives) with nothing
 * frozen: the inverse of `freezeCopy`. Restoring a snapshot (DEC-35) needs a
 * live state that the engine can mutate without touching the frozen history.
 * Written by hand for the same reason as `freezeCopy`.
 */
export function thawCopy<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(thawCopy) as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        copy[key] = thawCopy(field);
    }
    return copy as T;
}
