// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
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
afterEach(() => {
    Reflect.deleteProperty(window, 'configFile');
    Reflect.deleteProperty(window, 'imageFile');
});

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

    it('renders 13 buttons and only the loading ones are enabled while preparing', () => {
        const buttons = mount(App).findAll('button');

        expect(buttons).toHaveLength(13);
        const enabled = buttons
            .filter((button) => button.attributes('disabled') === undefined)
            .map((button) => button.text());
        expect(enabled).toEqual([
            'Carregar configuração',
            'Carregar configuração',
        ]);
    });

    describe('with a loaded file', () => {
        async function loadFile(wrapper: ReturnType<typeof mount>) {
            Object.defineProperty(window, 'configFile', {
                configurable: true,
                value: {
                    openConfigFile: vi.fn().mockResolvedValue({
                        status: 'loaded',
                        path: '/c.txt',
                        text: 'EDF;4;2\n\n1;F0E0D0;0;3;5;5\n',
                    }),
                },
            });
            await wrapper
                .findAll('button')
                .find((b) => b.text() === 'Carregar configuração')!
                .trigger('click');
            await flushPromises();
        }

        function button(wrapper: ReturnType<typeof mount>, label: string) {
            return wrapper.findAll('button').find((b) => b.text() === label)!;
        }

        it('prepares without starting: parameters and task count, no clock', async () => {
            const wrapper = mount(App);

            await loadFile(wrapper);

            expect(chipValue(wrapper, 'Política')).toBe('EDF');
            expect(chipValue(wrapper, 'CPUs')).toBe('2');
            expect(chipValue(wrapper, 'Tick atual')).toBe('–');
            expect(wrapper.text()).toContain('Configuração pronta');
            expect(wrapper.text()).toContain('1 tarefa configurada');
            expect(useSimulation).not.toHaveBeenCalled();
        });

        it('the first "Avançar tick" starts at t = 0 and shows the system and task panels', async () => {
            const wrapper = mount(App);
            await loadFile(wrapper);

            await button(wrapper, 'Avançar tick').trigger('click');

            expect(chipValue(wrapper, 'Tick atual')).toBe('0');
            expect(wrapper.text()).toContain('Estado do sistema');
            expect(wrapper.text()).toContain('snapshot t = 0');
            expect(wrapper.text()).toContain('Tick inspecionado: 0');
            expect(
                button(wrapper, 'Voltar tick').attributes('disabled'),
            ).toBeDefined();
        });

        it('"Exportar SVG" is enabled once started and saves the whole history', async () => {
            const saveImageFile = vi
                .fn()
                .mockResolvedValue({ status: 'saved', path: '/o/g.svg' });
            Object.defineProperty(window, 'imageFile', {
                configurable: true,
                value: { saveImageFile },
            });
            const wrapper = mount(App);
            await loadFile(wrapper);
            expect(
                button(wrapper, 'Exportar SVG').attributes('disabled'),
            ).toBeDefined();
            await button(wrapper, 'Avançar tick').trigger('click');
            await button(wrapper, 'Avançar tick').trigger('click');

            await button(wrapper, 'Exportar SVG').trigger('click');
            await flushPromises();

            expect(saveImageFile).toHaveBeenCalledTimes(1);
            expect(saveImageFile.mock.calls[0][0].content).toContain(
                't = 0 a 1',
            );
            expect(wrapper.text()).toContain('Imagem salva em "/o/g.svg".');
        });

        it('advances, goes back and restarts, updating both panels from the snapshot', async () => {
            const wrapper = mount(App);
            await loadFile(wrapper);
            await button(wrapper, 'Avançar tick').trigger('click');

            await button(wrapper, 'Avançar tick').trigger('click');
            await button(wrapper, 'Avançar tick').trigger('click');
            expect(chipValue(wrapper, 'Tick atual')).toBe('2');
            expect(wrapper.text()).toContain('snapshot t = 2');

            await button(wrapper, 'Voltar tick').trigger('click');
            expect(chipValue(wrapper, 'Tick atual')).toBe('1');
            expect(wrapper.text()).toContain('Tick inspecionado: 1');

            await button(wrapper, 'Reiniciar').trigger('click');
            expect(chipValue(wrapper, 'Tick atual')).toBe('0');
        });
    });

    it('no longer shows the placeholder counter', () => {
        expect(mount(App).text()).not.toContain('Tick:');
    });
});
