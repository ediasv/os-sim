// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { IconName } from './icons';
import UiIcon from './UiIcon.vue';

enableAutoUnmount(afterEach);

const names: IconName[] = ['alert', 'warning', 'check', 'info', 'close'];

describe('UiIcon', () => {
    it.each(names)('renders a decorative 16px icon for %s', (name) => {
        const wrapper = mount(UiIcon, { props: { name } });
        const icon = wrapper.get('.ui-icon');

        expect(icon.attributes('aria-hidden')).toBe('true');
        expect(icon.text()).toBe('');
        expect(icon.attributes('style')).toMatch(
            new RegExp(
                `url\\("([^"]*${name}\\.svg|data:image/svg\\+xml,[^"]+)"\\)`,
            ),
        );
    });

    // Builds inline small SVGs as data URLs with single quotes, which are
    // invalid inside an unquoted url() and would blank the mask.
    it('quotes the mask URL so inlined data URLs stay valid', () => {
        const wrapper = mount(UiIcon, { props: { name: 'close' } });

        expect(wrapper.get('.ui-icon').attributes('style')).toContain(
            '--ui-icon: url("',
        );
    });
});
