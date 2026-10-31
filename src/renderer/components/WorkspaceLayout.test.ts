// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ruleBody as cssRuleBody } from './cssRule';
import WorkspaceLayout from './WorkspaceLayout.vue';
// Raw source: jsdom computes no layout, so scroll rules are pinned in the text.
import source from './WorkspaceLayout.vue?raw';

enableAutoUnmount(afterEach);

// Body of the CSS rule whose selector is exactly `selector`.
const ruleBody = (selector: string) => cssRuleBody(source, selector);

describe('WorkspaceLayout', () => {
    it('places each slot in its region', () => {
        const wrapper = mount(WorkspaceLayout, {
            slots: {
                toolbar: '<div id="t">toolbar</div>',
                sidebar: '<div id="s">sidebar</div>',
                default: '<div id="m">main</div>',
            },
        });

        const first = wrapper.element.firstElementChild;
        expect(first?.querySelector('#t')?.textContent).toBe('toolbar');
        expect(wrapper.get('aside[aria-label="Tarefas"] #s').text()).toBe(
            'sidebar',
        );
        expect(wrapper.get('main #m').text()).toBe('main');
    });

    it('regions scroll instead of overflowing the window', () => {
        expect(ruleBody('.workspace__sidebar')).toMatch(/overflow:\s*auto\s*;/);
        expect(ruleBody('.workspace__main')).toMatch(/overflow:\s*auto\s*;/);
        expect(ruleBody('.workspace__main')).toMatch(/min-width:\s*0\s*;/);
    });

    it.each(['.workspace__sidebar', '.workspace__main'])(
        '%s pads and stacks its content per Figma',
        (selector) => {
            const body = ruleBody(selector);

            expect(body).toMatch(/padding:\s*var\(--spacing-lg\)\s*;/);
            expect(body).toMatch(/display:\s*flex\s*;/);
            expect(body).toMatch(/flex-direction:\s*column\s*;/);
            expect(body).toMatch(/gap:\s*var\(--spacing-sm\)\s*;/);
        },
    );
});
