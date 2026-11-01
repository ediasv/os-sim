// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ruleBody } from '../testing/cssRule';
import SimulationToolbar from './SimulationToolbar.vue';
// Raw source: jsdom computes no layout, so the wrap rule is pinned in the text.
import source from './SimulationToolbar.vue?raw';
import type { WorkspaceAction } from './workspaceActions';

enableAutoUnmount(afterEach);

const baseProps = { clock: null, algorithm: 'RM', cpuCount: 1, quantum: 5 };

const labels = [
    'Carregar configuração',
    'Sistema',
    'Voltar tick',
    'Avançar tick',
    'Reiniciar',
    'Executar tudo',
];

function mountToolbar(
    available?: ReadonlySet<WorkspaceAction>,
    clock: number | null = null,
) {
    return mount(SimulationToolbar, {
        props: { ...baseProps, clock, ...(available ? { available } : {}) },
    });
}

function chipValue(wrapper: ReturnType<typeof mountToolbar>, label: string) {
    const chip = wrapper
        .findAll('dl > div')
        .find((c) => c.get('dt').text() === label);
    return chip?.get('dd').text();
}

describe('SimulationToolbar', () => {
    it('renders only "os-sim" as title', () => {
        const text = mountToolbar().get('header').text();

        expect(text).toContain('os-sim');
        expect(text).not.toContain('sem arquivo');
    });

    it('renders the six actions in Figma order', () => {
        const texts = mountToolbar()
            .findAll('button')
            .map((b) => b.text());

        expect(texts).toEqual(labels);
    });

    it('applies Figma variants', () => {
        const buttons = mountToolbar().findAll('button');
        const variants = [
            'accent',
            'accent',
            'secondary',
            'primary',
            'secondary',
            'secondary',
        ];

        variants.forEach((variant, i) =>
            expect(buttons[i].classes()).toContain(`ui-button--${variant}`),
        );
    });

    it('disables every action when none is available', async () => {
        const wrapper = mountToolbar();
        const buttons = wrapper.findAll('button');

        expect(buttons).toHaveLength(6);
        for (const button of buttons) {
            expect(button.attributes('disabled')).toBeDefined();
            await button.trigger('click');
        }
        expect(wrapper.emitted('action')).toBeUndefined();
    });

    it('emits the intent of an available action', async () => {
        const wrapper = mountToolbar(new Set(['step-forward']));
        const buttons = wrapper.findAll('button');

        for (const button of buttons) {
            await button.trigger('click');
        }

        expect(wrapper.emitted('action')).toEqual([['step-forward']]);
        expect(
            buttons
                .filter((b) => b.attributes('disabled') === undefined)
                .map((b) => b.text()),
        ).toEqual(['Avançar tick']);
    });

    it('shows "–" as tick before a snapshot exists', () => {
        expect(chipValue(mountToolbar(), 'Tick atual')).toBe('–');
        expect(chipValue(mountToolbar(undefined, 0), 'Tick atual')).toBe('0');
    });

    it('shows the given parameters', () => {
        const wrapper = mountToolbar();

        expect(chipValue(wrapper, 'Política')).toBe('RM');
        expect(chipValue(wrapper, 'CPUs')).toBe('1');
        expect(chipValue(wrapper, 'Quantum')).toBe('5');
    });

    it('wraps instead of overflowing', () => {
        expect(ruleBody(source, '.toolbar')).toMatch(/flex-wrap:\s*wrap\s*;/);
    });

    // Wrapped rows must not touch the window edge nor clip the focus ring.
    it('keeps vertical padding on the bar', () => {
        expect(ruleBody(source, '.toolbar')).toMatch(
            /padding-block:\s*var\(--spacing-sm\)\s*;/,
        );
    });
});
