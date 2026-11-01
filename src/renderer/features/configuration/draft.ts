import { validateConfig, type ConfigIssue } from '../../../core/config';
import type { SystemConfig } from '../../../core/domain';

/**
 * Edits of the configuration being prepared (#36, FE-03, FE-11). Every edit
 * builds the candidate configuration and lets the core's `validateConfig`
 * accept or reject it, so limits and reasons are the core's (DEC-10); a
 * rejected edit returns the issues and the caller keeps the previous draft.
 */

/** System fields as typed; `algorithm` stays text so the core judges it. */
export interface SystemValues {
    readonly algorithm: string;
    readonly quantum: number;
    readonly cpuCount: number;
}

export type DraftResult =
    | { readonly ok: true; readonly config: SystemConfig }
    | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

export function applySystem(
    config: SystemConfig,
    values: SystemValues,
): DraftResult {
    return validateConfig({ ...config, ...values });
}
