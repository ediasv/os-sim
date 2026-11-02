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

    it('renders 13 buttons and only the loading and editing ones are enabled while preparing', () => {
        const buttons = mount(App).findAll('button');

        expect(buttons).toHaveLength(13);
        const enabled = buttons
            .filter((button) => button.attributes('disabled') === undefined)
            .map((button) => button.text());
        expect(enabled).toEqual([
            'Carregar configuração',
            'Sistema',
            'Adicionar tarefa',
            'Carregar configuração',
            'Adicionar tarefa',
            'Sistema',
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
                'ticks 0–1',
            );
            expect(wrapper.text()).toContain('Imagem salva em "/o/g.svg".');

            await wrapper
                .get('button[aria-label="Fechar mensagem"]')
                .trigger('click');

            expect(wrapper.text()).not.toContain('Imagem salva em');
        });

        it('shows the Gantt chart only once started, one row per task', async () => {
            const wrapper = mount(App);
            await loadFile(wrapper);
            expect(wrapper.find('.gantt-chart').exists()).toBe(false);

            await button(wrapper, 'Avançar tick').trigger('click');

            expect(wrapper.findAll('.gantt-chart [data-task]')).toHaveLength(1);
        });

        it('keeps the future in the chart after stepping back and marks the cursor', async () => {
            const wrapper = mount(App);
            await loadFile(wrapper);
            for (let i = 0; i < 4; i++) {
                await button(wrapper, 'Avançar tick').trigger('click');
            }
            const ticks = () => wrapper.findAll('[data-tick]').length;
            expect(ticks()).toBe(3);

            await button(wrapper, 'Voltar tick').trigger('click');

            expect(ticks()).toBe(3);
            expect(wrapper.get('[data-current]').attributes('x1')).toBe(
                String(2 * 73),
            );
        });

        it('zoom changes the readout and the chart width, within its steps', async () => {
            const wrapper = mount(App);
            await loadFile(wrapper);
            await button(wrapper, 'Avançar tick').trigger('click');
            await button(wrapper, 'Avançar tick').trigger('click');
            const width = () =>
                Number(wrapper.get('[data-task] svg').attributes('width'));
            expect(wrapper.text()).toContain('100%');
            expect(width()).toBe(73);

            await wrapper
                .get('button[aria-label="Aumentar zoom"]')
                .trigger('click');
            expect(wrapper.text()).toContain('150%');
            expect(width()).toBe(73 * 1.5);

            await wrapper
                .get('button[aria-label="Diminuir zoom"]')
                .trigger('click');
            await wrapper
                .get('button[aria-label="Diminuir zoom"]')
                .trigger('click');
            await wrapper
                .get('button[aria-label="Diminuir zoom"]')
                .trigger('click');
            expect(wrapper.text()).toContain('50%');
            expect(
                wrapper
                    .get('button[aria-label="Diminuir zoom"]')
                    .attributes('disabled'),
            ).toBeDefined();
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

describe('App preparation without a file (#36 part 2)', () => {
    const button = (wrapper: ReturnType<typeof mount>, label: string) =>
        wrapper.findAll('button').find((b) => b.text() === label)!;
    const field = (wrapper: ReturnType<typeof mount>, label: string) => {
        const l = wrapper.findAll('label').find((x) => x.text() === label)!;
        return wrapper.get<HTMLInputElement>(`#${l.attributes('for')}`);
    };

    async function addDefaultTask(wrapper: ReturnType<typeof mount>) {
        await button(wrapper, 'Adicionar tarefa').trigger('click');
        await button(wrapper, 'Aplicar').trigger('click');
    }

    it('adds a task from the period 15 and starts without any file', async () => {
        const wrapper = mount(App);

        await button(wrapper, 'Adicionar tarefa').trigger('click');
        expect(field(wrapper, 'Período').element.value).toBe('15');
        await button(wrapper, 'Aplicar').trigger('click');

        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
        expect(wrapper.text()).toContain('1 tarefa configurada');
        await button(wrapper, 'Avançar tick').trigger('click');
        expect(chipValue(wrapper, 'Tick atual')).toBe('0');
        expect(wrapper.text()).toContain('Estado do sistema');
    });

    it('refuses period zero with the reason, keeps the form and changes nothing', async () => {
        const wrapper = mount(App);
        await button(wrapper, 'Adicionar tarefa').trigger('click');

        await field(wrapper, 'Período').setValue('0');
        await button(wrapper, 'Aplicar').trigger('click');

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Toda tarefa precisa de período maior que zero',
        );
        expect(field(wrapper, 'Período').element.value).toBe('0');
        await button(wrapper, 'Cancelar').trigger('click');
        expect(wrapper.text()).toContain('Nenhuma tarefa configurada');
    });

    it('shows the core reason for an invalid field and keeps what was typed', async () => {
        const wrapper = mount(App);
        await button(wrapper, 'Adicionar tarefa').trigger('click');

        await field(wrapper, 'Duração').setValue('0');
        await button(wrapper, 'Aplicar').trigger('click');

        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'maior ou igual a 1',
        );
        expect(field(wrapper, 'Duração').element.value).toBe('0');
    });

    it('changes the system values and shows them in the toolbar', async () => {
        const wrapper = mount(App);

        await button(wrapper, 'Sistema').trigger('click');
        await wrapper.get('select').setValue('EDF');
        await field(wrapper, 'Quantum').setValue('2');
        await field(wrapper, 'Processadores').setValue('3');
        await button(wrapper, 'Aplicar').trigger('click');

        expect(chipValue(wrapper, 'Política')).toBe('EDF');
        expect(chipValue(wrapper, 'Quantum')).toBe('2');
        expect(chipValue(wrapper, 'CPUs')).toBe('3');
    });

    it('shows the core reason for an invalid value and keeps the dialog', async () => {
        const wrapper = mount(App);

        await button(wrapper, 'Sistema').trigger('click');
        await field(wrapper, 'Quantum').setValue('0');
        await button(wrapper, 'Aplicar').trigger('click');

        expect(wrapper.get('[role="dialog"]').text()).toContain('quantum');
        expect(chipValue(wrapper, 'Quantum')).toBe(
            String(DEFAULT_CONFIG.quantum),
        );
        await button(wrapper, 'Cancelar').trigger('click');
    });

    it('edits the selected task and removes it after confirming', async () => {
        const wrapper = mount(App);
        await addDefaultTask(wrapper);

        await button(wrapper, 'Editar tarefa selecionada').trigger('click');
        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Editar Tarefa 1',
        );
        await button(wrapper, 'Remover tarefa').trigger('click');
        expect(wrapper.get('[role="dialog"]').text()).toContain(
            'Remover Tarefa 1?',
        );
        await button(wrapper, 'Cancelar').trigger('click');
        expect(wrapper.text()).toContain('1 tarefa configurada');

        await button(wrapper, 'Editar tarefa selecionada').trigger('click');
        await button(wrapper, 'Remover tarefa').trigger('click');
        await button(wrapper, 'Remover').trigger('click');

        expect(wrapper.text()).toContain('Nenhuma tarefa configurada');
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    });
});
