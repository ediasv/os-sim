<script setup lang="ts">
import { computed } from 'vue';
import { iconUrls, type IconName } from './icons';

// Decorative only: the control around it carries the accessible name.
// Drawn as a mask over currentColor, so the parent's text color tints it.
const props = defineProps<{ name: IconName }>();

// Quoted: small SVGs are inlined as data URLs with single quotes, which an
// unquoted url() rejects, leaving a solid square instead of the glyph.
const style = computed(() => ({
    '--ui-icon': `url("${iconUrls[props.name]}")`,
}));
</script>

<template>
    <span class="ui-icon" aria-hidden="true" :style="style"></span>
</template>

<style scoped>
.ui-icon {
    display: block;
    flex: none;
    width: 16px;
    height: 16px;
    background-color: currentColor;
    -webkit-mask: var(--ui-icon) center / contain no-repeat;
    mask: var(--ui-icon) center / contain no-repeat;
}
</style>
