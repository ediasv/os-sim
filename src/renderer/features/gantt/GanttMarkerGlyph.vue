<script setup lang="ts">
import type { MarkerKind } from './ganttModel';
import { MARKER_SHAPES } from './markerShapes';

// One event marker inside its 12 x 12 box. Used by the chart and by the
// legend so both show the same shape; colors come from the theme tokens.
defineProps<{ kind: MarkerKind }>();
</script>

<template>
    <component
        :is="part.tag"
        v-for="(part, index) in MARKER_SHAPES[kind]"
        :key="index"
        v-bind="part.attrs"
        :class="['glyph', `glyph--${part.mode}`, `glyph--${part.paint}`]"
        :stroke-width="part.strokeWidth"
    />
</template>

<style scoped>
.glyph--text {
    --paint: var(--color-text-primary);
}

.glyph--success {
    --paint: var(--color-status-success);
}

.glyph--danger {
    --paint: var(--color-status-danger);
}

.glyph--warning {
    --paint: var(--color-status-warning);
}

.glyph--accent {
    --paint: var(--color-accent-default);
}

.glyph--fill {
    fill: var(--paint);
}

.glyph--outline {
    fill: none;
    stroke: var(--paint);
}

.glyph--line {
    stroke: var(--paint);
}
</style>
