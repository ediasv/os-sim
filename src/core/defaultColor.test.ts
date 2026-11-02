import { describe, expect, it } from 'vitest';
import { defaultTaskColor } from './defaultColor';

describe('defaultTaskColor (DEC-46)', () => {
    it('returns six uppercase hexadecimal digits', () => {
        for (let id = 1; id <= 50; id++) {
            expect(defaultTaskColor(String(id), new Set())).toMatch(
                /^[0-9A-F]{6}$/,
            );
        }
    });

    it('is deterministic, so replaying an edit gives the same color', () => {
        expect(defaultTaskColor('7', new Set())).toBe(
            defaultTaskColor('7', new Set()),
        );
    });

    it('looks different for different IDs', () => {
        const colors = new Set(
            Array.from({ length: 30 }, (_, i) =>
                defaultTaskColor(String(i + 1), new Set()),
            ),
        );
        expect(colors.size).toBeGreaterThan(25);
    });

    it('never returns a color already used, in any letter case', () => {
        const first = defaultTaskColor('3', new Set());
        const second = defaultTaskColor('3', new Set([first]));
        expect(second).not.toBe(first);
        expect(second).toMatch(/^[0-9A-F]{6}$/);
        const third = defaultTaskColor('3', new Set([first, second]));
        expect([first, second]).not.toContain(third);
    });
});
