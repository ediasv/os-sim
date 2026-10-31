// Test-only helper: jsdom computes no layout, so CSS rules are pinned by
// reading the component source (`?raw`) and asserting on the rule body.

/** Body of the CSS rule whose selector is exactly `selector`, comments removed. */
export function ruleBody(source: string, selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(
        css,
    )?.[1];
}
