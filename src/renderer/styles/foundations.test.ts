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

const SURFACES = [
    'color-bg-app',
    'color-bg-surface',
    'color-bg-raised',
    'color-bg-track',
    'color-bg-suspended',
];

// Values read from the Figma "Fundacoes" page (os-sim collection, dark mode).
const FIGMA_VALUES: Record<string, string> = {
    'color-bg-app': '#171a21',
    'color-bg-surface': '#21242e',
    'color-bg-raised': '#292b38',
    'color-bg-track': '#1c1f29',
    'color-bg-suspended': '#141419',
    'color-border-default': '#3d404f',
    'color-text-primary': '#edf0f5',
    'color-text-secondary': '#9ea3b2',
    'color-text-on-task': '#171a21',
    'color-accent-default': '#548cfa',
    'color-accent-subtle': '#1f2b45',
    'color-status-danger': '#e55454',
    'color-status-danger-subtle': '#342228',
    'color-status-warning': '#f2b840',
    'color-status-warning-subtle': '#36301f',
    'color-status-success': '#4dbd78',
    'color-status-success-subtle': '#1d3027',
    'spacing-2xs': '4px',
    'spacing-xs': '8px',
    'spacing-sm': '12px',
    'spacing-md': '14px',
    'spacing-lg': '16px',
    'spacing-xl': '20px',
    'radius-xs': '3px',
    'radius-sm': '4px',
    'radius-md': '6px',
    'radius-lg': '8px',
    'radius-xl': '12px',
};

const FIGMA_FONTS: Record<string, [weight: number, size: number]> = {
    'font-heading-lg': [600, 15],
    'font-heading-md': [600, 14],
    'font-heading-sm': [600, 13],
    'font-label-md': [500, 13],
    'font-label-sm': [500, 12],
    'font-label-xs': [500, 10],
    'font-body-md': [400, 12],
    'font-body-sm': [400, 11],
    'font-body-xs': [400, 10],
    'font-badge-md': [700, 10],
    'font-badge-sm': [700, 9],
};

describe('visual foundation tokens', () => {
    it('keep the values of the Figma foundations', () => {
        for (const [name, value] of Object.entries(FIGMA_VALUES)) {
            expect(tokens.get(name), `--${name}`).toBe(value);
        }
        for (const [name, [weight, size]] of Object.entries(FIGMA_FONTS)) {
            expect(tokens.get(name), `--${name}`).toBe(
                `${weight} ${size}px/normal var(--font-family-sans)`,
            );
        }
    });

    it('hold no task colors or fixed palette, since they are input data', () => {
        for (const name of tokens.keys()) {
            expect(name).not.toMatch(/^color-task|palette|cycle/);
        }
    });

    it('keep text at 4.5:1 on every surface', () => {
        for (const text of [
            'color-text-primary',
            'color-text-secondary',
            'color-accent-text',
            'color-status-danger-text',
            'color-status-success',
            'color-status-warning',
        ]) {
            for (const surface of SURFACES) {
                expect(
                    contrast(color(text), color(surface)),
                    `${text} on ${surface}`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('keep tinted feedback text at 4.5:1 on its subtle fill', () => {
        const pairs: [string, string][] = [
            ['color-accent-text', 'color-accent-subtle'],
            ['color-status-danger-text', 'color-status-danger-subtle'],
            ['color-status-warning', 'color-status-warning-subtle'],
            ['color-status-success', 'color-status-success-subtle'],
        ];
        for (const [foreground, background] of pairs) {
            expect(
                contrast(color(foreground), color(background)),
                `${foreground} on ${background}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keep text on filled accent and danger at 4.5:1', () => {
        for (const fill of ['color-accent-default', 'color-status-danger']) {
            expect(
                contrast(color('color-text-on-color'), color(fill)),
                `on-color on ${fill}`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keep text on the Figma sample task colors at 4.5:1', () => {
        // Samples only; real task colors come from the configuration.
        for (const sample of ['#669efa', '#f28c59', '#8ccc73', '#c780e5']) {
            expect(
                contrast(color('color-text-on-task'), sample),
                sample,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keep the focus ring at 3:1 on every surface', () => {
        for (const surface of SURFACES) {
            expect(
                contrast(color('color-focus-ring'), color(surface)),
                surface,
            ).toBeGreaterThanOrEqual(3);
        }
    });

    it('give essential text styles at least 12px', () => {
        // 9 to 11px styles stay for auxiliary text only; they are not essential.
        for (const name of [
            'font-heading-lg',
            'font-heading-md',
            'font-heading-sm',
            'font-label-md',
            'font-label-sm',
            'font-body-md',
        ]) {
            expect(
                Number(tokens.get(name)!.match(/(\d+)px/)![1]),
                name,
            ).toBeGreaterThanOrEqual(12);
        }
    });
});

describe('global styles', () => {
    it('take every color and size from tokens', () => {
        expect(baseCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|\d+px/i);
        expect(baseCss).toContain('var(--color-bg-app)');
        expect(baseCss).toContain('var(--font-body-md)');
    });

    it('load the bundled font without any external service', () => {
        expect(indexCss).toContain("@import '@fontsource-variable/inter");
        for (const css of [indexCss, tokensCss, baseCss]) {
            expect(css).not.toMatch(/https?:|\/\//);
        }
        expect(tokens.get('font-family-sans')).toMatch(/^'Inter Variable',/);
    });
});
