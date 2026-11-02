import { summarizeCpuOff } from '../core/cpuOff';
import type { DeepReadonly, SimulationSnapshot } from '../core/domain';
import { findEligibleJobs } from '../core/eligibility';

/**
 * The core queries the panels share, memoized per snapshot. Snapshots are
 * immutable once published (DEC-23), so the object itself is a safe key: each
 * panel projects the same snapshot on every tick, and stepping back to a
 * recorded step hands over the same object again. The core stays the only
 * place that decides eligibility and CPU-off intervals; this only avoids
 * asking twice. A `WeakMap` does not keep discarded snapshots alive.
 */
type Snapshot = DeepReadonly<SimulationSnapshot>;

function memoize<R>(query: (snapshot: Snapshot) => R) {
    const cache = new WeakMap<Snapshot, R>();
    return (snapshot: Snapshot): R => {
        let result = cache.get(snapshot);
        if (result === undefined) {
            result = query(snapshot);
            cache.set(snapshot, result);
        }
        return result;
    };
}

export const eligibleJobs = memoize(findEligibleJobs);
export const cpuOffSummary = memoize(summarizeCpuOff);
