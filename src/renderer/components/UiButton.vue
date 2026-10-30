<script setup lang="ts">
// The caller decides whether the action is available; the button only
// reports the intent. Native `disabled` blocks mouse and keyboard alike.
withDefaults(
    defineProps<{
        variant?: 'primary' | 'secondary' | 'accent' | 'danger';
        disabled?: boolean;
    }>(),
    { variant: 'secondary', disabled: false },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
    <button
        type="button"
        class="ui-button"
        :class="`ui-button--${variant}`"
        :disabled="disabled"
        @click="emit('click', $event)"
    >
        <span v-if="$slots.icon" class="ui-button__icon" aria-hidden="true">
            <slot name="icon" />
        </span>
        <slot />
    </button>
</template>

<style scoped>
/* Figma "Button": every variant keeps a 1px border so states never resize. */
.ui-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    height: 36px;
    padding-inline: var(--spacing-md);
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    font: var(--font-label-md);
    white-space: nowrap;
    cursor: pointer;
}

.ui-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.ui-button__icon {
    display: inline-flex;
    width: 16px;
    height: 16px;
}

.ui-button--primary {
    background: var(--color-accent-default);
    color: var(--color-text-on-color);
}

.ui-button--secondary {
    background: var(--color-bg-raised);
    border-color: var(--color-border-default);
    color: var(--color-text-primary);
}

/* Deviation: Figma's text is accent-default; -text keeps 4.5:1 (#68). */
.ui-button--accent {
    background: var(--color-bg-raised);
    border-color: var(--color-accent-default);
    color: var(--color-accent-text);
}

.ui-button--danger {
    background: var(--color-status-danger);
    color: var(--color-text-on-color);
}
</style>
