import { requireValidConfig } from './config';
import type { SystemConfig } from './domain';
import { DEFAULT_POLICIES, type PolicyRegistry } from './policies';
import { Simulator } from './simulator';

/**
 * Builds a Simulator that runs the policy registered for the configured
 * `algorithm`. This is the production path from the configuration to the
 * policy (A.4.1, DEC-25): the Simulator itself never reads the algorithm name
 * (DEC-01), so engine tests can still inject a test policy directly.
 *
 * An invalid configuration is reported as a `ConfigValidationError` even when
 * its algorithm has no policy, keeping the user-fixable error ahead of the
 * registry one (DEC-15, DEC-24). That branch validates through
 * `requireValidConfig`, the same function the Simulator constructor uses
 * (DEC-28).
 */
export function createSimulator(
    config: SystemConfig,
    policies: PolicyRegistry = DEFAULT_POLICIES,
): Simulator {
    if (!Object.hasOwn(policies, config.algorithm)) {
        requireValidConfig(config);
        throw new TypeError(
            `No scheduling policy is registered for algorithm ${config.algorithm}.`,
        );
    }
    return new Simulator(config, policies[config.algorithm]);
}
