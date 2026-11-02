import { describe, expect, it } from 'vitest';
import { ruleBody } from './cssRule';

describe('ruleBody', () => {
    it('reads only the <style> blocks of a .vue source', () => {
        const sfc = `<script setup lang="ts">
const style = { '.a': 1 };
</script>
<template><div class="a"></div></template>
<style scoped>
.a { color: red; }
</style>`;

        expect(ruleBody(sfc, '.a')).toBe(' color: red; ');
    });

    it('matches the exact selector, not a longer one', () => {
        const css = '.a__b { gap: 1px; }\n.a { gap: 2px; }';

        expect(ruleBody(css, '.a')).toBe(' gap: 2px; ');
    });

    it('finds a selector inside a group, ignoring comments', () => {
        const css = '/* .b { x: 0 } */\n.a,\n.b { margin: 0; }';

        expect(ruleBody(css, '.b')).toBe(' margin: 0; ');
        expect(ruleBody(css, '.a')).toBe(' margin: 0; ');
    });

    it('separates top-level rules from rules inside an at-rule', () => {
        const css = `@import url(x.css);
@media (max-width: 600px) {
    .a { display: none; }
}
.a { display: flex; }`;

        expect(ruleBody(css, '.a')).toBe(' display: flex; ');
        expect(ruleBody(css, '.a', '@media (max-width:  600px)')).toBe(
            ' display: none; ',
        );
        expect(ruleBody(css, '.a', '@media print')).toBeUndefined();
    });

    it('returns undefined for a missing selector', () => {
        expect(ruleBody('.a { x: 1; }', '.b')).toBeUndefined();
    });
});
