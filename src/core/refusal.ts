import { freezeCopy } from './helpers/freezeCopy';

/**
 * A request the simulation cannot honour in its current state, such as going
 * back from step 0 (REQ-10, DEC-36). It is thrown before anything changes, so
 * state, cursor and history stay as they were. Unlike other errors it is not
 * a bug: the interface shows its message where the user acted, not on the
 * error banner (DEC-24).
 */
export class SimulationRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SimulationRefusal';
    }
}

/** Why one item of an edit was refused; `index` is its 0-based position. */
export interface EditItemRefusal {
    readonly index: number;
    readonly kind: string;
    readonly reason: string;
}

/**
 * Refusal of a whole edit because at least one item was refused: nothing of
 * it is applied (REQ-05, DEC-37 item 4). Lists every refused item with its
 * reason, one line each, numbered from 1 as the user counts them (DEC-39).
 * A `SimulationRefusal`, so the interface treats it like the others.
 */
export class EditRefusal extends SimulationRefusal {
    readonly items: readonly EditItemRefusal[];

    constructor(items: readonly EditItemRefusal[]) {
        super(
            items
                .map(
                    (item) =>
                        `Item ${item.index + 1} (${item.kind}): ${item.reason}`,
                )
                .join('\n'),
        );
        this.name = 'EditRefusal';
        this.items = freezeCopy(items);
    }
}
