/**
 * Rules for the task ID as free text (DEC-48): what is a valid ID, when two
 * IDs are the same, in which order IDs are shown and which ID the system
 * suggests for a new task. Kept in one module so the file, the validator, the
 * engine and the screens cannot disagree.
 */

/** Longest ID accepted, so labels still fit the Gantt and the event list (DEC-48). */
export const MAX_TASK_ID_LENGTH = 32;

export type TaskIdValidation =
    | { readonly ok: true; readonly id: string }
    | { readonly ok: false; readonly reason: string };

/**
 * Checks and normalizes the text of an ID: surrounding spaces are removed,
 * inner ones are kept. The returned `id` is what gets stored and shown.
 * `;` and line breaks are refused because they are the file's separators
 * (A.3.3). `__proto__` is refused because records keyed by task ID would
 * treat it as the prototype instead of a key.
 */
export function validateTaskId(text: string): TaskIdValidation {
    const id = text.trim();
    if (id === '') {
        return { ok: false, reason: 'o id não pode ficar vazio.' };
    }
    if (id.includes(';')) {
        return { ok: false, reason: 'o id não pode conter ";".' };
    }
    if (/[\r\n]/.test(id)) {
        return { ok: false, reason: 'o id não pode ter quebra de linha.' };
    }
    if (id.length > MAX_TASK_ID_LENGTH) {
        return {
            ok: false,
            reason: `o id pode ter no máximo ${MAX_TASK_ID_LENGTH} caracteres; recebidos ${id.length}.`,
        };
    }
    if (taskIdKey(id) === '__proto__') {
        return { ok: false, reason: 'o id "__proto__" é reservado.' };
    }
    return { ok: true, id };
}

/** Identity of an ID for uniqueness: case-insensitive, as A.3.3.2 treats strings. */
export function taskIdKey(id: string): string {
    return id.trim().toLowerCase();
}

const DIGITS_ONLY = /^[0-9]+$/;

/** Digit-only ID without leading zeros; comparing digit strings avoids precision loss on huge numbers. */
function numericValue(id: string): string {
    return id.replace(/^0+(?=[0-9])/, '');
}

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Natural order (DEC-48): digit-only IDs by numeric value, then the rest
 * alphabetically without case, numbers before text. Equal values (`1`, `01`)
 * or equal text (`a`, `A`) fall back to the exact text so the order is total.
 * For numeric IDs it is the order the simulator always had (A.2.5).
 */
export function compareTaskIds(a: string, b: string): number {
    const aNumeric = DIGITS_ONLY.test(a);
    const bNumeric = DIGITS_ONLY.test(b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    if (aNumeric) {
        const x = numericValue(a);
        const y = numericValue(b);
        return x.length - y.length || compareText(x, y) || compareText(a, b);
    }
    return compareText(a.toLowerCase(), b.toLowerCase()) || compareText(a, b);
}

/** `digits + 1` on a digit string. */
function increment(digits: string): string {
    const chars = digits.split('');
    for (let i = chars.length - 1; i >= 0; i--) {
        if (chars[i] === '9') {
            chars[i] = '0';
        } else {
            chars[i] = String(Number(chars[i]) + 1);
            return chars.join('');
        }
    }
    return `1${chars.join('')}`;
}

/**
 * The ID a new task is offered: the highest number ever used plus one, or
 * `1` when no number was used (DEC-48, DEC-37). `used` must contain every ID
 * ever used, including those of removed tasks, so none is reused.
 */
export function suggestTaskId(used: Iterable<string>): string {
    let highest = '0';
    for (const id of used) {
        if (!DIGITS_ONLY.test(id)) continue;
        const value = numericValue(id);
        if (compareTaskIds(value, highest) > 0) highest = value;
    }
    return increment(highest);
}
