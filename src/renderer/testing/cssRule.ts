// Test-only helpers (this folder is never imported by production code).
// jsdom computes no layout, so CSS rules are pinned by reading the component
// or stylesheet source (`?raw`) and asserting on the rule body.

interface CssRule {
    selectors: string[];
    body: string;
    /** Enclosing at-rule preludes, outermost first, e.g. `@media (...)`. */
    atRules: string[];
}

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');

/** CSS of a `.vue` source (its `<style>` blocks), or the source itself for a `.css` file. */
function stylesOf(source: string) {
    const blocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)];
    return blocks.length > 0 ? blocks.map((b) => b[1]).join('\n') : source;
}

// Walks braces instead of matching one regex, so grouped selectors and rules
// nested in at-rules are found, and an at-rule's `}` is not taken for a rule's.
function parseRules(source: string): CssRule[] {
    const css = stylesOf(source).replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: CssRule[] = [];
    const atRules: string[] = [];
    let prelude = '';

    for (let i = 0; i < css.length; i++) {
        const ch = css[i];
        if (ch === '{') {
            const head = collapse(prelude);
            prelude = '';
            if (head.startsWith('@')) {
                atRules.push(head);
                continue;
            }
            const close = css.indexOf('}', i);
            const end = close === -1 ? css.length : close;
            rules.push({
                selectors: head.split(',').map(collapse),
                body: css.slice(i + 1, end),
                atRules: [...atRules],
            });
            i = end;
        } else if (ch === '}') {
            atRules.pop();
            prelude = '';
        } else if (ch === ';') {
            // Statement at-rules such as `@import ...;` carry no block.
            prelude = '';
        } else {
            prelude += ch;
        }
    }
    return rules;
}

/**
 * Body of the first rule listing `selector` (alone or in a group), comments
 * removed. Without `atRule` only top-level rules match; with it, only rules
 * directly inside that at-rule (prelude compared with whitespace collapsed).
 */
export function ruleBody(
    source: string,
    selector: string,
    atRule?: string,
): string | undefined {
    const wanted = collapse(selector);
    const context = atRule === undefined ? undefined : collapse(atRule);
    return parseRules(source).find(
        (rule) =>
            rule.selectors.includes(wanted) &&
            (context === undefined
                ? rule.atRules.length === 0
                : rule.atRules.at(-1) === context),
    )?.body;
}
