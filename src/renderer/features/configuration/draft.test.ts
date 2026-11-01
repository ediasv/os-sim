import { describe, expect, it } from 'vitest';
import type { SystemConfig } from '../../../core/domain';
import { DEFAULT_CONFIG } from '../../../core/domain';
import { applySystem } from './draft';

describe('applySystem', () => {
    it('replaces algorithm, quantum and CPUs and keeps the tasks', () => {
        const base: SystemConfig = {
            ...DEFAULT_CONFIG,
            tasks: [
                {
                    id: 1,
                    color: 'AAAAAA',
                    arrival: 0,
                    duration: 2,
                    period: 10,
                    deadline: 10,
                    rawEvents: '',
                },
            ],
        };

        const result = applySystem(base, {
            algorithm: 'edf',
            quantum: 3,
            cpuCount: 4,
        });

        expect(result).toMatchObject({
            ok: true,
            config: { algorithm: 'EDF', quantum: 3, cpuCount: 4 },
        });
        expect(result.ok && result.config.tasks).toEqual(base.tasks);
    });

    it('returns the core reasons for invalid values and builds no config', () => {
        const result = applySystem(DEFAULT_CONFIG, {
            algorithm: 'RM',
            quantum: 0,
            cpuCount: 1.5,
        });

        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues.map((i) => i.field)).toEqual([
            'quantum',
            'cpuCount',
        ]);
        expect(!result.ok && result.issues[0].message).toContain('quantum');
    });
});
