/**
 * Recursive copy for the plain data of the domain (objects, arrays and
 * primitives), frozen at every level. Used for snapshots and the policy view
 * (DEC-12, DEC-13). Written by hand because the core targets ES2023 without
 * DOM or Node typings, where `structuredClone` is not declared.
 */
export function freezeCopy<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return Object.freeze(value.map(freezeCopy)) as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        copy[key] = freezeCopy(field);
    }
    return Object.freeze(copy) as T;
}
