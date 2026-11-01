// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useSimulation } from './composables/useSimulation';
import { createSimulator } from '../core/createSimulator';
import { DEFAULT_CONFIG } from '../core/domain';
import { Simulator } from '../core/simulator';

// Spies wrap the real exports so transitive imports keep working while any
// call (or construction) is still detected.
vi.mock('./composables/useSimulation', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('./composables/useSimulation')>();
    return { ...actual, useSimulation: vi.fn(actual.useSimulation) };
});
vi.mock('../core/createSimulator', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../core/createSimulator')>();
    return { ...actual, createSimulator: vi.fn(actual.createSimulator) };
});
vi.mock('../core/simulator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../core/simulator')>();
    class SpiedSimulator extends actual.Simulator {}
    return { ...actual, Simulator: vi.fn(SpiedSimulator) };
});

enableAutoUnmount(afterEach);

function chipValue(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper
        .findAll('dl > div')
        .find((c) => c.get('dt').text() === label)
        ?.get('dd')
        .text();
}

describe('App', () => {
    it('opens in preparation without creating a simulator', () => {
        mount(App);

        expect(useSimulation).not.toHaveBeenCalled();
        expect(createSimulator).not.toHaveBeenCalled();
        expect(Simulator).not.toHaveBeenCalled();
    });

    it('shows the domain defaults', () => {
        const wrapper = mount(App);

        expect(chipValue(wrapper, 'Política')).toBe(DEFAULT_CONFIG.algorithm);
        expect(chipValue(wrapper, 'CPUs')).toBe(
            String(DEFAULT_CONFIG.cpuCount),
        );
        expect(chipValue(wrapper, 'Quantum')).toBe(
            String(DEFAULT_CONFIG.quantum),
        );
        expect(chipValue(wrapper, 'Tick atual')).toBe('–');
    });

    it('renders every action disabled', () => {
        const buttons = mount(App).findAll('button');

        expect(buttons).toHaveLength(13);
        for (const button of buttons) {
            expect(button.attributes('disabled')).toBeDefined();
        }
    });

    it('no longer shows the placeholder counter', () => {
        expect(mount(App).text()).not.toContain('Tick:');
    });
});
