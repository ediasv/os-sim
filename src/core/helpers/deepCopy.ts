/**
 * Recursive copy for the plain data of the domain (objects, arrays and
 * primitives), with nothing frozen. Gives the transactional tick a working
 * copy it can mutate and discard on failure (DEC-14). Written by hand for the
 * same reason as `freezeCopy`: `structuredClone` is not declared in the core.
 * Frozen values (the validated configuration) are returned as they are:
 * nothing may mutate them, so sharing is safe and cheaper than copying them
 * on every tick, and they keep their runtime guard.
 */
export function deepCopy<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Object.isFrozen(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(deepCopy) as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        copy[key] = deepCopy(field);
    }
    return copy as T;
}
