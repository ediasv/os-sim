/**
 * Reads a numeric field as the core must judge it: a blank field is `NaN`
 * (never silently zero), anything else goes through `Number`, so "1.5" and
 * "abc" reach `validateConfig`, which says what is wrong with them.
 */
export function toNumber(text: string): number {
    const trimmed = text.trim();
    return trimmed === '' ? NaN : Number(trimmed);
}
