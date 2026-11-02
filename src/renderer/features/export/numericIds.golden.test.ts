/**
 * Characterization of the SVG for a numeric-ID file (#133, DEC-48): lanes,
 * labels and markers must stay byte-identical after IDs become text. The
 * hash was taken before the type change. The renderer has no Node access, so
 * the hash is a small inline one (cyrb53), enough to detect any byte change.
 */
import { describe, expect, it } from 'vitest';
import { createSimulator } from '../../../core/createSimulator';
import { loadConfig } from '../../../core/loadConfig';
import { buildGanttSvg } from './ganttSvg';

const NUMERIC_FILE = [
    'EDF;2;2',
    '10;0000FF;0;3;6;4;',
    '2;00FF00;0;2;4;3;',
    '1;FF0000;1;3;5;5;',
    '',
].join('\n');

function cyrb53(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

describe('numeric-ID SVG', () => {
    it('is unchanged by free-text IDs', () => {
        const loaded = loadConfig(NUMERIC_FILE);
        if (!loaded.ok) throw new Error('fixture must load');
        const sim = createSimulator(loaded.config);
        for (let i = 0; i < 14; i++) sim.tick();
        const svg = buildGanttSvg(sim.getLatestSnapshot());

        expect(cyrb53(svg)).toMatchInlineSnapshot(`"d154813e7234"`);
    });
});
