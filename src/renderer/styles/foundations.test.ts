import { describe, expect, it } from 'vitest';
import baseCss from './base.css?raw';
import indexCss from '../index.css?raw';
import tokensCss from './tokens.css?raw';

/** Reads `--name: value;` declarations, ignoring comments. */
function parseTokens(css: string): Map<string, string> {
    const tokens = new Map<string, string>();
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, name, value] of source.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
        tokens.set(name!, value!.replace(/\s+/g, ' ').trim());
    }
    return tokens;
}

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((start) => {
        const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
        return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light! + 0.05) / (dark! + 0.05);
}

const tokens = parseTokens(tokensCss);

function color(name: string): string {
    const value = tokens.get(name);
    expect(value, `--${name} must exist`).toMatch(/^#[0-9a-f]{6}$/);
    return value!;
}

describe('visual foundation tokens', () => {
    it('defines the names referenced by the Figma foundations', () => {
        for (const name of [
            'color-bg-app',
            'color-text-primary',
            'spacing-xs',
        ]) {
            expect(tokens.has(name), `--${name}`).toBe(true);
        }
    });

    it('keeps essential text at 4.5:1 on every surface', () => {
        const surfaces = [
            'color-bg-app',
            'color-bg-surface',
            'color-bg-surface-muted',
            'color-bg-hover',
        ];
        for (const text of [
            'color-text-primary',
            'color-text-secondary',
            'color-text-muted',
        ]) {
            for (const surface of surfaces) {
                expect(
                    contrast(color(text), color(surface)),
                    `${text} on ${surface}`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('keeps filled and tinted feedback text at 4.5:1', () => {
        const pairs: [string, string][] = [
            ['color-text-on-accent', 'color-accent'],
            ['color-text-on-accent', 'color-accent-hover'],
            ['color-text-on-accent', 'color-accent-active'],
            ['color-text-on-danger', 'color-danger'],
            ['color-text-on-danger', 'color-danger-hover'],
            ['color-accent', 'color-accent-subtle'],
            ['color-accent', 'color-bg-surface'],
            ['color-danger', 'color-danger-subtle'],
            ['color-danger', 'color-bg-surface'],
            ['color-warning', 'color-warning-subtle'],
            ['color-warning', 'color-bg-surface'],
            ['color-success', 'color-success-subtle'],
            ['color-success', 'color-bg-surface'],
        ];
        for (const [foreground, background] of pairs) {
            expect(
                contrast(color(foreground), color(background)),
                `${foreground} on ${background}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps control boundaries and the focus ring at 3:1', () => {
        for (const surface of [
            'color-bg-app',
            'color-bg-surface',
            'color-bg-surface-muted',
        ]) {
            for (const boundary of [
                'color-border-strong',
                'color-focus-ring',
            ]) {
                expect(
                    contrast(color(boundary), color(surface)),
                    `${boundary} on ${surface}`,
                ).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it('holds no task colors or fixed palette, since they are input data', () => {
        for (const name of tokens.keys()) {
            expect(name).not.toMatch(/task|series|palette/);
        }
    });

    it('keeps sizes of essential text at 12px or more', () => {
        for (const [name, value] of tokens) {
            if (name.startsWith('font-size-')) {
                expect(parseFloat(value) * 16, name).toBeGreaterThanOrEqual(12);
            }
        }
    });
});

describe('global styles', () => {
    it('take every color and size from tokens', () => {
        expect(baseCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\d+px/i);
        expect(baseCss).toContain('var(--color-bg-app)');
        expect(baseCss).toContain('var(--font-family-sans)');
    });

    it('load the bundled font without any external service', () => {
        expect(indexCss).toContain("@import '@fontsource-variable/inter");
        for (const css of [indexCss, tokensCss, baseCss]) {
            expect(css).not.toMatch(/https?:|\/\//);
        }
        expect(tokens.get('font-family-sans')).toMatch(/^'Inter Variable',/);
    });
});
