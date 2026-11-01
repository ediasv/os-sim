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
