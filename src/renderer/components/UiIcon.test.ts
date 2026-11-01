// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { IconName } from './icons';
import { ruleBody } from '../testing/cssRule';
import UiIcon from './UiIcon.vue';
import source from './UiIcon.vue?raw';

enableAutoUnmount(afterEach);

const names: IconName[] = [
    'alert',
    'warning',
    'check',
    'info',
    'close',
    'folder',
    'settings',
    'step-back',
    'step-forward',
    'restart',
    'run-all',
    'plus',
    'minus',
    'download',
];

describe('UiIcon', () => {
    it.each(names)('renders a decorative 16px icon for %s', (name) => {
        const wrapper = mount(UiIcon, { props: { name } });
        const icon = wrapper.get('.ui-icon');

        expect(icon.attributes('aria-hidden')).toBe('true');
        expect(icon.text()).toBe('');
        expect(icon.attributes('style')).toContain('--ui-icon-size: 16px');
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

    it('renders at 32px when size is 32', () => {
        const icon = mount(UiIcon, { props: { name: 'folder', size: 32 } }).get(
            '.ui-icon',
        );

        expect(icon.attributes('style')).toContain('--ui-icon-size: 32px');
    });

    // An inline width/height would beat any parent rule; the custom property
    // keeps `.parent :deep(.ui-icon) { width: ... }` effective.
    it('sizes from CSS through --ui-icon-size, not inline width/height', () => {
        const style = mount(UiIcon, { props: { name: 'plus' } })
            .get('.ui-icon')
            .attributes('style');
        const body = ruleBody(source, '.ui-icon');

        expect(style).not.toMatch(/(^|;)\s*(width|height):/);
        expect(body).toMatch(/width:\s*var\(--ui-icon-size\)\s*;/);
        expect(body).toMatch(/height:\s*var\(--ui-icon-size\)\s*;/);
    });
});
