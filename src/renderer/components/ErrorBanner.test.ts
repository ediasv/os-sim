// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { currentError, dismissError, reportError } from '../errors';
import ErrorBanner from './ErrorBanner.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
    dismissError();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    dismissError();
    vi.restoreAllMocks();
});

describe('ErrorBanner', () => {
    it('renders an error reported after mounting, but no alert initially', async () => {
        const wrapper = mount(ErrorBanner);
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);

        const error = new Error('Unexpected simulation failure');
        reportError(error);
        await nextTick();

        expect(wrapper.get('[role="alert"]').text()).toContain(error.message);
        expect(wrapper.get('button').attributes('aria-label')).toBe(
            'Fechar mensagem de erro',
        );
        expect(console.error).toHaveBeenCalledWith(error);
    });

    it('shows the error message unchanged', async () => {
        const wrapper = mount(ErrorBanner);
        const error = new Error('  falha <b>inesperada</b>\n  no tick 3 ');

        reportError(error);
        await nextTick();

        expect(wrapper.get('.ui-alert__message').element.textContent).toBe(
            error.message,
        );
    });

    it('dismisses an error by clicking and displays a subsequent error', async () => {
        reportError(new Error('First failure'));
        const wrapper = mount(ErrorBanner);
        expect(wrapper.get('[role="alert"]').text()).toContain('First failure');

        await wrapper.get('button').trigger('click');

        expect(currentError.value).toBeNull();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);

        reportError(new Error('Next failure'));
        await nextTick();

        expect(wrapper.get('[role="alert"]').text()).toContain('Next failure');
    });
});
