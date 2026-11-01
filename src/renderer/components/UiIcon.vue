<script setup lang="ts">
import { computed } from 'vue';
import { iconUrls, type IconName } from './icons';

// Decorative only: the control around it carries the accessible name.
// Drawn as a mask over currentColor, so the parent's text color tints it.
const props = withDefaults(defineProps<{ name: IconName; size?: 16 | 32 }>(), {
    size: 16,
});

// The size travels as a custom property, not an inline width/height, so a
// parent can still resize the icon from CSS (inline styles beat any rule).
// Quoted: small SVGs are inlined as data URLs with single quotes, which an
// unquoted url() rejects, leaving a solid square instead of the glyph.
const style = computed(() => ({
    '--ui-icon': `url("${iconUrls[props.name]}")`,
    '--ui-icon-size': `${props.size}px`,
}));
</script>

<template>
    <span class="ui-icon" aria-hidden="true" :style="style"></span>
</template>

<style scoped>
.ui-icon {
    display: block;
    flex: none;
    width: var(--ui-icon-size);
    height: var(--ui-icon-size);
    background-color: currentColor;
    -webkit-mask: var(--ui-icon) center / contain no-repeat;
    mask: var(--ui-icon) center / contain no-repeat;
}
</style>
